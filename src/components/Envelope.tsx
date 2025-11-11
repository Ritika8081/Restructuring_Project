import React, { useEffect, useRef } from 'react';
import { useChannelData } from '@/lib/channelDataContext';

type EnvelopeProps = {
  id: string; // widget id
  incomingConnections?: string[]; // upstream sources (channel-* or other widget ids)
  bufferSize?: number; // size of internal circular buffer for envelope computation
};

/**
 * Envelope transform widget
 * - Listens to upstream numeric sources (channel-* or other widget outputs)
 * - Computes a running average envelope per provided pseudocode and
 *   publishes the computed envelope values via channelDataContext.publishWidgetOutputs
 */
const Envelope: React.FC<EnvelopeProps> = ({ id, incomingConnections = [], bufferSize = 32 }) => {
  const { subscribeToSampleBatches, subscribeToWidgetOutputs, publishWidgetOutputs } = useChannelData();

  const circularBufferRef = useRef<number[]>(new Array(bufferSize).fill(0));
  const dataIndexRef = useRef<number>(0);
  const sumRef = useRef<number>(0);

  useEffect(() => {
    let unsubSamples: (() => void) | undefined;
    let unsubWidget: (() => void) | undefined;

    const src = String(incomingConnections && incomingConnections[0] ? incomingConnections[0] : '');

    // helper to push a new abs_emg sample into the envelope running-average
    const pushSample = (abs_emg: number) => {
      const buf = circularBufferRef.current;
      const idx = dataIndexRef.current % buf.length;
      sumRef.current -= buf[idx] || 0;
      sumRef.current += abs_emg;
      buf[idx] = abs_emg;
      dataIndexRef.current = (dataIndexRef.current + 1) % buf.length;
      const env = (sumRef.current / buf.length) * 2;
      try {
        if (publishWidgetOutputs) publishWidgetOutputs(id, env);
      } catch (err) { /* ignore */ }
    };

    if (src.startsWith('channel-')) {
      // subscribe to raw channel samples
      const m = src.match(/channel-(\d+)/i);
      const chIdx = m ? Math.max(0, parseInt(m[1], 10)) : 0;
      const key = `ch${chIdx}`;
      if (subscribeToSampleBatches) {
        unsubSamples = subscribeToSampleBatches((batches) => {
          try {
            for (const s of batches) {
              const v = (s as any)[key];
              if (typeof v === 'number') {
                pushSample(Math.abs(v));
              }
            }
          } catch (err) { /* ignore per-batch errors */ }
        });
      }
    } else if (src && subscribeToWidgetOutputs) {
      // upstream is another widget that publishes numeric samples
      unsubWidget = subscribeToWidgetOutputs(src, (vals) => {
        try {
          for (const v of vals) {
            if (typeof v === 'number') pushSample(Math.abs(v));
          }
        } catch (err) { /* ignore */ }
      });
    }

    return () => {
      try { if (unsubSamples) unsubSamples(); } catch (e) { }
      try { if (unsubWidget) unsubWidget(); } catch (e) { }
    };
  }, [incomingConnections && incomingConnections[0], bufferSize, id, publishWidgetOutputs, subscribeToSampleBatches, subscribeToWidgetOutputs]);

  // Render a minimal UI showing latest envelope value
  const latest = circularBufferRef.current[(dataIndexRef.current - 1 + circularBufferRef.current.length) % circularBufferRef.current.length] || 0;
  const display = Math.round(((sumRef.current / circularBufferRef.current.length) * 2) * 100) / 100;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#6b7280' }}>Envelope</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#2563eb' }}>{display}</div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>{`src: ${incomingConnections && incomingConnections[0] ? incomingConnections[0] : '—'}`}</div>
      </div>
    </div>
  );
};

export default Envelope;
