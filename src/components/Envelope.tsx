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

  // Per-source circular buffers and running sums keyed by source id.
  const sourcesStateRef = useRef<Record<string, { buf: number[]; idx: number; sum: number; latest: number }>>({});
  const latestRef = useRef<number[]>([]);
  const [displayValues, setDisplayValues] = React.useState<number[]>([]);

  useEffect(() => {
    if (!incomingConnections || incomingConnections.length === 0) return;

    // Initialize per-source state
    const srcs = incomingConnections.map(s => String(s));
    // try { console.debug(`[Envelope:${id}] init sources:`, srcs.length, srcs); } catch (e) { }
    const bufSize = Math.max(4, bufferSize || 32);
    sourcesStateRef.current = {};
    for (const s of srcs) {
      sourcesStateRef.current[s] = { buf: new Array(bufSize).fill(0), idx: 0, sum: 0, latest: 0 };
    }

    let unsubSamples: (() => void) | undefined;
    const widgetUnsubs: Array<() => void> = [];

    // Helper to push an abs sample for a given source and compute env
    const pushForSource = (src: string, abs_emg: number) => {
      try {
        const st = sourcesStateRef.current[src];
        if (!st) return;
        const idx = st.idx % st.buf.length;
        st.sum -= st.buf[idx] || 0;
        st.sum += abs_emg;
        st.buf[idx] = abs_emg;
        st.idx = (st.idx + 1) % st.buf.length;
        const env = (st.sum / st.buf.length) * 12;
        st.latest = env;
        // update latestRef in order of incomingConnections
        latestRef.current = srcs.map(sid => (sourcesStateRef.current[sid] && sourcesStateRef.current[sid].latest) || 0);
        try {
          if (publishWidgetOutputs) {
            const frame = latestRef.current.slice();
            // try { console.debug(`[Envelope:${id}] publish frame len=${frame.length} vals=${frame.map(v=>Math.round(v*100)/100).join(',')}`); } catch(e) { }
            publishWidgetOutputs(id, frame);
          }
        } catch (e) { }
        try { setDisplayValues(latestRef.current.slice()); } catch (e) { }
      } catch (err) { /* ignore */ }
    };

    // Partition sources into channel-* and widget ids
    const channelSources: Array<{ src: string; key: string }> = [];
    const widgetSources: string[] = [];
    for (const s of srcs) {
      if (s.startsWith('channel-')) {
        const m = s.match(/channel-(\d+)/i);
        const chIdx = m ? Math.max(0, parseInt(m[1], 10)) : 0;
        channelSources.push({ src: s, key: `ch${chIdx}` });
      } else {
        widgetSources.push(s);
      }
    }
    // try { console.debug(`[Envelope:${id}] channelSources=${channelSources.length}, widgetSources=${widgetSources.length}`); } catch(e) { }

    // Subscribe once to sample batches for channel sources
    if (channelSources.length > 0 && subscribeToSampleBatches) {
      unsubSamples = subscribeToSampleBatches((batches) => {
        try {
          for (const sample of batches) {
            for (const cs of channelSources) {
              try {
                const v = (sample as any)[cs.key];
                if (typeof v === 'number') pushForSource(cs.src, Math.abs(v));
              } catch (e) { /* per-source ignore */ }
            }
          }
        } catch (err) { /* ignore */ }
      });
    }

    // Subscribe to widget-output sources
    if (widgetSources.length > 0 && subscribeToWidgetOutputs) {
      for (const w of widgetSources) {
        try {
          const unsub = subscribeToWidgetOutputs(w, (vals) => {
            try {
              // try { console.debug(`[Envelope:${id}] received widget source ${w} vals.len=${vals && vals.length}`); } catch(e) { }
              for (const v of vals) {
                if (typeof v === 'number') pushForSource(w, Math.abs(v));
                else if (Array.isArray(v)) {
                  // If upstream widget sends an array, map by index -> matching source order
                  // (only when counts match) otherwise push the first element
                  for (let i = 0; i < Math.min(v.length, srcs.length); i++) {
                    const target = srcs[i];
                    const num = typeof v[i] === 'number' ? Math.abs(v[i]) : 0;
                    pushForSource(target, num);
                  }
                }
              }
            } catch (err) { /* ignore per-callback errors */ }
          });
          if (unsub) widgetUnsubs.push(unsub);
        } catch (err) { /* ignore subscribe errors */ }
      }
    }

    return () => {
      try { if (unsubSamples) unsubSamples(); } catch (e) { }
      for (const u of widgetUnsubs) try { u(); } catch (e) { }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(incomingConnections || []), bufferSize, id, publishWidgetOutputs, subscribeToSampleBatches, subscribeToWidgetOutputs]);

  // Display a compact summary: show first channel's env or comma-separated list
  const display = displayValues.length > 0 ? displayValues.map(v => Math.round(v * 100) / 100).join(', ') : '—';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#6b7280' }}>Envelope</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#2563eb' }}>{display}</div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>{`srcs: ${incomingConnections && incomingConnections.length ? incomingConnections.join(', ') : '—'}`}</div>
      </div>
    </div>
  );
};

export default Envelope;
