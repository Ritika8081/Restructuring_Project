/**
 * src/components/DraggableWidget.tsx
 *
 * Purpose: Core draggable widget wrapper used by the dashboard grid. Handles
 * rendering of different widget types (basic plot, FFT, spiderplot, candle,
 * statistics), drag/resize interactions, incoming connections and contextual
 * controls. This component is memoized for performance.
 *
 * Exports: default memoized DraggableWidget
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import SpiderPlot from '@/components/SpiderPlot';
import CandleChart from '@/components/Candle';
import StatisticGraph from '@/components/StatisticGraph';
import FFTPlotRealtime from '@/components/FFTPlot';
import BasicGraphRealtime from '@/components/BasicGraph';
import Envelope from '@/components/Envelope';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useChannelData } from '@/lib/channelDataContext';
import { FFT } from '@/lib/fft';
import { computeBandPowers, BANDS } from '@/lib/bandpower';
import { Widget, GridSettings, DragState } from '@/types/widget.types';
import { checkCollisionAtPosition } from '@/utils/widget.utils';

/**
 * Memoized DraggableWidget component for optimal performance
 * Handles widget rendering, drag/resize interactions, and content display
 */
type DraggableWidgetProps = {
    widget: Widget;
    widgets: Widget[];
    onRemove: (id: string) => void;
    gridSettings: GridSettings;
    dragState: DragState;
    setDragState: React.Dispatch<React.SetStateAction<DragState>>;
    onUpdateWidget?: (id: string, updates: Partial<Widget>) => void;
    children?: React.ReactNode;
    incomingConnections?: string[];
};

