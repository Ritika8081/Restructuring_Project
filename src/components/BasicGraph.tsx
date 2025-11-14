"use client";
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { useChannelData } from '@/lib/channelDataContext';
/**
 * src/components/BasicGraph.tsx
 *
 * Purpose: Low-level WebGL-based real-time plotting component. Renders one
 * or more channels using the `webgl-plot` library and maintains per-channel
 * ring buffers in memory. This component is intended for high-throughput
 * streaming data where samples are provided in batches by the
 * ChannelDataProvider (see `useChannelData()`).
 *
 * Key responsibilities / invariants:
 * - Subscribe to batch-flushed samples (the provider emits an array of
 *   samples on each animation-frame flush). The consumer callback must be
 *   read-only (do not call `addSample` from within the callback).
 * - Buffer incoming values per-channel (pending queues) and drain up to
 *   `samplesPerFrame` each animation frame so rendering work is bounded.
 * - Keep a fixed-size circular buffer (`bufferSize`) per plotted channel
 *   and update the WebGL line from that buffer each frame.
 * - Preserve `_raw` and `_seq` fields when present (these are attached by
 *   the provider for tracing and continuity checks). The component prefers
 *   provider-processed values (for example, filtered and/or normalized
 *   outputs) when present and falls back to `_raw` device values only when
 *   a processed value is not available. This ensures plots reflect the
 *   provider's filtering and normalization while still allowing inspection
 *   of raw device samples for debugging.
 *
 * Exports: BasicGraphRealtime React component (default export under a different name)
 */
// Device samples are typically injected by the parent widget when this
// plot instance is connected to flow channels. In addition this component
// subscribes to the ChannelData provider's `subscribeToSampleBatches` API
// to receive live sample batches. Do NOT read provider state directly here
// (use the subscription) unless you understand the performance implications.
import { WebglPlot, WebglLine, ColorRGBA } from 'webgl-plot';

interface Channel {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  scale?: number;
  offset?: number;
}

interface BasicGraphRealtimeProps {
  channels?: Channel[];
  bufferSize?: number;
  width?: number;
  height?: number; // Change this to total height instead of channelHeight
  showGrid?: boolean;
  backgroundColor?: string;
  showLegend?: boolean;
  /** When false, the component will ignore live device samples from context */
  allowDeviceSamples?: boolean;
  sampleRate?: number;
  timeWindow?: number;
  onChannelsChange?: (channels: Channel[]) => void;
  showChannelControls?: boolean;
  onSizeRequest?: (minWidth: number, minHeight: number) => void;
  // Device samples are provided by the parent (draggable widget) when the
  // plot is connected to a channel. If not provided, no live data will be plotted.
  deviceSamples?: Array<{ [key: string]: number | undefined; timestamp?: number }>;
  // Optional instance id for runtime debugging (widget id)
  instanceId?: string;
  /** Number of samples to apply to buffers each animation frame (per channel). */
  samplesPerFrame?: number;
  selectedChannels?: number[];
  /** Optional upstream widget id to subscribe to (e.g. an Envelope widget id) */
  inputWidgetId?: string;
  /** If the flow wiring attaches upstream sources via incomingConnections, read the first one and subscribe */
  incomingConnections?: string[];
}

// DEFAULT_COLORS removed (not used in this component)

