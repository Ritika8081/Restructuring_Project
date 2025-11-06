'use client';
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { Notch, createFilterInstance } from './filters';

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
  // Subscribe to control events from the provider (e.g. filter changed)
  subscribeToControlEvents?: (onEvent: (e: { type: string; channelIndex?: number }) => void) => () => void;
  // Provide a mapping from channel index -> filter config so the provider
  // can apply filters before emitting samples. The map keys are zero-based
  // channel indices. The filter config shape is permissive to allow future
  // filter types.
  setChannelFilters?: (map: Record<number, { enabled?: boolean, filterType?: string, filterKeys?: string[], filterKey?: string, notchFreq?: number, samplingRate?: number }>) => void;
  // When the device/connection knows the sampling rate for a channel,
  // call this to let the provider create any pending filter instances
  // that were waiting for a sampling rate. Accepts 0-based channel idx.
  setChannelSamplingRate?: (channelIndex: number, samplingRate: number) => void;
  // Current global sampling rate (if known) and setter. The UI or connection layer
  // can call setSamplingRate when a device connection reports its sample rate.
  samplingRate?: number;
  setSamplingRate?: (sr: number) => void;
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
  const channelFiltersRef = useRef<Record<number, { enabled?: boolean, filterType?: string, filterKeys?: string[], filterKey?: string, notchFreq?: number, samplingRate?: number }>>({});
  // Per-channel filter instances (stateful). Lazily created when needed.
  // We store instances per-channel as a map: channelIndex -> { [filterKey]: instance }
  const filterInstancesRef = useRef<Record<number, Record<string, any>>>({});
  // Global sampling rate (device-level). We keep a state so components can read it.
  const [samplingRate, setSamplingRateState] = useState<number | undefined>(undefined);
  // Queue of incoming samples to be flushed on the next animation frame.
  // This batches high-frequency producers to avoid React render storms.
  const incomingSampleQueueRef = useRef<any[]>([]);
  const rafHandleRef = useRef<number | null>(null);
  const lastCounterRef = useRef<number | null>(null);
  const lastOkFlushTimeRef = useRef<number>(0);
  const lastAddLogRef = useRef<number>(0);
  const sampleSeqRef = useRef<number>(0);
  const subscribersRef = useRef<Set<(s: ChannelSample[]) => void>>(new Set());
  const controlSubscribersRef = useRef<Set<(e: { type: string; channelIndex?: number }) => void>>(new Set());
  // Track observed per-channel raw maximums to infer ADC range (helps when
  // devices use 10/12/14-bit ADCs packed into 16-bit fields). This lets us
  // normalize correctly even if the device doesn't use full 16-bit range.
  const channelObservedMaxRef = useRef<Record<number, number>>({});
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
    try { console.info('[ChannelData] setRegisteredChannels', { ids, registeredIndices: Array.from(s).sort((a, b) => a - b) }); } catch (e) { }
  }, []);

  const addSample = useCallback((sample: ChannelSample) => {
    try {
      const processed: any = {};
      // Keep a copy of the raw incoming sample for debugging/tracing.
      try { (processed as any)._raw = { ...(sample as any) }; } catch (e) { }
      // We'll infer an effective per-channel FULL_SCALE from observed raw
      // maxima so devices that use 10/12/14-bit ADC ranges (packed into
      // 16-bit fields) are normalized correctly.
      for (let i = 0; i < 16; i++) {
        const key = `ch${i}`;
        if ((sample as any)[key] === undefined) break;
        // Read raw numeric sample value from device
        const rawVal = Number((sample as any)[key]);
        // Update observed per-channel max
        try {
          const prevMax = channelObservedMaxRef.current[i] || 0;
          const newMax = Math.max(prevMax, rawVal);
          channelObservedMaxRef.current = { ...channelObservedMaxRef.current, [i]: newMax };
        } catch (e) { }

        // Infer an effective FULL_SCALE for this channel based on observed
        // max. Use the smallest power-of-two >= (observedMax + 1). Fallback
        // to 2^16 when unknown.
        let effectiveFullScale = 2 ** 16;
        try {
          const obs = channelObservedMaxRef.current[i] || 0;
          if (obs > 0 && obs < (2 ** 16)) {
            const bits = Math.ceil(Math.log2(obs + 1));
            effectiveFullScale = 2 ** bits;
          }
        } catch (e) { effectiveFullScale = 2 ** 16; }

        const Y_SCALE = 2 / effectiveFullScale;

        // Center raw ADC counts before filtering so filters operate on signed data
        let value = registeredChannelIndices.current.has(i) ? (rawVal - (effectiveFullScale / 2)) : 0;
        // Apply filter if configured for this channel
        try {
          const cfg = channelFiltersRef.current[i];
          if (cfg && cfg.enabled) {
            // Build list of keys to apply (prefer explicit filterKeys array)
            const keys: string[] = [];
            if (Array.isArray(cfg.filterKeys)) keys.push(...cfg.filterKeys);
            if (cfg.filterKey) keys.push(cfg.filterKey);
            // legacy support: single notch spec
            if (!keys.length && cfg.filterType === 'notch') {
              keys.push(`notch-${cfg.notchFreq === 60 ? 60 : 50}`);
            }

            if (keys.length > 0) {
              // Ensure per-channel instance map exists
              if (!filterInstancesRef.current[i]) filterInstancesRef.current[i] = {};
              const instMap = filterInstancesRef.current[i];
              for (const k of keys) {
                let inst = instMap[k];
                if (!inst) {
                  if (cfg.samplingRate) {
                    inst = createFilterInstance(k, cfg.samplingRate) || null;
                    instMap[k] = inst;
                    try { console.debug(`[ChannelData] created filter instance (on-sample) for ch${i}: ${k}`); } catch (e) { }
                  } else {
                    // sampling rate not available yet; skip this key for now
                    continue;
                  }
                }
                if (inst && typeof inst.process === 'function') {
                  try { console.debug(`[ChannelData] applying filter ch${i}: ${k} @ ${cfg.samplingRate || 'unknown'}Hz`); } catch (e) { }
                  // process on centered counts
                  value = inst.process(value);
                }
              }
            }
          }
        } catch (err) {
          // If filtering fails for any reason, fall back to raw value
        }
        // After filtering (which operated on centered counts), convert to normalized -1..1
        try {
          processed[key] = (typeof value === 'number') ? (value * Y_SCALE) : 0;
        } catch (e) {
          processed[key] = 0;
        }
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
          try { console.debug('[ChannelData] queued sample counter', { counter: cnt, registered: Array.from(registeredChannelIndices.current).sort((a, b) => a - b) }); } catch (e) { }
        }
      } catch (err) { }

      // Debug: lightweight log
      try {
        const regs = Array.from(registeredChannelIndices.current).sort((a, b) => a - b);
        console.debug('[ChannelData] queueSample', { registeredIndices: regs, incoming: sample });
      } catch (err) { }

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
    try { setSnapshot([]); } catch (err) { }
    lastCounterRef.current = null;
  }, []);

  const subscribeToSampleBatches = useCallback((onSampleBatch: (s: ChannelSample[]) => void) => {
    subscribersRef.current.add(onSampleBatch);
    return () => { subscribersRef.current.delete(onSampleBatch); };
  }, []);

  const subscribeToControlEvents = useCallback((onEvent: (e: { type: string; channelIndex?: number }) => void) => {
    controlSubscribersRef.current.add(onEvent);
    return () => { controlSubscribersRef.current.delete(onEvent); };
  }, []);

  const setChannelFilters = useCallback((map: Record<number, { enabled?: boolean, filterType?: string, filterKeys?: string[], filterKey?: string, notchFreq?: number, samplingRate?: number }>) => {
    channelFiltersRef.current = map || {};
    // Update/create filter instances where applicable
    try {
      Object.keys(map || {}).forEach(k => {
        const idx = parseInt(k, 10);
        const cfg = (map as any)[k];
        if (cfg && cfg.enabled) {
          // If the config doesn't include a per-channel samplingRate but the
          // provider knows a global samplingRate, adopt it so we can create
          // filter instances immediately instead of waiting for a per-channel
          // setChannelSamplingRate call.
          if (!cfg.samplingRate && samplingRate) {
            cfg.samplingRate = samplingRate;
            // persist back to the stored map
            channelFiltersRef.current = { ...channelFiltersRef.current, [idx]: cfg };
          }

          // Build list of keys to create (prefer explicit filterKeys array)
          const keys: string[] = [];
          if (Array.isArray(cfg.filterKeys)) keys.push(...cfg.filterKeys);
          if (cfg.filterKey) keys.push(cfg.filterKey);
          if (!keys.length && cfg.filterType === 'notch') {
            keys.push(`notch-${cfg.notchFreq === 60 ? 60 : 50}`);
          }

          if (keys.length > 0) {
            if (!filterInstancesRef.current[idx]) filterInstancesRef.current[idx] = {};
            const instMap = filterInstancesRef.current[idx];
            for (const key of keys) {
              if (cfg.samplingRate) {
                const inst = createFilterInstance(key, cfg.samplingRate) || null;
                instMap[key] = inst;
                try { console.info(`[ChannelData] ch${idx} filter: ${key} @ ${cfg.samplingRate} Hz`); } catch (e) { }
              } else {
                try { console.info(`[ChannelData] ch${idx} filter configured: ${key} - sampling rate pending`); } catch (e) { }
              }
            }
            // Notify listeners (e.g., plotting components) that filters for this channel changed
            try {
              controlSubscribersRef.current.forEach(fn => {
                try { fn({ type: 'filterChanged', channelIndex: idx }); } catch (e) { /* ignore per-subscriber errors */ }
              });
            } catch (e) { /* ignore */ }
          } else if (cfg.filterType) {
            try { console.info(`[ChannelData] ch${idx} filter configured (legacy): ${cfg.filterType}`); } catch (e) { }
          }
        }
      });
    } catch (err) { /* ignore */ }
    try { console.info('[ChannelData] setChannelFilters', map); } catch (e) { }
  }, [samplingRate]);

  // Called when the sampling rate for a specific channel becomes known.
  // This updates the stored config and creates filter instances that were
  // previously pending due to missing sampling rate.
  const setChannelSamplingRate = useCallback((channelIndex: number, samplingRate: number) => {
    try {
      const cfg = channelFiltersRef.current[channelIndex] || {};
      cfg.samplingRate = samplingRate;
      channelFiltersRef.current = { ...channelFiltersRef.current, [channelIndex]: cfg };
      // Ensure instance map exists
      if (!filterInstancesRef.current[channelIndex]) filterInstancesRef.current[channelIndex] = {};
      const instMap = filterInstancesRef.current[channelIndex];
      // Build keys list (prefer explicit array)
      const keys: string[] = [];
      if (Array.isArray(cfg.filterKeys)) keys.push(...cfg.filterKeys);
      if (cfg.filterKey) keys.push(cfg.filterKey);
      if (!keys.length && cfg.filterType === 'notch') {
        keys.push(`notch-${cfg.notchFreq === 60 ? 60 : 50}`);
      }
      for (const key of keys) {
        if (!instMap[key]) {
          const inst = createFilterInstance(key, samplingRate) || null;
          instMap[key] = inst;
          try { console.info(`[ChannelData] ch${channelIndex} filter created (on-sr): ${key} @ ${samplingRate} Hz`); } catch (e) { }
        }
      }
      try { console.info('[ChannelData] setChannelSamplingRate', { channelIndex, samplingRate }); } catch (e) { }
    } catch (err) {
      // swallow
    }
  }, []);

  // Set a global sampling rate. When provided, create any pending filter
  // instances for configured channels that were waiting for a sampling rate.
  const setSamplingRate = useCallback((sr: number) => {
    try {
      setSamplingRateState(sr);
      const map = channelFiltersRef.current || {};
      Object.keys(map).forEach(k => {
        const idx = parseInt(k, 10);
        const cfg = (map as any)[k] || {};
        // If the channel doesn't have its own samplingRate, adopt the global one
        if (!cfg.samplingRate) cfg.samplingRate = sr;
        // persist the updated config
        channelFiltersRef.current = { ...channelFiltersRef.current, [idx]: cfg };

        if (!filterInstancesRef.current[idx]) filterInstancesRef.current[idx] = {};
        const instMap = filterInstancesRef.current[idx];
        const keys: string[] = [];
        if (Array.isArray(cfg.filterKeys)) keys.push(...cfg.filterKeys);
        if (cfg.filterKey) keys.push(cfg.filterKey);
        if (!keys.length && cfg.filterType === 'notch') {
          keys.push(`notch-${cfg.notchFreq === 60 ? 60 : 50}`);
        }
        for (const key of keys) {
          if (!instMap[key]) {
            const inst = createFilterInstance(key, sr) || null;
            instMap[key] = inst;
            try { console.info(`[ChannelData] ch${idx} filter created (on-global-sr): ${key} @ ${sr} Hz`); } catch (e) { }
          }
        }
      });
      try { console.info('[ChannelData] setSamplingRate', sr); } catch (e) { }
    } catch (err) {
      // swallow
    }
  }, []);

  // Cleanup pending RAF when provider unmounts
  useEffect(() => {
    return () => {
      try {
        if (rafHandleRef.current) cancelAnimationFrame(rafHandleRef.current);
      } catch (err) { }
    };
  }, []);

  return (
    <ChannelDataContext.Provider value={{ samples: snapshot, addSample, addSampleRef, clearSamples, setRegisteredChannels, subscribeToSampleBatches, setChannelFilters, setChannelSamplingRate, samplingRate, setSamplingRate }}>
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