const DraggableWidget = React.memo<DraggableWidgetProps>(({ widget, widgets, onRemove, gridSettings, dragState, setDragState, onUpdateWidget, children, incomingConnections = [] }) => {
    // Widget-specific channel state (for basic signal widgets)
    // Prefer explicit `widget.channelIndex` (set by the arranger) and fall back to parsing widget.id
    const [widgetChannels, setWidgetChannels] = useState<any[]>(() => {
        try {
            if (widget && widget.type === 'basic') {
                // Prefer explicit channelIndex property when present
                const propIndex = (widget as any).channelIndex;
                const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
                if (typeof propIndex === 'number' && propIndex >= 0) {
                    const idx = Math.max(0, Math.floor(propIndex));
                    const color = colors[idx % colors.length];
                    // channel data keys are zero-based (ch0, ch1, ...). Use ch{idx} as id.
                    // Use zero-based human-readable label to match BasicGraph (e.g. 'CH 0').
                    return [{ id: `ch${idx}`, name: `CH ${idx}`, color, visible: true }];
                }
                // Fallback to parsing id (legacy behavior)
                if (typeof widget.id === 'string' && widget.id.startsWith('channel-')) {
                    const m = widget.id.match(/channel-(\d+)/i);
                    const idx = m ? Math.max(0, parseInt(m[1], 10)) : 0;
                    const color = colors[idx % colors.length];
                    return [{ id: `ch${idx}`, name: `CH ${idx}`, color, visible: true }];
                }
            }
        } catch (err) {
            // fallthrough
        }
    return [{ id: 'ch0', name: 'CH 1', color: '#10B981', visible: true }];
    });

    // If the widget prop changes (for example arranger sets widget.channelIndex), update
    // the internal widgetChannels so the displayed data follows the assigned channel.
    useEffect(() => {
        try {
            if (widget && widget.type === 'basic') {
                const propIndex = (widget as any).channelIndex;
                const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
                if (typeof propIndex === 'number' && propIndex >= 0) {
                    const idx = Math.max(0, Math.floor(propIndex));
                    const color = colors[idx % colors.length];
                    // zero-based channel id (ch0, ch1, ...)
                    // Keep human-readable label zero-based to match BasicGraph
                    setWidgetChannels([{ id: `ch${idx}`, name: `CH ${idx}`, color, visible: true }]);
                    return;
                }
                // Fallback to parse id
                if (typeof widget.id === 'string' && widget.id.startsWith('channel-')) {
                    const m = widget.id.match(/channel-(\d+)/i);
                    const idx = m ? Math.max(0, parseInt(m[1], 10)) : 0;
                    const color = colors[idx % colors.length];
                    // zero-based channel id (ch0, ch1, ...)
                    // Keep human-readable label zero-based to match BasicGraph
                    setWidgetChannels([{ id: `ch${idx}`, name: `CH ${idx}`, color, visible: true }]);
                    return;
                }
            }
        } catch (err) {
            // ignore
        }
        // Default fallback keep existing value
    }, [widget.id, (widget as any).channelIndex]);

    // Global channel samples from context (used by multiple widget render paths)
    const { samples, subscribeToWidgetOutputs, samplingRate } = useChannelData();

    // FFT input data computed from the first incoming channel connection (if any)
    const [fftInputData, setFftInputData] = useState<number[] | undefined>(undefined);

    useEffect(() => {
        // Only compute FFT when this widget is an FFTGraph and has incomingConnections
        if (widget.type !== 'FFTGraph') return;
        if (!incomingConnections || incomingConnections.length === 0) {
            setFftInputData(undefined);
            return;
        }

        // Prefer the first channel source. If it's a filter node, it will have been
        // expanded upstream so plots receive original channel-* ids.
        const src = String(incomingConnections[0] || '');
        if (!src.startsWith('channel-')) {
            setFftInputData(undefined);
            return;
        }

        const m = src.match(/channel-(\d+)/i);
        const chIdx = m ? Math.max(0, parseInt(m[1], 10)) : 0;
        const key = `ch${chIdx}`;

        // FFT size (power of two). Match the FFTPlot bufferSize (256) for best visuals.
        const fftSize = 256;

        // Pull the most recent fftSize samples from the provider (samples are normalized -1..1)
        const recent = samples.slice(-fftSize);
        if (!recent || recent.length === 0) {
            setFftInputData(undefined);
            return;
        }

        // Build input Float32Array of length fftSize (pad with zeros on the left if necessary)
        const input = new Float32Array(fftSize);
        const start = Math.max(0, recent.length - fftSize);
        // If recent.length < fftSize, we align to the right and leave leading zeros
        const offset = fftSize - (recent.length - start);
        for (let i = 0; i < fftSize; i++) {
            const srcIdx = start + (i - offset);
            const v = (srcIdx >= start && srcIdx < recent.length) ? ((recent[srcIdx] as any)[key] ?? 0) : 0;
            input[i] = v;
        }

        try {
            const fft = new FFT(fftSize);
            const mags = fft.computeMagnitudes(input); // Float32Array length fftSize/2
            // Debug log to help trace why nothing is plotted
            try { console.debug('[FFT] computed mags', { src, chIdx, recentLen: recent.length, magsLen: mags.length, firstMags: Array.from(mags.slice(0, 8)) }); } catch (e) { }
            setFftInputData(Array.from(mags));
        } catch (err) {
            // If FFT fails, clear input and log
            try { console.error('[FFT] compute failed', err); } catch (e) { }
            setFftInputData(undefined);
        }
    }, [samples, incomingConnections, widget.type]);

    // Enhanced FFT input handling: allow the first incoming source to be a
    // widget that publishes numeric outputs (e.g. Envelope). Subscribe to
    // that widget's published values and compute FFT from the rolling buffer.
    useEffect(() => {
        if (widget.type !== 'FFTGraph') return;
        if (!incomingConnections || incomingConnections.length === 0) return;

        const src = String(incomingConnections[0] || '');
        // If source is a channel, the other effect already handled it.
        if (src.startsWith('channel-')) return;

        if (!subscribeToWidgetOutputs || !src) return;

        const fftSize = 256;
        const buffer: number[] = new Array(fftSize).fill(0);
        let idx = 0;

        const unsub = subscribeToWidgetOutputs(src, (vals) => {
            try {
                for (const v of vals) {
                    buffer[idx] = typeof v === 'number' ? v : 0;
                    idx = (idx + 1) % fftSize;
                }
                // Build input aligned to most recent sample
                const input = new Float32Array(fftSize);
                let p = idx;
                for (let i = 0; i < fftSize; i++) {
                    input[i] = buffer[p];
                    p = (p + 1) % fftSize;
                }
                try {
                    const fft = new FFT(fftSize);
                    const mags = fft.computeMagnitudes(input);
                    setFftInputData(Array.from(mags));
                } catch (err) {
                    try { console.error('[FFT] compute (widget-src) failed', err); } catch (e) { }
                    setFftInputData(undefined);
                }
            } catch (err) { /* ignore per-batch subscriber errors */ }
        });

        return () => { try { unsub(); } catch (e) { } };
    }, [incomingConnections, widget.type, subscribeToWidgetOutputs]);

    /**
     * Handle mouse down events for drag/resize operations
     * Initializes drag state with current widget and mouse positions
     */
    const handleMouseDown = useCallback((e: React.MouseEvent, type: 'move' | 'resize') => {
        e.preventDefault();
        e.stopPropagation();

        setDragState({
            isDragging: true,
            dragType: type,
            startX: widget.x,
            startY: widget.y,
            startWidth: widget.width,
            startHeight: widget.height,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            activeWidgetId: widget.id,
        });
    }, [widget, setDragState]);

    /**
     * Handle widget removal with event propagation prevention
     */
    const handleRemove = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onRemove(widget.id);
    }, [widget.id, onRemove]);

    /**
     * Handle size request from BasicGraph component - resize to exact needed size
     */
    const handleSizeRequest = useCallback((minWidth: number, minHeight: number) => {
        if (widget.type === 'basic' && onUpdateWidget) {
            const totalWidthNeeded = minWidth + 12;
            const totalHeightNeeded = minHeight + 60;
            
            const requiredGridWidth = Math.ceil(totalWidthNeeded / gridSettings.cellWidth);
            const requiredGridHeight = Math.ceil(totalHeightNeeded / gridSettings.cellHeight);
            
            const minGridWidth = 5;
            const minGridHeight = 4;
            
            const newWidth = Math.max(widget.width, requiredGridWidth, minGridWidth);
            const newHeight = Math.max(widget.height, requiredGridHeight, minGridHeight);
            
            if (widget.width < newWidth || widget.height < newHeight) {
                const wouldCollide = checkCollisionAtPosition(
                    widgets.filter(w => w.id !== widget.id), 
                    widget.id, 
                    widget.x, 
                    widget.y, 
                    newWidth, 
                    newHeight, 
                    gridSettings
                );
                
                if (!wouldCollide) {
                    // Avoid assigning large epoch-based zIndex values which can
                    // inadvertently float widgets above modal overlays. Keep zIndex
                    // in a small, controlled range (allow caller to manage z-index
                    // if needed via `onUpdateWidget` elsewhere).
                    onUpdateWidget(widget.id, { 
                        width: newWidth,
                        height: newHeight,
                        minWidth: Math.max(widget.minWidth || 1, minGridWidth),
                        minHeight: Math.max(widget.minHeight || 1, minGridHeight),
                    });
                }
            }
        }
    }, [widget, widgets, onUpdateWidget, gridSettings]);

    // Note: in-widget channel add/remove controls were removed intentionally so channel
    // assignment is controlled exclusively from the Flow modal (channelCount / flow options).

    /**
     * Memoized style calculation for widget positioning and sizing
     */
    const style = useMemo(() => ({
        left: widget.x * gridSettings.cellWidth,
        top: widget.y * gridSettings.cellHeight,
        width: widget.width * gridSettings.cellWidth,
        height: widget.height * gridSettings.cellHeight,
        zIndex: dragState.activeWidgetId === widget.id ? 100 : (widget.zIndex || 10),
    }), [widget, gridSettings, dragState.activeWidgetId]);

    const isDragging = dragState.activeWidgetId === widget.id;

    /**
     * Generate appropriate widget title based on type and size
     */
    const getWidgetTitle = useCallback((type: string, width: number) => {
        const titles = {
            basic: 'Plot',
            spiderplot: width >= 4 ? 'Spider Plot' : 'Radar',
            FFTGraph: width >= 3 ? 'FFT Spectrum' : 'FFT',
            bargraph: width >= 3 ? 'Statistics' : 'Stats',
        };
        return titles[type as keyof typeof titles] || type;
    }, []);

    /**
     * Generate channel information display for signal widgets
     */
    const getChannelInfo = useCallback(() => {
        if (widget.type === 'basic' && widgetChannels.length > 0) {
            const visibleChannels = widgetChannels.filter(ch => ch.visible);
            return ` (${visibleChannels.length} CH)`;
        }
        return '';
    }, [widget.type, widgetChannels]);

    // Consider this a channel-sourced widget when it either has an explicit channelIndex
    // (created by the arranger) or its id is a channel id like 'channel-0'. For those we
    // want the header and graph controls to match Channel widgets.
    const isChannelWidget = useMemo(() => {
        // Treat as a true "channel widget" only when the widget id is a channel id
        // (explicit channel widget) or when it has an explicit channelIndex AND
        // it is NOT a 'basic' (Plot) widget. This avoids treating arranged Plot
        // widgets (which receive a channelIndex for layout) as channel-sourced
        // for live device data unless they are actually a channel widget.
        if (typeof widget.id === 'string' && widget.id.startsWith('channel-')) return true;
        if ((widget as any).channelIndex && typeof (widget as any).channelIndex === 'number' && widget.type !== 'basic') return true;
        return false;
    }, [widget]);

    // Hide the small header input/output circles for 'basic' (Plot) widgets in the
    // dashboard — those circles are only visual markers for channel-sourced widgets
    // (e.g., channel-#). Keep isChannelWidget logic for internal behavior (controls,
    // legend, and data binding) but don't render the header circles for 'basic'.
    const showHeaderCircles = useMemo(() => {
        return isChannelWidget && widget.type !== 'basic';
    }, [isChannelWidget, widget.type]);

    // Auto-expand widget size when multiple channels are assigned so the UI has room.
    useEffect(() => {
        if (!onUpdateWidget) return;
        const chCount = widgetChannels.length;
        if (chCount <= 1) return;
        // Compute desired minimum grid width/height for multi-channel plots
        const extraPerChannel = 1; // grid cells per extra channel
        const baseMinWidth = 6;
        const desiredWidth = Math.max(widget.width, baseMinWidth + (chCount - 1) * extraPerChannel);
        const desiredHeight = Math.max(widget.height, 5);
        if (desiredWidth !== widget.width || desiredHeight !== widget.height) {
            // Try to update widget size, avoid collisions
            const wouldCollide = checkCollisionAtPosition(
                widgets.filter(w => w.id !== widget.id),
                widget.id,
                widget.x,
                widget.y,
                desiredWidth,
                desiredHeight,
                gridSettings
            );
            if (!wouldCollide) {
                onUpdateWidget(widget.id, { width: desiredWidth, height: desiredHeight });
            }
        }
    }, [widgetChannels.length]);

    // Calculate available space for widget content
    const availableWidth = widget.width * gridSettings.cellWidth - 4;
    const availableHeight = widget.height * gridSettings.cellHeight;

    // Refs for imperative APIs
    const basicGraphRef = React.useRef<any>(null);
    // Bandpower state for statistic widgets
    const [bandStats, setBandStats] = React.useState<Array<{ label: string; value: number }>>([]);

    // If this basic widget receives upstream widget outputs (non-channel ids),
    // subscribe to those outputs and push values into the BasicGraph via
    // its imperative `updateData` API so users can connect any widget output
    // to this plot without changing code elsewhere.
    useEffect(() => {
        if (widget.type !== 'basic') return;
        if (!incomingConnections || incomingConnections.length === 0) return;
        const sources = incomingConnections.filter(id => { try { return !String(id).startsWith('channel-'); } catch (e) { return false; } });
        if (sources.length === 0) return;
        if (!subscribeToWidgetOutputs) return;

        const unsubs: Array<() => void> = [];
        for (const s of sources) {
            try {
                const unsub = subscribeToWidgetOutputs(String(s), (vals) => {
                    try {
                        if (!basicGraphRef.current) return;
                        for (const v of vals) {
                            if (typeof v === 'number') {
                                // push as single-element array so selectedChannels maps it
                                try { basicGraphRef.current.updateData([v]); } catch (e) { /* ignore */ }
                            } else if (Array.isArray(v)) {
                                try { basicGraphRef.current.updateData(v as any); } catch (e) { }
                            }
                        }
                    } catch (err) { /* ignore per-callback errors */ }
                });
                if (unsub) unsubs.push(unsub);
            } catch (err) { /* ignore subscribe errors */ }
        }

        return () => { for (const u of unsubs) try { u(); } catch (e) { } };
    }, [widget.type, incomingConnections, subscribeToWidgetOutputs]);

    // Compute band powers for statistic/bargraph widgets from upstream sources
    useEffect(() => {
        if (!(widget.type === 'bargraph' || widget.type === 'statistic')) return;
        setBandStats([]);
        if (!incomingConnections || incomingConnections.length === 0) return;

        const src = String(incomingConnections[0] || '');
    const fftSize = 256;
    const sr = samplingRate || 256; // fallback

        // If source is a channel, compute from recent samples
        if (src.startsWith('channel-')) {
            const m = src.match(/channel-(\d+)/i);
            const chIdx = m ? Math.max(0, parseInt(m[1], 10)) : 0;
            const key = `ch${chIdx}`;
            const recent = samples.slice(-fftSize);
            const input: number[] = new Array(fftSize).fill(0);
            const start = Math.max(0, recent.length - fftSize);
            const offset = fftSize - (recent.length - start);
            for (let i = 0; i < fftSize; i++) {
                const srcIdx = start + (i - offset);
                input[i] = (srcIdx >= start && srcIdx < recent.length) ? ((recent[srcIdx] as any)[key] ?? 0) : 0;
            }
            try {
                const { relative } = computeBandPowers(input, sr, fftSize);
                const data = Object.keys(BANDS).map(b => ({ label: b, value: (relative as any)[b] * 100 }));
                setBandStats(data);
            } catch (err) { /* ignore */ }
            return;
        }

        // If source is another widget, subscribe to its published outputs and build a rolling buffer
        if (!subscribeToWidgetOutputs) return;
        const buffer: number[] = new Array(fftSize).fill(0);
        let idx = 0;
        const unsub = subscribeToWidgetOutputs(src, (vals) => {
            try {
                for (const v of vals) {
                    buffer[idx] = typeof v === 'number' ? v : 0;
                    idx = (idx + 1) % fftSize;
                }
                // Build aligned signal
                const signal: number[] = new Array(fftSize);
                let p = idx;
                for (let i = 0; i < fftSize; i++) { signal[i] = buffer[p]; p = (p + 1) % fftSize; }
                const { relative } = computeBandPowers(signal, sr, fftSize);
                const data = Object.keys(BANDS).map(b => ({ label: b, value: (relative as any)[b] * 100 }));
                setBandStats(data);
            } catch (err) { /* ignore per-callback errors */ }
        });
        return () => { try { unsub(); } catch (e) { } };
    }, [widget.type, incomingConnections, samples, subscribeToWidgetOutputs]);

    return (
        <div
            className={`absolute bg-white rounded-lg border border-gray-200 group select-none transition-all duration-200
                ${isDragging ? ' ring-2 ring-blue-300' : ''}`}
            style={style}
        >

            {/* Widget Content Area */}
            <div
                className="cursor-move overflow-hidden relative"
                onMouseDown={(e) => handleMouseDown(e, 'move')}
                style={{
                    height: '100%',
                    width: '100%'
                }}
            >
                <ErrorBoundary
                    fallback={
                        <div className="p-4 text-red-500 bg-red-50 rounded border border-red-200 m-2">
                            <div className="text-sm">⚠️ Widget Loading Error</div>
                            <div className="text-xs mt-1">Failed to render {widget.type} widget</div>
                        </div>
                    }
                >
                    {/* Widget content rendering */}
                    {widget.type === 'spiderplot' ? (
                            (() => {
                                // Compute SpiderPlot axis values from live channel samples when available
                            const axisData = incomingConnections.length > 0 ? incomingConnections.map((id, idx) => {
                                // Ignore unknown/non-channel ids and treat them as zero-valued.
                                if (String(id).startsWith('filter-')) {
                                    return { label: id, value: 0, maxValue: 100 };
                                }
                                const m = String(id).match(/channel-(\d+)/i);
                                const chIndex = m ? Math.max(0, parseInt(m[1], 10) - 1) : idx;
                                const key = `ch${chIndex}`;
                                const N = 128;
                                const recent = samples.slice(-N);
                                const values = recent.map(s => (s as any)[key] ?? 0);
                                const rms = values.length > 0 ? Math.sqrt(values.reduce((acc, v) => acc + (v * v), 0) / values.length) : 0;
                                // Scale RMS to 0-100 range for visualization (adjustable)
                                const value = Math.min(100, rms * 100);
                                return { label: id, value, maxValue: 100 };
                            }) : undefined;

                            return (
                                <SpiderPlot
                                    width={availableWidth}
                                    height={availableHeight}
                                    showLabels={widget.width >= 3 && widget.height >= 3}
                                    showValues={widget.width >= 4 && widget.height >= 4}
                                    animated={true}
                                    backgroundColor="rgba(16, 185, 129, 0.02)"
                                    data={axisData}
                                />
                            );
                        })()
                    ) : widget.type === 'FFTGraph' ? (
                        <div className="relative w-full h-full">
                            {availableWidth > 100 && availableHeight > 80 ? (
                                <>
                                <FFTPlotRealtime
                                    color="#3B82F6"
                                    width={availableWidth}
                                    height={availableHeight}
                                    bufferSize={256}
                                    showGrid={widget.width >= 3}
                                    backgroundColor="rgba(59, 130, 246, 0.05)"
                                    inputData={fftInputData}
                                />
                                {/* Debug overlay to show upstream/fft data status */}
                                <div style={{ position: 'absolute', left: 6, top: 6,  color: 'black', padding: '6px 8px', borderRadius: 6, fontSize: 11, zIndex: 20 }}>
                                   
                                    <div>src: {String(incomingConnections && incomingConnections[0] ? incomingConnections[0] : '—')}</div>
                                    {(() => {
                                        try {
                                            const src = String(incomingConnections && incomingConnections[0] ? incomingConnections[0] : '');
                                            const m = src.match(/channel-(\d+)/i);
                                            const chIdx = m ? Math.max(0, parseInt(m[1], 10)) : null;
                                            return <div>chIdx: {chIdx ?? '—'}</div>;
                                        } catch (e) { return <div>chIdx: —</div>; }
                                    })()}
                                    {/* <div>recent samples: {samples ? samples.length : '—'}</div>
                                    <div>fft bins: {fftInputData ? fftInputData.length : '—'}</div> */}
                                </div>
                                </>
                            ) : (
                                <div className="flex items-center justify-center h-full text-gray-400 text-xs">
                                    FFT widget too small to display graph
                                </div>
                            )}
                        </div>
                    ) : widget.type === 'bargraph' || widget.type === 'statistic' ? (
                        <div className="w-full h-full">
                            <StatisticGraph
                                width={availableWidth}
                                height={availableHeight}
                                data={bandStats && bandStats.length > 0 ? bandStats : [
                                    { label: 'delta', value: 0 },
                                    { label: 'theta', value: 0 },
                                    { label: 'alpha', value: 0 },
                                    { label: 'beta', value: 0 },
                                    { label: 'gamma', value: 0 }
                                ]}
                                type="bar"
                                showLabels={true}
                                showValues={true}
                            />
                        </div>
                    ) : widget.type === 'candle' ? (
                        <div className="w-full h-full overflow-hidden flex items-center justify-center p-0.5">
                            {(() => {
                                // Determine betaPower from incoming connection
                                let betaValue = 0;
                                if (incomingConnections && incomingConnections.length > 0) {
                                    const src = incomingConnections[0];
                                    if (String(src).startsWith('filter-')) {
                                        // Unknown/non-channel source: treat as zero
                                        betaValue = 0;
                                    } else {
                                        // assume channel-x
                                        const m = String(src).match(/channel-(\d+)/i);
                                        const chIndex = m ? Math.max(0, parseInt(m[1], 10) - 1) : 0;
                                        const key = `ch${chIndex}`;
                                        const recent = samples.slice(-128);
                                        if (recent.length > 0) {
                                            const vals = recent.map(s => (s as any)[key] ?? 0) as number[];
                                            const rms = Math.sqrt(vals.reduce((acc: number, v: number) => acc + v * v, 0) / vals.length);
                                            betaValue = Math.min(100, rms * 100);
                                        }
                                    }
                                }
                                return <CandleChart width={availableWidth - 4} height={availableHeight - 4} betaPower={betaValue} />;
                            })()}
                        </div>
                    ) : widget.type === 'basic' ? (
                        (() => {
                            // Determine channels for this basic widget from incoming flow connections.
                            // Only channel-* sources provide live device samples. If there are no
                            // channel connections and this widget is not explicitly a channel-sourced
                            // widget (arranger-assigned), then do not pass device samples.
                            const connChannels: any[] = [];
                            if (incomingConnections && incomingConnections.length > 0) {
                                incomingConnections.forEach((src) => {
                                    try {
                                        const s = String(src);
                                        if (s.startsWith('channel-')) {
                                            const m = s.match(/channel-(\d+)/i);
                                            // Parse zero-based channel index from id: 'channel-0' -> 0
                                            const idx = m ? Math.max(0, parseInt(m[1], 10)) : 0;
                                            // If this dashboard widget is a Plot (`basic`) and the arranger
                                            // assigned a channelIndex, only accept connections that map
                                            // to the same channel index. This enforces channel0 -> plot-0,
                                            // channel1 -> plot-1, etc.
                                            const assignedIdx = (widget as any).channelIndex;
                                            if (widget.type === 'basic' && typeof assignedIdx === 'number') {
                                                if (idx !== assignedIdx) {
                                                    // skip channels that don't match this plot instance
                                                    return;
                                                }
                                            }
                                            const color = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'][idx % 6];
                                            connChannels.push({ id: `ch${idx}`, name: `CH ${idx + 1}`, color, visible: true });
                                        }
                                    } catch (err) {
                                        // ignore malformed connection ids
                                    }
                                });
                            }

                            // If there are no incoming channel connections, but the widget itself
                            // is channel-sourced (arranger assigned) AND it's not a Plot
                            // (basic) widget, fall back to widgetChannels.
                            const finalChannels = connChannels.length > 0 ? connChannels : (isChannelWidget && widget.type !== 'basic' ? widgetChannels : []);
                            // Allow device samples only when the widget has an incoming
                            // channel connection or when it is an actual channel widget
                            // (not when it's a Plot arranged with a channelIndex).
                            const allowDevice = connChannels.length > 0 || (isChannelWidget && widget.type !== 'basic');

                            // Debug: log why this BasicGraph is allowed to consume device data
                            // (temporary; remove after troubleshooting)
                            // try {
                            //     // use console.debug so normal logs stay clean
                            //     console.debug('[DraggableWidget] BasicGraph render', {
                            //         widgetId: widget.id,
                            //         allowDevice,
                            //         finalChannels,
                            //         incomingConnections,
                            //         isChannelWidget,
                            //     });
                            // } catch (err) {}

                            return (
                                <div className="w-full h-full overflow-hidden flex items-center justify-center p-0.5">
                                    <BasicGraphRealtime
                                        ref={basicGraphRef}
                                        channels={finalChannels}
                                        // Inject device samples from context only when allowed
                                        deviceSamples={allowDevice ? samples : undefined}
                                        // Pass widget id so BasicGraph logs are traceable
                                        instanceId={widget.id}
                                        width={availableWidth - 4}
                                        height={availableHeight - 4}
                                        bufferSize={512}
                                        showGrid={widget.width >= 3}
                                        backgroundColor="rgba(16, 185, 129, 0.02)"
                                        // Only allow live device samples when there is a channel connection
                                        // or when this widget is explicitly channel-sourced by the arranger.
                                        allowDeviceSamples={allowDevice}
                                        sampleRate={60}
                                        timeWindow={8}
                                        onSizeRequest={handleSizeRequest}
                                        showChannelControls={isChannelWidget}
                                        showLegend={isChannelWidget}
                                        // For upstream widget-output streams we will push arrays via the
                                        // imperative `updateData` API. The `selectedChannels` prop maps
                                        // incoming array indices to plotted channels.
                                        selectedChannels={[0]}
                                    />
                                </div>
                            );
                        })()
                    ) : children ? (
                        <div className="w-full h-full flex items-center justify-center p-2">
                            {children}
                        </div>
                    ) : (
                        <div className="text-gray-500 text-center flex items-center justify-center h-full">
                            <div>
                                <div className="text-2xl mb-2">📊</div>
                                <div className="text-sm">{widget.type}</div>
                            </div>
                        </div>
                    )}
                </ErrorBoundary>
            </div>

            {/* Resize Handle */}
            <div
                className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize opacity-40 group-hover:opacity-100 transition-opacity duration-200 z-40 bg-white bg-opacity-50 hover:bg-opacity-100 rounded-tl-md flex items-center justify-center"
                onMouseDown={(e) => handleMouseDown(e, 'resize')}
                title="Resize widget"
            >
                <div className="w-3 h-3 border-b-2 border-r-2 border-gray-400 hover:border-gray-600"></div>
            </div>
        </div>
    );
});

DraggableWidget.displayName = 'DraggableWidget';

export default DraggableWidget;