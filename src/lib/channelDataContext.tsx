 'use client';
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

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
    // Only keep channel values for indices that are registered in the flowchart.
    // This routes device data only to channel nodes that exist in the flow.
    try {
      const processed: any = {};
      // We expect ch0..chN keys. Normalize for first 16 channels conservatively.
      for (let i = 0; i < 16; i++) {
        const key = `ch${i}` as keyof ChannelSample;
        if ((sample as any)[key] === undefined) break;
        processed[key] = registeredChannelIndices.current.has(i) ? (sample as any)[key] : 0;
      }
      // Keep timestamp if present
      if ((sample as any).timestamp) processed.timestamp = (sample as any).timestamp;

      // Debug: show which channel indices are registered and what will be stored
      try {
        const regs = Array.from(registeredChannelIndices.current).sort((a,b) => a-b);
        console.debug('[ChannelData] addSample', { registeredIndices: regs, incoming: sample, stored: processed });
      } catch (err) {
        // swallow debug errors
      }

      setSamples(prev => [...prev.slice(-511), processed as ChannelSample]); // keep last 512 samples
    } catch (err) {
      // swallow
    }
  }, []);

  const clearSamples = useCallback(() => {
    setSamples([]);
  }, []);

  return (
    <ChannelDataContext.Provider value={{ samples, addSample, clearSamples, setRegisteredChannels }}>
      {children}
    </ChannelDataContext.Provider>
  );
};

export const useChannelData = () => {
  const ctx = useContext(ChannelDataContext);
  if (!ctx) throw new Error('useChannelData must be used within ChannelDataProvider');
  return ctx;
};
