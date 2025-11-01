 'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';

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
};

const ChannelDataContext = createContext<ChannelDataContextType | undefined>(undefined);

export const ChannelDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [samples, setSamples] = useState<ChannelSample[]>([]);

  const addSample = useCallback((sample: ChannelSample) => {
    setSamples(prev => [...prev.slice(-511), sample]); // keep last 512 samples
    try {
     
    } catch (err) {
      // swallow
    }
  }, []);

  const clearSamples = useCallback(() => {
    setSamples([]);
  }, []);

  return (
    <ChannelDataContext.Provider value={{ samples, addSample, clearSamples }}>
      {children}
    </ChannelDataContext.Provider>
  );
};

export const useChannelData = () => {
  const ctx = useContext(ChannelDataContext);
  if (!ctx) throw new Error('useChannelData must be used within ChannelDataProvider');
  return ctx;
};
