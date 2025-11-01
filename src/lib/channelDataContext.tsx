 'use client';
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

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
  clearSamples: () => void;
  // Register which flowchart channel nodes should receive data.
  // Provide list of flow node ids (e.g. ['channel-1','channel-2']).
  setRegisteredChannels: (ids: string[]) => void;
  // Subscribe to incoming samples. The callback receives an array of
  // ChannelSample objects flushed in the most recent animation frame.
  subscribe?: (cb: (samples: ChannelSample[]) => void) => () => void;
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
  // Batch incoming samples to avoid rapid setState loops when device sends
  // many samples quickly. We collect samples in a ref and flush on rAF.
  const pendingSamplesRef = useRef<any[]>([]);
  const rafHandleRef = useRef<number | null>(null);
  const lastCounterRef = useRef<number | null>(null);
  const lastOkFlushTimeRef = useRef<number>(0);
  const subscribersRef = useRef<Set<(s: ChannelSample[]) => void>>(new Set());

  const setRegisteredChannels = useCallback((ids: string[]) => {
    const s = new Set<number>();
    (ids || []).forEach(id => {
      try {
        const m = String(id).match(/channel-(\d+)/i);
        if (m) {
          const idx = Math.max(0, parseInt(m[1], 10) - 1);
          s.add(idx);
        }
      } catch (err) {
        // ignore malformed ids
      }
    });
    registeredChannelIndices.current = s;
  }, []);

  const addSample = useCallback((sample: ChannelSample) => {
    try {
      const processed: any = {};
      for (let i = 0; i < 16; i++) {
        const key = `ch${i}`;
        if ((sample as any)[key] === undefined) break;
        processed[key] = registeredChannelIndices.current.has(i) ? (sample as any)[key] : 0;
      }
  if ((sample as any).timestamp) processed.timestamp = (sample as any).timestamp;
  if ((sample as any).counter !== undefined) processed.counter = (sample as any).counter;

      // Queue sample for batched flush on the next animation frame
      pendingSamplesRef.current.push(processed as ChannelSample);

      // Debug: lightweight log
      try {
        const regs = Array.from(registeredChannelIndices.current).sort((a,b) => a-b);
        console.debug('[ChannelData] queueSample', { registeredIndices: regs, incoming: sample });
      } catch (err) {}

      if (rafHandleRef.current == null) {
        rafHandleRef.current = requestAnimationFrame(() => {
          try {
            const toFlush = pendingSamplesRef.current.splice(0);
            if (toFlush.length === 0) return;
              // detect dropped counters across the flushed batch
              try {
                const counters: number[] = []
                for (const s of toFlush) {
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
                      console.warn('[ChannelData] flush detected missing samples in batch', { flushed: toFlush.length, first, last, missing: totalMissing })
                    } else {
                      // Rate-limit positive confirmation to avoid noisy logs
                      try {
                        const now = Date.now()
                        if (now - lastOkFlushTimeRef.current > 5000) {
                          console.info('[ChannelData] flush OK: no missing samples', { flushed: toFlush.length, first, last })
                          lastOkFlushTimeRef.current = now
                        } else {
                          console.debug('[ChannelData] flush', { flushed: toFlush.length, first, last })
                        }
                      } catch (err) {
                        console.debug('[ChannelData] flush', { flushed: toFlush.length, first, last })
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
              const merged = [...sliced, ...toFlush];
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
            // Notify subscribers with the flushed samples
            try {
              subscribersRef.current.forEach(cb => {
                try { cb(toFlush.slice()); } catch (err) { /* ignore per-cb errors */ }
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

  const clearSamples = useCallback(() => {
    samplesRef.current = [];
    try { setSnapshot([]); } catch (err) {}
    lastCounterRef.current = null;
  }, []);

  const subscribe = useCallback((cb: (s: ChannelSample[]) => void) => {
    subscribersRef.current.add(cb);
    return () => { subscribersRef.current.delete(cb); };
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
    <ChannelDataContext.Provider value={{ samples: snapshot, addSample, clearSamples, setRegisteredChannels, subscribe }}>
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
