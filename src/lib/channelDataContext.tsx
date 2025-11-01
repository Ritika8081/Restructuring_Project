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
};

export type ChannelDataContextType = {
  samples: ChannelSample[];
  addSample: (sample: ChannelSample) => void;
  clearSamples: () => void;
  // Register which flowchart channel nodes should receive data.
  // Provide list of flow node ids (e.g. ['channel-1','channel-2']).
  setRegisteredChannels: (ids: string[]) => void;
};

const ChannelDataContext = createContext<ChannelDataContextType | undefined>(undefined);

export const ChannelDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [samples, setSamples] = useState<ChannelSample[]>([]);
  // Track which channel indices (0-based) are currently present in the flowchart.
  // We keep this in a ref for cheap lookups inside addSample.
  const registeredChannelIndices = useRef<Set<number>>(new Set());
  // Batch incoming samples to avoid rapid setState loops when device sends
  // many samples quickly. We collect samples in a ref and flush on rAF.
  const pendingSamplesRef = useRef<any[]>([]);
  const rafHandleRef = useRef<number | null>(null);

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
            setSamples(prev => {
              const sliced = prev.slice(-511);
              const merged = [...sliced, ...toFlush];
              return merged.slice(-512);
            });
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
    setSamples([]);
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
    <ChannelDataContext.Provider value={{ samples, addSample, clearSamples, setRegisteredChannels }}>
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