const BasicGraphRealtime = forwardRef((props: BasicGraphRealtimeProps, ref) => {
  const {
    channels: initialChannels = [
      // Default channel id uses 0-based numbering (ch0) to match the
      // project's canonical 0-based channel indexing. UI label uses
      // zero-based numbering for human readability ("CH 0").
      { id: 'ch0', name: 'CH 0', color: '#10B981', visible: true },
    ],
  bufferSize = 2000,
    width = 400,
    height = 200,
    showGrid = true,
    backgroundColor = 'rgba(0, 0, 0, 0.1)',
  samplesPerFrame = bufferSize,
    onChannelsChange,
    onSizeRequest,
  } = props;
  const { allowDeviceSamples = false, deviceSamples, instanceId } = props;
  // Optional external controls: keep selectedChannels for the imperative API
  const { selectedChannels: propSelectedChannels } = props as any;
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const plotRefs = useRef<Map<string, WebglPlot>>(new Map());
  const linesRef = useRef<Map<string, WebglLine>>(new Map());
  const animationRef = useRef<number | null>(null);
  // Per-channel circular buffers stored as Float32Array for efficient updates
  const dataBuffers = useRef<Map<string, Float32Array>>(new Map());
  // Per-channel sweep (write) position for overwrite plotting
  const sweepPositionsRef = useRef<Map<string, number>>(new Map());
  // Pending per-channel sample queues (filled by the provider subscription
  // callback). Each queue contains normalized numeric values in the range
  // approximately -1..1 (see `normalize` below). These queues are drained
  // by the animation loop up to `samplesPerFrame` values per frame to keep
  // rendering work bounded and avoid UI freezes when bursts arrive.
  const pendingPerChannel = useRef<Map<string, number[]>>(new Map());
  const previousCounterRef = useRef<number | null>(null);
  // Rate-limit missing-sample warnings from this component to avoid console spam
  const lastMissingWarnRef = useRef<number>(0);
  
  // Update internal channels when external channels change
  useEffect(() => {
    // Only update internal channels when something meaningful changed.
    // Parent components sometimes pass a freshly-allocated array each render,
    // causing an infinite setState -> rerender loop. Do a shallow structural
    // equality check (id, visible, name, color) to avoid that.
    const same = ((): boolean => {
      if (initialChannels.length !== channels.length) return false;
      for (let i = 0; i < initialChannels.length; i++) {
        const a = initialChannels[i];
        const b = channels[i];
        if (!b) return false;
        if (a.id !== b.id) return false;
        if (a.visible !== b.visible) return false;
        if (a.name !== b.name) return false;
        if (a.color !== b.color) return false;
      }
      return true;
    })();

    if (!same) setChannels(initialChannels);
  }, [initialChannels, channels]);

  // Calculate dynamic channel height
  const visibleChannels = channels.filter(ch => ch.visible);
  const channelCount = Math.max(1, visibleChannels.length);
  const borderSpace = Math.max(0, channelCount - 1);
  const availableHeightForChannels = Math.max(0, height - borderSpace);
  const dynamicChannelHeight = Math.floor(availableHeightForChannels / channelCount);

  // Calculate minimum required dimensions
  const minChannelHeight = 60;
  const minTotalWidth = 180;
  const requiredCanvasHeight = (channelCount * minChannelHeight) + borderSpace;
  const requiredCanvasWidth = minTotalWidth;
  
  // Request resize if current dimensions are too small
  useEffect(() => {
    if (onSizeRequest && (width < requiredCanvasWidth || height < requiredCanvasHeight)) {
      onSizeRequest(requiredCanvasWidth, requiredCanvasHeight);
    }
  }, [width, height, requiredCanvasWidth, requiredCanvasHeight, onSizeRequest]);

  // Update parent when channels change
  const channelsStringRef = useRef<string>('');
  useEffect(() => {
    const channelsString = JSON.stringify(channels.map(ch => ({ id: ch.id, visible: ch.visible })));
    if (onChannelsChange && channelsString !== channelsStringRef.current) {
      channelsStringRef.current = channelsString;
      onChannelsChange(channels);
    }
  }, [channels, onChannelsChange]);

  // Fixed hex color to ColorRGBA conversion
  const hexToColorRGBA = (hex: string): ColorRGBA => {
    const cleanHex = hex.replace('#', '');
    let r, g, b, a = 1.0;

    if (cleanHex.length === 6) {
      r = parseInt(cleanHex.substring(0, 2), 16) / 255;
      g = parseInt(cleanHex.substring(2, 4), 16) / 255;
      b = parseInt(cleanHex.substring(4, 6), 16) / 255;
    } else if (cleanHex.length === 8) {
      r = parseInt(cleanHex.substring(0, 2), 16) / 255;
      g = parseInt(cleanHex.substring(2, 4), 16) / 255;
      b = parseInt(cleanHex.substring(4, 6), 16) / 255;
      a = parseInt(cleanHex.substring(6, 8), 16) / 255;
    } else {
      r = 0.39; g = 0.4; b = 0.945;
    }

    return new ColorRGBA(r, g, b, a);
  };

  // Normalize raw integer device values into -1..1. Centralized helper so
  // all paths use the same logic. Assumes 16-bit unsigned-ish samples by
  // default; adjust FULL_SCALE if your device uses a different range.
  const FULL_SCALE = 2 ** 16;
  const normalizeValue = (value: number | undefined | null) => {
    if (value === undefined || value === null) return 0;
    let v = Number(value);
    // center at FULL_SCALE/2 and scale to -1..1
    let out = (v - FULL_SCALE / 2) * (2 / FULL_SCALE);
    if (!isFinite(out) || isNaN(out)) out = 0;
    return Math.max(-1, Math.min(1, out));
  };

  // If an incoming value looks already normalized (floating value in a
  // small range, e.g. -2..2), treat it as normalized and avoid re-normalizing
  // (which assumes integer ADC counts). This lets transform widgets publish
  // normalised streams (envelope, filter outputs) and have them plotted
  // without distortion.
  const normalizeOrPassThrough = (value: number | undefined | null) => {
    if (typeof value === 'number' && Math.abs(value) <= 2) {
      // clamp into -1..1 if slightly out of range
      return Math.max(-1, Math.min(1, value));
    }
    return normalizeValue(value as any);
  };

  // Initialize canvases and plots for visible channels - responds to height changes.
  // Each visible channel uses its own canvas/WebglPlot instance. We size the
  // canvas using the devicePixelRatio to keep the rendering crisp on HiDPI
  // displays. `bufferSize` controls how many historical samples are retained
  // per channel (this is also the WebglLine point count).
  useEffect(() => {
    // Clean up removed channels
    const currentChannelIds = new Set(visibleChannels.map(ch => ch.id));
    
    // Remove old canvases and plots
    for (const [channelId, plot] of plotRefs.current) {
      if (!currentChannelIds.has(channelId)) {
        plot.removeAllLines();
        plotRefs.current.delete(channelId);
        linesRef.current.delete(channelId);
        dataBuffers.current.delete(channelId);
        canvasRefs.current.delete(channelId);
      }
    }

    // Initialize/update all visible channels with new dimensions
    visibleChannels.forEach((channel) => {
      const canvas = canvasRefs.current.get(channel.id);
      if (!canvas) return;

      const devicePixelRatio = window.devicePixelRatio || 1;
      
      // Update canvas size with dynamic height
      const canvasWidth = Math.max(0, (width || 400));
      const canvasHeight = Math.max(0, dynamicChannelHeight);
      canvas.width = canvasWidth * devicePixelRatio;
      canvas.height = canvasHeight * devicePixelRatio;
      canvas.style.width = `100%`;
      canvas.style.height = `100%`;

      try {
        // Clean up existing plot
        const existingPlot = plotRefs.current.get(channel.id);
        if (existingPlot) {
          existingPlot.removeAllLines();
        }

  const plot = new WebglPlot(canvas);
        plotRefs.current.set(channel.id, plot);

        const colorObj = hexToColorRGBA(channel.color);
        const line = new WebglLine(colorObj, bufferSize);

        // Set line properties for individual canvas
        line.lineSpaceX(-1, 2 / bufferSize);
        line.scaleY = 1;
        line.offsetY = 0;

        // Initialize a Float32Array buffer and zero the Webgl line points
        const existingBuffer = dataBuffers.current.get(channel.id);
        if (existingBuffer) {
          // restore existing contents into the line
          for (let i = 0; i < Math.min(bufferSize, existingBuffer.length); i++) {
            line.setY(i, existingBuffer[i] || 0);
          }
        } else {
          const buf = new Float32Array(bufferSize);
          for (let i = 0; i < bufferSize; i++) {
            buf[i] = 0;
            line.setY(i, 0);
          }
          dataBuffers.current.set(channel.id, buf);
          sweepPositionsRef.current.set(channel.id, 0);
        }

        plot.addLine(line);
        linesRef.current.set(channel.id, line);

      } catch (error) {
        console.error(`WebGL initialization failed for channel ${channel.id}:`, error);
      }
    });

  // Start animation loop. The render loop does two things:
  // 1) Drain up to `samplesPerFrame` samples from each per-channel pending
  //    queue and append them into the fixed-size `dataBuffers`.
  // 2) Push the buffer contents into the `WebglLine` instance and redraw.
  // This separation keeps parsing (incoming batches) and rendering decoupled
  // and lets the provider coalesce high-frequency packets without causing
  // a render storm.
    const lastRenderLogRef = { current: 0 as number } as { current: number };
    const render = () => {
      animationRef.current = requestAnimationFrame(render);

      // Drain pending samples per channel up to samplesPerFrame and update buffers
      visibleChannels.forEach((channel) => {
        try {
          const pending = pendingPerChannel.current.get(channel.id) || [];
          if (pending.length > 0) {
            const take = Math.min(pending.length, samplesPerFrame);
            const toApply = pending.splice(0, take);

            const buffer = dataBuffers.current.get(channel.id) || new Float32Array(bufferSize);
            let sweep = sweepPositionsRef.current.get(channel.id) || 0;
            const line = linesRef.current.get(channel.id);
            // Write each sample into the current sweep position (overwrite)
            for (let s = 0; s < toApply.length; s++) {
              const v = toApply[s];
              buffer[sweep] = v;
              if (line) {
                try { line.setY(sweep, v); } catch (err) { /* ignore per-point errors */ }
              }
              sweep = (sweep + 1) % bufferSize;
            }
            sweepPositionsRef.current.set(channel.id, sweep);
            dataBuffers.current.set(channel.id, buffer);
          }
        } catch (err) {
          // swallow per-channel errors
        }
      });

      // Rate-limited debug logging for pending queues / line presence
      try {
        const now = Date.now();
        if (now - lastRenderLogRef.current > 500) {
          lastRenderLogRef.current = now;
          try {
            const pendingSummary = visibleChannels.map(ch => {
              const q = pendingPerChannel.current.get(ch.id) || [];
              const hasLine = !!linesRef.current.get(ch.id);
              return `${ch.id}:pending=${q.length},line=${hasLine}`;
            }).join(' | ');
            console.debug && console.debug(`[BasicGraph:${instanceId ?? 'anon'}] render pending: ${pendingSummary}`);
          } catch (e) { /* ignore logging errors */ }
        }
      } catch (e) { /* ignore */ }

  // Render each visible channel's plot. We call `plot.update()` before
  // `plot.draw()` to ensure the WebGL buffers are in sync with line data.
      visibleChannels.forEach((channel) => {
        const plot = plotRefs.current.get(channel.id);
        if (plot) {
          plot.clear();
          plot.update();
          plot.draw();
        }
      });
    };

    if (visibleChannels.length > 0) {
      render();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [channels, visibleChannels, bufferSize, width, height, dynamicChannelHeight]); // Added height dependency

  // Push a single normalized value into the visible buffer and update the
  // WebGL line immediately. This is used by the imperative `updateData`
  // API for manual/array-based updates (and is not the primary path for
  // provider-driven batches).
  const pushData = (channelId: string, newValue: number) => {
    const line = linesRef.current.get(channelId);
    const buffer = dataBuffers.current.get(channelId);
    
    if (!line || !buffer) return;

    // (debug logging removed)

    // Overwrite at current sweep position
    let sweep = sweepPositionsRef.current.get(channelId) || 0;
    buffer[sweep] = newValue;
    try { line.setY(sweep, newValue); } catch (err) { /* ignore */ }
    sweep = (sweep + 1) % line.numPoints;
    sweepPositionsRef.current.set(channelId, sweep);
  };

  // Subscribe to ChannelDataProvider's sample-batch stream when allowed.
  // The provider emits arrays of sample objects (a "batch") on each
  // requestAnimationFrame-based flush. The callback receives an array of
  // ChannelSample objects; it MUST NOT call `addSample` back into the
  // provider (that would create a feedback loop). The subscription returns
  // an unsubscribe function which we call on cleanup.
  const { subscribeToSampleBatches, subscribeToControlEvents, publishWidgetOutputs, subscribeToWidgetOutputs } = useChannelData();
  const { inputWidgetId, incomingConnections } = props as any;
  useEffect(() => {
    if (!allowDeviceSamples) return;

  // Normalization is handled by `normalizeValue` defined above.
    // Enqueue sample batches into per-channel pending queues. The animation
    // loop will drain up to `samplesPerFrame` items per channel each frame.
    // We preserve `(sample as any)._raw` when present so developers can
    // inspect original device values even if the provider zeroes unregistered
    // channels.
  const handleSampleBatch = (sampleBatch: Array<{ [key: string]: number | undefined; timestamp?: number }>) => {
      // Logging of the full sample batch (seqs + counters), rate-limited.
      try {
        // Always log every flushed batch to the console (no rate-limit) so
        // you can inspect seqs, counters and a small preview of values.
        if (sampleBatch.length > 0) {
          try {
            const seqs = sampleBatch.map(s => (s as any)._seq ?? null);
            const counters = sampleBatch.map(s => (s as any).counter ?? (s as any).cnt ?? null);
            // Plot-level missing-sample detection: look for gaps in the 8-bit
            // device counter. We check continuity with the last seen counter
            // (possibly observed in previous batches or via imperative updates)
        try {
          if (counters.length > 0) {
                let prev = previousCounterRef.current;
                let totalMissing = 0;
                const nonSeqIndices: number[] = [];
                for (let i = 0; i < counters.length; i++) {
                  const cur = counters[i];
                  if (cur === null || cur === undefined) continue;
                  if (prev !== null) {
                    const d = (cur - prev + 256) % 256;
                    if (d > 1) {
                      totalMissing += (d - 1);
                      nonSeqIndices.push(i);
                    }
                  }
                  prev = cur as number;
                }
                // Also check the first element against previousCounterRef
                const now = Date.now();
                if (totalMissing > 0 && now - lastMissingWarnRef.current > 1000) {
                  lastMissingWarnRef.current = now;
                  // missing-sample warning suppressed in production
                }
                // Update previousCounterRef to last seen counter in this batch
                previousCounterRef.current = prev as number | null;
              }
            } catch (err) {
              // swallow detection errors
            }
            const first = sampleBatch[0] as any;
            const firstPreview: Record<string, number | null> = {};
            for (const ch of channels) {
              try {
                const m = String(ch.id).match(/ch(\d+)/i);
                if (!m) { firstPreview[ch.id] = null; continue; }
                const parsed = parseInt(m[1], 10);
                const candidates = [`ch${parsed}`, `ch${Math.max(0, parsed - 1)}`, `ch${parsed + 1}`];
                let selectedKey: string | null = null;
                for (const k of candidates) {
                  if ((first as any)[k] !== undefined) { selectedKey = k; break; }
                }
                const raw = (first as any)._raw as Record<string, any> | undefined;
                // The provider emits normalized processed values (-1..1) when
                // filters are applied. Prefer processed value; otherwise normalize raw.
                const processedVal = selectedKey ? (first as any)[selectedKey as string] : undefined;
                if (processedVal !== undefined) {
                  firstPreview[ch.id] = Number(processedVal);
                } else {
                  const rawVal = selectedKey && raw && raw[selectedKey as string] !== undefined ? Number(raw[selectedKey as string]) : undefined;
                  firstPreview[ch.id] = rawVal !== undefined ? normalizeValue(rawVal) : null;
                }
              } catch (err) {
                firstPreview[ch.id] = null;
              }
            }
            // (debug logging removed)
          } catch (err) {
            // swallow logging errors
          }
        }
      } catch (err) {
        // swallow logging errors
      }

  // Enqueue sample values into per-channel pending queues. Note that we
  // match channel IDs by heuristics (e.g., `ch0` -> sample[`ch0`]) to
  // support multiple naming conventions; this logic is intentionally
  // defensive to avoid crashes on unexpected packet shapes.
      try {
        for (const sample of sampleBatch) {
          // Build an array of processed values in the same channel order so
          // we can publish the widget's output as an array (or single number)
          // for subscribers that connect to this widget's output handle.
          const perSampleValues: number[] = [];
          for (const ch of channels) {
            try {
              if (!ch || !ch.visible) { perSampleValues.push(0); continue; }
              const m = String(ch.id).match(/ch(\d+)/i);
              if (!m) { perSampleValues.push(0); continue; }
              const parsed = parseInt(m[1], 10);
              const candidates = [`ch${parsed}`, `ch${Math.max(0, parsed - 1)}`, `ch${parsed + 1}`];
              let selectedKey: string | null = null;
              for (const k of candidates) {
                if ((sample as any)[k] !== undefined) { selectedKey = k; break; }
              }
              if (!selectedKey) { perSampleValues.push(0); continue; }
              const raw = (sample as any)._raw as Record<string, any> | undefined;
              const processedVal = selectedKey ? (sample as any)[selectedKey as string] : undefined;
              const v = processedVal !== undefined
                ? Number(processedVal)
                : normalizeValue(selectedKey && raw && raw[selectedKey as string] !== undefined ? Number(raw[selectedKey as string]) : 0);

              // enqueue for local plotting
              const q = pendingPerChannel.current.get(ch.id) || [];
              q.push(v);
              if (q.length > bufferSize * 4) q.splice(0, q.length - bufferSize * 4);
              pendingPerChannel.current.set(ch.id, q);

              perSampleValues.push(v);
            } catch (err) {
              // ignore per-sample errors and publish a zero placeholder
              try { perSampleValues.push(0); } catch (e) { }
            }
          }

          // Publish widget outputs (if provider API is available and an
          // instanceId was provided). Use a single number when the widget
          // is plotting exactly one channel to match other widgets' expectations.
          try {
            if (publishWidgetOutputs && instanceId) {
              if (perSampleValues.length === 1) publishWidgetOutputs(String(instanceId), perSampleValues[0]);
              else publishWidgetOutputs(String(instanceId), perSampleValues.slice());
            }
          } catch (err) { /* swallow publish errors */ }
        }
      } catch (err) {
        // swallow
      }
    };

  if (!subscribeToSampleBatches) return () => {};
  const unsub = subscribeToSampleBatches(handleSampleBatch);
  // Listen for provider control events (e.g. filter changes) so we can
  // immediately clear per-channel buffers and avoid waiting for the
  // circular buffer to fully rotate with old unfiltered data.
  let unsubControl: (() => void) | undefined;
  try {
    if (subscribeToControlEvents) {
      unsubControl = subscribeToControlEvents((evt) => {
        try {
          if (evt && evt.type === 'filterChanged' && typeof evt.channelIndex === 'number') {
            const chId = `ch${evt.channelIndex}`;
            // Clear buffer and reset sweep for the impacted channel
            const buf = dataBuffers.current.get(chId);
            const line = linesRef.current.get(chId);
            if (buf) {
              for (let i = 0; i < buf.length; i++) buf[i] = 0;
            }
            if (line) {
              try {
                for (let i = 0; i < line.numPoints; i++) line.setY(i, 0);
              } catch (e) { /* ignore */ }
            }
            sweepPositionsRef.current.set(chId, 0);
            // Also clear any pending queue so we don't immediately display stale values
            pendingPerChannel.current.set(chId, []);
          }
        } catch (e) { /* swallow */ }
      });
    }
  } catch (e) { /* ignore */ }
  return () => { unsub(); };
  }, [allowDeviceSamples, subscribeToSampleBatches, channels, bufferSize]);

  // Subscribe to upstream widget outputs. Support multiple upstream sources
  // (incomingConnections) by subscribing to each and merging their latest
  // frames into a single perSampleValues array in the order of the
  // `incomingConnections` list. This lets the plot show one trace per
  // upstream source (or per-element when an upstream source publishes an
  // array).
  useEffect(() => {
    const sources: string[] = inputWidgetId ? [String(inputWidgetId)] : (incomingConnections || []).map(String);
    if (!subscribeToWidgetOutputs || sources.length === 0) {
      if (process.env.NODE_ENV !== 'production') console.debug(`[BasicGraph:${instanceId ?? 'anon'}] no upstream widget(s) to subscribe (inputWidgetId/incomingConnections)`);
      return;
    }

    console.debug(`[BasicGraph:${instanceId ?? 'anon'}] subscribing to upstream widget sources ->`, sources);

    // Maintain latest value per source
    const latestPerSource = new Map<string, any>();

    const unsubs: Array<() => void> = [];
    for (const src of sources) {
      try {
        console.debug(`[BasicGraph:${instanceId ?? 'anon'}] subscribeToWidgetOutputs ->`, src);
        const unsub = subscribeToWidgetOutputs(String(src), (vals: any[]) => {
          try {
            if (!vals || vals.length === 0) return;
            const latest = vals[vals.length - 1];
            latestPerSource.set(src, latest);
            console.debug(`[BasicGraph:${instanceId ?? 'anon'}] widget outputs received from ${src}:`, vals.length, 'items. latest=', latest);

            // Build a combined perSampleValues array by iterating sources in order
            const perSampleValues: number[] = [];
            for (const s of sources) {
              const val = latestPerSource.get(s);
              if (val === undefined) {
                perSampleValues.push(0);
              } else if (Array.isArray(val)) {
                for (const el of val) perSampleValues.push(normalizeOrPassThrough(el as any));
              } else {
                perSampleValues.push(normalizeOrPassThrough(val as any));
              }
            }

            try { console.debug(`[BasicGraph:${instanceId ?? 'anon'}] latestPerSource keys=`, Array.from(latestPerSource.keys()), 'perSampleValues.len=', perSampleValues.length, 'perSampleValues=', perSampleValues); } catch(e) { }

            // If the combined publisher is sending more elements than current
            // plotted channels, extend plotted channels immediately via a
            // local list so enqueueing happens in this same tick.
            let plotChannels = channels;
            if (perSampleValues.length > channels.length) {
              try {
                const additional = perSampleValues.length - channels.length;
                if (additional > 0) {
                  const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
                  const newChannels = channels.slice();
                  // Ensure newly-created channel ids are unique. Find the next
                  // free numeric index and allocate ids ch{n} that don't collide
                  // with existing channel ids (this prevents duplicate React keys).
                  const existing = new Set(newChannels.map(c => String(c.id)));
                  const allocateIndex = () => {
                    let n = 0;
                    while (existing.has(`ch${n}`)) n++;
                    existing.add(`ch${n}`);
                    return n;
                  };
                  for (let i = channels.length; i < perSampleValues.length; i++) {
                    const idx = allocateIndex();
                    newChannels.push({ id: `ch${idx}`, name: `CH ${idx}`, color: colors[idx % colors.length], visible: true });
                  }
                  plotChannels = newChannels;
                  try { setChannels(newChannels); } catch (e) { /* ignore */ }
                }
              } catch (err) { /* ignore */ }
            }

            // Enqueue into pendingPerChannel for each plotted channel (use local list)
            for (let i = 0; i < plotChannels.length; i++) {
              const ch = plotChannels[i];
              if (!ch || !ch.visible) continue;
              const v = perSampleValues.length > i ? perSampleValues[i] : perSampleValues[0] || 0;
              const q = pendingPerChannel.current.get(ch.id) || [];
              q.push(v);
              if (q.length > bufferSize * 4) q.splice(0, q.length - bufferSize * 4);
              pendingPerChannel.current.set(ch.id, q);
              if (i === 0) console.debug(`[BasicGraph:${instanceId ?? 'anon'}] enqueued -> ch:${ch.id} qlen=${q.length} (perSampleValues.len=${perSampleValues.length}, plotChannels.len=${plotChannels.length})`);
            }
          } catch (err) {
            // swallow per-callback errors
          }
        });
        if (unsub) unsubs.push(unsub);
      } catch (err) {
        // ignore subscribe errors
      }
    }

    return () => { for (const u of unsubs) try { u(); } catch (e) { } };
  }, [subscribeToWidgetOutputs, inputWidgetId, JSON.stringify(incomingConnections || []), channels, bufferSize, instanceId]);

  // Expose an imperative `updateData` API. This allows callers to push a
  // single sample object or an array of numbers directly into the plot.
  // - If `data` is an array and the first element looks like a counter, the
  //   method performs a simple continuity check against previous counter.
  // - If `data` is an object, it attempts to extract `chN` fields like
  //   the subscription path. This API is provided for debugging and for
  //   scenarios where the parent wants to drive the plot imperatively.
  useImperativeHandle(ref, () => ({
    updateData(data: number[] | { [key: string]: number | undefined }) {
      try {
        // Counter detection when data is an array and first element is a counter
        if (Array.isArray(data) && data.length > 0) {
          const cnt = Number(data[0]);
            if (previousCounterRef.current !== null) {
            const expected = (previousCounterRef.current + 1) & 0xff;
            if (cnt !== expected) {
              // counter jump detected (debug logging removed)
            }
          }
          previousCounterRef.current = cnt;
        }

        // Map incoming array -> per-channel values using propSelectedChannels if provided
        if (Array.isArray(data)) {
          const arr = data as number[];
          const sel = (propSelectedChannels as number[] | undefined) || [];
          // If selectedChannels provided, map each plotted index to the array index
          if (sel && sel.length > 0) {
            sel.forEach((channelNumber, i) => {
              const ch = channels[i];
              if (!ch || !ch.visible) return;
              const value = (channelNumber >= 0 && channelNumber < arr.length) ? arr[channelNumber] : 0;
              const v = normalizeOrPassThrough(value as any);
              // push immediate
              pushData(ch.id, v);
            });
            return;
          }
        }

        // If a sample object is provided, try to extract chN fields like the subscription
        if (data && !Array.isArray(data)) {
          const sample = data as { [key: string]: number | undefined };
          for (const ch of channels) {
            if (!ch || !ch.visible) continue;
            const m = String(ch.id).match(/ch(\d+)/i);
            if (!m) continue;
            const parsed = parseInt(m[1], 10);
            const candidates = [`ch${parsed}`, `ch${Math.max(0, parsed - 1)}`, `ch${parsed + 1}`];
            let selectedKey: string | null = null;
            for (const k of candidates) {
              if ((sample as any)[k] !== undefined) { selectedKey = k; break; }
            }
            if (!selectedKey) continue;
            const val = (sample as any)[selectedKey as string] as number | undefined;
            const v = normalizeOrPassThrough(val as any);
            pushData(ch.id, v);
          }
        }
      } catch (err) {
        // swallow
      }
    }
  }), [channels, propSelectedChannels, instanceId]);

  // If device samples are disabled for this instance, clear any existing
  // buffers so the plot goes blank instead of showing stale data.
  useEffect(() => {
    if (allowDeviceSamples) return;

    try {
      visibleChannels.forEach((channel) => {
        const buffer = dataBuffers.current.get(channel.id);
        const line = linesRef.current.get(channel.id);
        if (buffer) {
          for (let i = 0; i < buffer.length; i++) buffer[i] = 0;
        }
        if (line) {
          for (let i = 0; i < line.numPoints; i++) line.setY(i, 0);
        }
      });
    } catch (err) {
      // swallow
    }
  }, [allowDeviceSamples, visibleChannels]);

  // Derive a display label from the internal channel id (e.g., `ch0`).
  // This ensures the UI reflects the repository-wide 0-based indexing
  // while still allowing `channel.name` to be used as a fallback.
  const getChannelDisplayLabel = (channel: Channel) => {
    try {
      const m = String(channel.id).match(/ch(\d+)/i);
      if (m) return `CH ${parseInt(m[1], 10)}`; // show zero-based label: CH 0
    } catch (err) {
      // ignore and fallback
    }
    return channel.name;
  };

  return (
    <div
      style={{
        width: width || 400,
        height: height,
        borderRadius: '4px',
        overflow: 'hidden',
        backgroundColor: backgroundColor,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}
      className="overflow-hidden"
    >
      {/* Channel Canvases */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {visibleChannels.map((channel, index) => (
          <div key={channel.id} className="relative overflow-hidden flex items-center justify-center" style={{ 
            height: dynamicChannelHeight,
            flex: 'none'
          }}>
            {/* Channel Label */}
          <div className="absolute top-1 left-2 z-10 text-xs font-medium px-2 py-1 bg-white bg-opacity-90 rounded "
            style={{ color: channel.color }}>
          {getChannelDisplayLabel(channel)}
        </div>
            
            {/* Channel Canvas */}
            <canvas
              ref={(el) => {
                if (el) {
                  canvasRefs.current.set(channel.id, el);
                } else {
                  canvasRefs.current.delete(channel.id);
                }
              }}
              style={{
                display: 'block',
                backgroundColor: 'transparent',
                width: '100%',
                height: '100%',
                borderBottom: index < visibleChannels.length - 1 ? '1px solid rgba(0,0,0,0.1)' : 'none'
              }}
            />

            {/* Grid overlay for each channel */}
            {showGrid && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: `
                    linear-gradient(rgba(0, 0, 0, 0.05) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(0, 0, 0, 0.05) 1px, transparent 1px)
                  `,
                  backgroundSize: `50px ${Math.max(20, dynamicChannelHeight / 4)}px`
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

export default BasicGraphRealtime;
