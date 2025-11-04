 'use client';
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { Notch } from './filters';

/**
 * src/lib/channelDataContext.tsx
 *
 * Purpose: React context provider that holds recent channel samples coming
 * from the device connection layer. Components can subscribe via
 * `useChannelData()` to get the live sample buffer and helper methods.
 *
 * Exports:
 *  - ChannelDataProvider React component (wrap at app root)
 *  - useChannelData() hook
 *
 * Notes: Keeps a bounded buffer (last ~512 samples) to limit memory use.
 */

export type ChannelSample = {
  ch0: number;
  ch1: number;
  ch2: number;
  timestamp?: number;
  counter?: number;
};

export type ChannelDataContextType = {
  samples: ChannelSample[];
  addSample: (sample: ChannelSample) => void;
  // Optional ref exposing the addSample function for high-frequency producers
  addSampleRef?: React.MutableRefObject<((sample: ChannelSample) => void) | null>;
  clearSamples: () => void;
  // Register which flowchart channel nodes should receive data.
  // Provide list of flow node ids (e.g. ['channel-0','channel-1']).
  // NOTE: channel ids are zero-based (channel-0 -> index 0).
  setRegisteredChannels: (ids: string[]) => void;
  // Subscribe to incoming sample BATCHES. The callback receives an array of
  // ChannelSample objects flushed in the most recent animation frame.
  // This is a subscription to sample "batches" that the provider emits
  // on each rAF flush. Use the returned function to unsubscribe.
  subscribeToSampleBatches?: (onSampleBatch: (samples: ChannelSample[]) => void) => () => void;
  // Provide a mapping from channel index -> filter config so the provider
  // can apply filters before emitting samples. The map keys are zero-based
  // channel indices. The filter config shape is permissive to allow future
  // filter types.
  setChannelFilters?: (map: Record<number, { enabled?: boolean, filterType?: string, notchFreq?: number, samplingRate?: number }>) => void;
};

const ChannelDataContext = createContext<ChannelDataContextType | undefined>(undefined);

export const ChannelDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // High-frequency live buffer (ref) and a low-frequency React snapshot for
  // components that rely on React re-renders. This avoids re-render storms.
  const samplesRef = useRef<ChannelSample[]>([]);
  const [snapshot, setSnapshot] = useState<ChannelSample[]>([]);
  const lastSnapshotTimeRef = useRef<number>(0);
  const SNAPSHOT_INTERVAL_MS = 200; // throttle UI-visible snapshot updates
  // Track which channel indices (0-based) are currently present in the flowchart.
  // We keep this in a ref for cheap lookups inside addSample.
  const registeredChannelIndices = useRef<Set<number>>(new Set());
  // Map of channel index -> active filter config
  const channelFiltersRef = useRef<Record<number, { enabled?: boolean, filterType?: string, notchFreq?: number, samplingRate?: number }>>({});
  // Per-channel filter instances (stateful). Lazily created when needed.
  const filterInstancesRef = useRef<Record<number, Notch | null>>({});
  // Queue of incoming samples to be flushed on the next animation frame.
  // This batches high-frequency producers to avoid React render storms.
  const incomingSampleQueueRef = useRef<any[]>([]);
  const rafHandleRef = useRef<number | null>(null);
  const lastCounterRef = useRef<number | null>(null);
  const lastOkFlushTimeRef = useRef<number>(0);
  const lastAddLogRef = useRef<number>(0);
  const sampleSeqRef = useRef<number>(0);
  const subscribersRef = useRef<Set<(s: ChannelSample[]) => void>>(new Set());
  // Expose addSample via a ref for high-frequency consumers that run
  // outside React lifecycles (e.g. BLE notification handlers).
  const addSampleRef = useRef<((sample: ChannelSample) => void) | null>(null);

  const setRegisteredChannels = useCallback((ids: string[]) => {
    const s = new Set<number>();
    (ids || []).forEach(id => {
      try {
        const m = String(id).match(/channel-(\d+)/i);
        if (m) {
          // Now treating channel ids as 0-based: 'channel-0' -> index 0
          const idx = Math.max(0, parseInt(m[1], 10));
          s.add(idx);
        }
      } catch (err) {
        // ignore malformed ids
      }
    });
    registeredChannelIndices.current = s;
    try { console.info('[ChannelData] setRegisteredChannels', { ids, registeredIndices: Array.from(s).sort((a,b)=>a-b) }); } catch (e) {}
  }, []);

  const addSample = useCallback((sample: ChannelSample) => {
    try {
      const processed: any = {};
      // Keep a copy of the raw incoming sample for debugging/tracing.
      try { (processed as any)._raw = { ...(sample as any) }; } catch (e) {}
      for (let i = 0; i < 16; i++) {
        const key = `ch${i}`;
        if ((sample as any)[key] === undefined) break;
        let value = registeredChannelIndices.current.has(i) ? (sample as any)[key] : 0;
        // Apply filter if configured for this channel
        try {
          const cfg = channelFiltersRef.current[i];
          if (cfg && cfg.enabled) {
            // Support only notch for now
            if (cfg.filterType === 'notch') {
              // Lazily create Notch instance per-channel
              let inst = filterInstancesRef.current[i];
              if (!inst) {
                inst = new Notch();
                filterInstancesRef.current[i] = inst;
                try { console.debug(`[ChannelData] created Notch instance (on-sample) for ch${i}`); } catch (e) {}
              }
              // Ensure sampling rate is set when available
              if (cfg.samplingRate) inst.setbits(cfg.samplingRate);
              try { console.debug(`[ChannelData] applying filter ch${i}: ${cfg.filterType} notch ${cfg.notchFreq}Hz @ ${cfg.samplingRate || 'unknown'}Hz`); } catch (e) {}
              const type = cfg.notchFreq === 60 ? 2 : 1;
              value = inst.process(value, type);
            }
          }
        } catch (err) {
          // If filtering fails for any reason, fall back to raw value
        }
        processed[key] = value;
      }
  if ((sample as any).timestamp) processed.timestamp = (sample as any).timestamp;
  if ((sample as any).counter !== undefined) processed.counter = (sample as any).counter;

        // Queue sample for batched flush on the next animation frame
        // Attach a monotonic sequence id to help trace ordering across layers
        sampleSeqRef.current = (sampleSeqRef.current + 1) % 1000000;
        (processed as any)._seq = sampleSeqRef.current;
        incomingSampleQueueRef.current.push(processed as ChannelSample);

      // Rate-limited incoming-sample debug to help trace counters end-to-end
      try {
        const now = Date.now();
        if (now - lastAddLogRef.current > 200) {
          lastAddLogRef.current = now;
          const cnt = (sample as any).counter;
          try { console.debug('[ChannelData] queued sample counter', { counter: cnt, registered: Array.from(registeredChannelIndices.current).sort((a,b)=>a-b) }); } catch (e) {}
        }
      } catch (err) {}

      // Debug: lightweight log
      try {
        const regs = Array.from(registeredChannelIndices.current).sort((a,b) => a-b);
        console.debug('[ChannelData] queueSample', { registeredIndices: regs, incoming: sample });
      } catch (err) {}

      if (rafHandleRef.current == null) {
        rafHandleRef.current = requestAnimationFrame(() => {
          try {
            const sampleBatch = incomingSampleQueueRef.current.splice(0);
            if (sampleBatch.length === 0) return;
              // detect dropped counters across the emitted sample batch
              try {
                const counters: number[] = []
                for (const s of sampleBatch) {
                  if ((s as any).counter !== undefined) {
                    const cur = (s as any).counter as number;
                    counters.push(cur);
                    const last = lastCounterRef.current;
                    if (last !== null) {
                      const diff = (cur - last + 256) % 256;
                      if (diff > 1) {
                        console.warn('[ChannelData] detected sample drop(s)', { last, current: cur, missing: diff - 1 });
                      }
                    }
                    lastCounterRef.current = cur;
                  }
                }
                // Summarize the flushed batch counters (lightweight)
                if (counters.length > 0) {
                  try {
                    const first = counters[0]
                    const last = counters[counters.length - 1]
                    // Compute total missing inside this flushed batch
                    let totalMissing = 0
                    for (let i = 1; i < counters.length; i++) {
                      const prev = counters[i - 1]
                      const cur = counters[i]
                      const d = (cur - prev + 256) % 256
                      if (d > 1) totalMissing += (d - 1)
                    }
                    // Always emit a debug-level summary; escalate to warn if gaps exist
                    if (totalMissing > 0) {
                      console.warn('[ChannelData] batch detected missing samples', { batchSize: sampleBatch.length, first, last, missing: totalMissing })
                    } else {
                      // Rate-limit positive confirmation to avoid noisy logs
                      try {
                        const now = Date.now()
                        if (now - lastOkFlushTimeRef.current > 5000) {
                          console.info('[ChannelData] batch OK: no missing samples', { batchSize: sampleBatch.length, first, last })
                          lastOkFlushTimeRef.current = now
                        } else {
                          console.debug('[ChannelData] batch', { batchSize: sampleBatch.length, first, last })
                        }
                      } catch (err) {
                        console.debug('[ChannelData] batch', { batchSize: sampleBatch.length, first, last })
                      }
                    }
                  } catch (err) { }
                }
              } catch (err) {
                // ignore counter-check errors
              }

            // Merge flushed samples into the live ref buffer (bounded)
            try {
              const sliced = samplesRef.current.slice(-511);
              const merged = [...sliced, ...sampleBatch];
              samplesRef.current = merged.slice(-512);
            } catch (err) {
              // ignore
            }
            // Update a low-frequency React-visible snapshot so consumers who
            // use `samples` from context still re-render occasionally.
            try {
              const now = Date.now();
              if (now - lastSnapshotTimeRef.current >= SNAPSHOT_INTERVAL_MS) {
                lastSnapshotTimeRef.current = now;
                // Provide a shallow copy to avoid accidental mutation by callers
                setSnapshot(samplesRef.current.slice());
              }
            } catch (err) {
              // ignore
            }
            // Notify subscribers with the emitted sample batch
            try {
              subscribersRef.current.forEach(subscriber => {
                try { subscriber(sampleBatch.slice()); } catch (err) { /* ignore per-subscriber errors */ }
              });
            } catch (err) { /* swallow */ }
          } catch (err) {
            // swallow
          } finally {
            if (rafHandleRef.current) {
              rafHandleRef.current = null;
            }
          }
        });
      }
    } catch (err) {
      // swallow
    }
  }, []);

  // Keep the exported ref up-to-date with the latest addSample implementation
  useEffect(() => {
    addSampleRef.current = addSample;
  }, [addSample]);

  const clearSamples = useCallback(() => {
    samplesRef.current = [];
    try { setSnapshot([]); } catch (err) {}
    lastCounterRef.current = null;
  }, []);

  const subscribeToSampleBatches = useCallback((onSampleBatch: (s: ChannelSample[]) => void) => {
    subscribersRef.current.add(onSampleBatch);
    return () => { subscribersRef.current.delete(onSampleBatch); };
  }, []);

    const setChannelFilters = useCallback((map: Record<number, { enabled?: boolean, filterType?: string, notchFreq?: number, samplingRate?: number }>) => {
    channelFiltersRef.current = map || {};
    // Update existing filter instances sampling rate where applicable
    try {
      Object.keys(map || {}).forEach(k => {
        const idx = parseInt(k, 10);
        const cfg = (map as any)[k];
        if (cfg && cfg.enabled && cfg.filterType === 'notch') {
          let inst = filterInstancesRef.current[idx];
          if (!inst) {
            inst = new Notch();
            filterInstancesRef.current[idx] = inst;
            try { console.info(`[ChannelData] created Notch instance for ch${idx}`); } catch (e) {}
          }
          if (cfg.samplingRate) {
            inst.setbits(cfg.samplingRate);
            try { console.info(`[ChannelData] ch${idx} filter: ${cfg.filterType} (notch ${cfg.notchFreq} Hz) @ ${cfg.samplingRate} Hz`); } catch (e) {}
          } else {
            try { console.info(`[ChannelData] ch${idx} filter: ${cfg.filterType} (notch ${cfg.notchFreq} Hz) - sampling rate pending`); } catch (e) {}
          }
        } else if (cfg && cfg.enabled) {
          try { console.info(`[ChannelData] ch${idx} filter configured: ${cfg.filterType || 'unknown'}`); } catch (e) {}
        }
      });
    } catch (err) { /* ignore */ }
    try { console.info('[ChannelData] setChannelFilters', map); } catch (e) {}
  }, []);

  // Cleanup pending RAF when provider unmounts
  useEffect(() => {
    return () => {
      try {
        if (rafHandleRef.current) cancelAnimationFrame(rafHandleRef.current);
      } catch (err) {}
    };
  }, []);

  return (
    <ChannelDataContext.Provider value={{ samples: snapshot, addSample, addSampleRef, clearSamples, setRegisteredChannels, subscribeToSampleBatches, setChannelFilters }}>
      {children}
    </ChannelDataContext.Provider>
  );
};

// Cleanup any pending rAF on unmount — (not strictly required but tidy)
// Note: the provider is long-lived in our app, but add for completeness.
// (We can't use hooks outside component, so nothing else required.)

export const useChannelData = () => {
  const ctx = useContext(ChannelDataContext);
  if (!ctx) throw new Error('useChannelData must be used within ChannelDataProvider');
  return ctx;
};
