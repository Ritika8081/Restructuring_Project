"use client";

/**
 * src/components/SpiderPlot.tsx
 *
 * Purpose: Radial/spider plot visualization that aggregates multiple
 * channel-derived values (e.g. brainwave band powers) into a single
 * radar-like view. Integrates with a bandpower worker for live data.
 *
 * Exports: default SpiderPlot React component
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { WebglPlot, WebglLine, ColorRGBA } from 'webgl-plot';

interface SpiderPlotData {
    label: string;
    value: number;
    maxValue?: number;
}

interface SpiderPlotProps {
    // `data` can be either an array of labeled points or a canonical
    // numeric band-array in the form [delta, theta, alpha, beta, gamma]
    // (fractions 0..1 or percentages).
    data?: SpiderPlotData[] | number[];
    width?: number;
    height?: number;
    colors?: {
        web: string;
        fill: string;
        stroke: string;
        points: string;
        labels: string;
    };
    showLabels?: boolean;
    showValues?: boolean;
    // Show HTML tooltip overlay on hover
    showTooltip?: boolean;
    // Show HTML legend (swatches + values) when not in `simplePlot`
    showLegend?: boolean;
    // When true, enable verbose plot.addLine debug logging (console.debug)
    debugPlot?: boolean;
    // Draw multi-layered colorful outlines for the spider plot
    layeredOutline?: boolean;
    // Number of outline layers (outer -> inner). Outer layers are softer/glow, inner are crisp.
    outlineLayers?: number;
    // Draw curved/bezier accent lines along each edge for visual flair
    curvedAccents?: boolean;
    // How many curved accent strokes per edge (outer -> inner)
    accentCount?: number;
    // Curviness factor (relative to edge length) for accent control
    accentCurviness?: number;
    className?: string;
    backgroundColor?: string;
    webLevels?: number;
    animated?: boolean;
    // Optional widget id: when provided the component will publish
    // computed bandpower values via channelData.publishWidgetOutputs(widgetId, values)
    widgetId?: string;
    // Labels to exclude from plotting (case-ins
    // ensitive). When excluded
    // labels reduce the visible axes below 3, a minimal placeholder is shown.
    excludedLabels?: string[];
    // Show faint solid grid lines (concentric polygons + radial spokes)
    showGridLines?: boolean;
    // Draw concentric circular rings instead of polygon web when true
    circularGrid?: boolean;
    // Show a subtle dotted background pattern behind the widget
    dottedBackground?: boolean;
    // When true, render a very simple plot: no WebGL dotted lines, no
    // fancy gradients/halos, and no animated interpolation. Useful for
    // low-cost rendering and clearer visuals.
    simplePlot?: boolean;
    // When true, apply premium glassmorphism visuals and softer animations
    premium?: boolean;
    // Layout mode: 'spider' = classic radar; 'radialBars' = alternate radial-bar UI
    layout?: 'spider' | 'radialBars';
    // When true, enable a performance mode that disables heavy visuals
    // (layered outlines, accents, dotted background, premium glass). If
    // undefined, SpiderPlot will try to auto-detect a `.static-graph` node
    // in the DOM and enable performance mode when that node is visible.
    performanceMode?: boolean;
}

const SpiderPlot: React.FC<SpiderPlotProps> = ({
    data,
    width = 300,
    height = 300,
    colors = {
        web: '#c4c4caff',
        fill: '#22ab7dff',
        stroke: '#0b7f58ff',
        points: '#0e7c57ff',
        labels: '#8b929dff'
    },
    showLabels = true,
    showValues = true,
    className = '',
    backgroundColor = 'rgba(131, 128, 128, 0.02)',
    webLevels = 5,
    animated = true
    ,
    widgetId,
    excludedLabels = []
    ,
    showGridLines = true,
    circularGrid = false,
    dottedBackground = false,
    simplePlot = false,
    premium = true,
    performanceMode,
    showTooltip = true,
    showLegend = true,
    debugPlot = false,
    layeredOutline = true,
    outlineLayers = 10,
    curvedAccents = true,
    accentCount = 2,
    accentCurviness = 0.18,
    layout = 'spider'
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fillCanvasRef = useRef<HTMLCanvasElement>(null);
    const plotRef = useRef<any | null>(null);
    const animationRef = useRef<number | null>(null);
    
    const [isInitialized, setIsInitialized] = useState(false);
    const [animatedData, setAnimatedData] = useState<SpiderPlotData[]>([]);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; label?: string; value?: number }>({ visible: false, x: 0, y: 0 });
    // animatedPoints: smooth interpolation between frames for nicer UI
    const [animatedPoints, setAnimatedPoints] = useState<any[]>([]);
    const animatedPointsRef = useRef<any[] | null>(null);
    const rafAnimRef = useRef<number | null>(null);

    // Throttle heavy SpiderPlot renders to ~12 FPS to avoid UI churn
    const lastRenderRef = useRef<number>(0);
    const RENDER_MIN_MS = 80; // ~12.5 FPS
    const updateSpiderData = useCallback((ordered: SpiderPlotData[]) => {
        try {
            const now = performance.now();
            if (now - lastRenderRef.current < RENDER_MIN_MS) return; // skip too-frequent updates
            lastRenderRef.current = now;
            setAnimatedData(ordered);
        } catch (e) { /* swallow */ }
    }, [setAnimatedData]);

    // Runtime tunables (kept minimal for display-only SpiderPlot)
    const [displayMode, setDisplayMode] = useState<'relative' | 'absolute' | 'dB' | 'raw'>('relative');
    const [historyWindow, setHistoryWindow] = useState<number>(10);

    // Reusable history used for confidence-interval computation (updated from `data` prop)
    const histRef = useRef<Record<string, number[]>>({
        alpha: [], beta: [], gamma: [], theta: [], delta: []
    });
    // -------------------------------------------------------------------------------

    // Constants
    
    const WEB_RADIUS = 0.7;
    const LABEL_OFFSET = 0.15;

    // Auto-detect a `.static-graph` node to enable a low-cost performance mode
    const [detectedPerformanceMode, setDetectedPerformanceMode] = useState<boolean>(false);
    useEffect(() => {
        if (performanceMode !== undefined) return; // caller overrode auto-detection
        try {
            const el = document.querySelector('.static-graph');
            if (!el) return;
            const io = new IntersectionObserver((entries) => {
                const visible = entries.some(e => e.isIntersecting);
                setDetectedPerformanceMode(visible);
            }, { threshold: 0.05 });
            io.observe(el);
            return () => { try { io.disconnect(); } catch (e) { } };
        } catch (e) { }
    }, [performanceMode]);

    const perfModeEnabled = (performanceMode !== undefined) ? performanceMode : detectedPerformanceMode;

    const effSimplePlot = simplePlot || perfModeEnabled;
    const effLayeredOutline = layeredOutline && !perfModeEnabled;
    const effCurvedAccents = curvedAccents && !perfModeEnabled;
    const effDottedBackground = dottedBackground && !perfModeEnabled;
    const effPremium = premium && !perfModeEnabled;

    // (canonical labels are applied when mapping incoming `data`)

    // Initialize data with brainwave labels (always override any incoming labels)
    useEffect(() => {
        // Guaranteed canonical mapping: always output axes in the known
        // brainwave order (Alpha, Beta, Gamma, Theta, Delta).
        const canonicalOrder = ["Alpha", "Beta", "Gamma", "Theta", "Delta"];

        // Support two incoming shapes for `data`:
        //  - Array of labeled objects: SpiderPlotData[]
        //  - Canonical numeric band-array: number[] in order [delta, theta, alpha, beta, gamma]
        let ordered: SpiderPlotData[] = [];
        if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'number') {
            const arr = data as number[];
            // Convert fractions (0..1) to percentages, but tolerate already-percent values (>1)
            const toPercent = (v: number) => (v > 1 ? v : v * 100);
            const map: Record<string, number> = {
                Alpha: toPercent(arr[2] ?? 0),
                Beta: toPercent(arr[3] ?? 0),
                Gamma: toPercent(arr[4] ?? 0),
                Theta: toPercent(arr[1] ?? 0),
                Delta: toPercent(arr[0] ?? 0),
            };
            ordered = canonicalOrder.map(label => ({ label, value: Number((map[label] ?? 0).toFixed(1)), maxValue: 100 }));
        } else {
            const src = (data as SpiderPlotData[] | undefined) ?? [];
            ordered = canonicalOrder.map(label => {
                const found = src.find(d => d && typeof d === 'object' && 'label' in d && (String((d as any).label) || '').toLowerCase() === label.toLowerCase()) as SpiderPlotData | undefined;
                return (found ?? { label, value: 0, maxValue: 100 });
            });
        }

        const t0 = performance.now();
        // Throttle heavy renders — defer to `updateSpiderData` which enforces
        // a minimum interval between actual state updates so the canvas and
        // WebGL work doesn't run every incoming band update.
        updateSpiderData(ordered);
        try { console.debug('[SpiderPlot] init animatedData (throttled)', { ordered, timeMs: (performance.now() - t0) }); } catch (e) { }
    }, [data]);

    // Log changes to key rendering inputs so we can correlate expensive frames
    useEffect(() => {
        try {
            const t0 = performance.now();
            const valuesKey = animatedData.map(d => String(d.value ?? 0)).join(',');
            // measure next RAF paint time to approximate render latency
            requestAnimationFrame(() => {
                try { console.debug('[SpiderPlot] render trigger', { valuesKey, width, height, elapsedMs: performance.now() - t0 }); } catch (e) { }
            });
        } catch (e) { }
    }, [animatedData, width, height]);
    
    // Demo animation removed: SpiderPlot will only show live/worker-driven data.

    // Note: bandpower calculation and worker integration removed.
    // SpiderPlot is now display-only and renders from the incoming `data` prop.

    // Ensure a canonical ordering of labels across the component so angles, labels and
    // data values always align. This maps the current `animatedData` into the
    // canonical brainwave order and fills missing bands with zeroes.
    const plotData = useMemo(() => {
        const canonicalOrder = ["Alpha", "Beta", "Gamma", "Theta", "Delta"];
        const ordered = canonicalOrder.slice(0, Math.max(3, animatedData.length || 5)).map(label => {
            const found = animatedData.find(d => (d.label ?? '').toLowerCase() === label.toLowerCase());
            return (found ?? { label, value: 0, maxValue: 100 }) as SpiderPlotData;
        });
        return ordered;
    }, [animatedData]);

    // Filter out any excluded labels from the active dataset (case-insensitive)
    const filteredPlotData = useMemo(() => {
        const exclude = (excludedLabels || []).map(s => (s || '').toLowerCase());
        return plotData.filter(p => !exclude.includes((p.label || '').toLowerCase()));
    }, [plotData, excludedLabels]);

    // Memoize colors object so the rendering effect does not re-run every
    // render when a parent passes a new object reference with identical
    // color values.
    const colorsMemo = useMemo(() => ({ ...colors }), [colors.web, colors.fill, colors.stroke, colors.points, colors.labels]);

    // Stable primitive key representing current numeric data values.
    // Using a primitive key prevents the main rendering effect from
    // re-running due to object/array identity changes when values haven't
    // actually changed.
    const dataKey = useMemo(() => filteredPlotData.map(d => String(d.value ?? 0)).join(','), [filteredPlotData]);

    // Determine the dominant band for a small badge overlay
    const dominant = useMemo(() => {
        if (!filteredPlotData || filteredPlotData.length === 0) return null;
        let max = -Infinity;
        let idx = 0;
        for (let i = 0; i < filteredPlotData.length; i++) {
            if ((filteredPlotData[i].value ?? 0) > max) { max = filteredPlotData[i].value ?? 0; idx = i; }
        }
        return { index: idx, label: filteredPlotData[idx].label, value: Number(((filteredPlotData[idx].value ?? 0)).toFixed(1)) };
    }, [filteredPlotData]);

    // Convert hex color to ColorRGBA
    const hexToColorRGBA = (hex: string, alpha: number = 1.0): ColorRGBA => {
        const cleanHex = hex.replace('#', '');
        const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
        const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
        const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
        return new ColorRGBA(r, g, b, alpha);
    };

    // Convert hex to CSS rgba() string for 2D canvas fills
    const hexToRgbaString = (hex: string, alpha: number = 1.0) => {
        const clean = hex.replace('#', '');
        const r = parseInt(clean.substring(0, 2), 16);
        const g = parseInt(clean.substring(2, 4), 16);
        const b = parseInt(clean.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    // Return an rgba() string for a darkened version of the provided hex color.
    // `factor` < 1 darkens the color (0.0..1.0), `alpha` sets opacity.
    const darkenHexToRgba = (hex: string, factor: number = 0.85, alpha: number = 1.0) => {
        try {
            const clean = hex.replace('#', '');
            let r = Math.round(parseInt(clean.substring(0, 2), 16) * factor);
            let g = Math.round(parseInt(clean.substring(2, 4), 16) * factor);
            let b = Math.round(parseInt(clean.substring(4, 6), 16) * factor);
            r = Math.max(0, Math.min(255, r));
            g = Math.max(0, Math.min(255, g));
            b = Math.max(0, Math.min(255, b));
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        } catch (e) {
            return hexToRgbaString(hex, alpha);
        }
    };

    // Helper function to create dotted lines (stateless, does not cache values)
    const createDottedLine = (
        plot: WebglPlot,
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        color: ColorRGBA,
        thickness: number = 2,
        _density: number = 25
    ) => {
        // Stateless reliable dotted implementation: draw fixed number of segments
        const segments = 20;
        for (let i = 0; i < segments; i++) {
            // dotted style: draw segment only on even i
            if (i % 2 !== 0) continue;

            const t0 = i / segments;
            const t1 = Math.min(1, (i + 1) / segments);

            const x0 = startX + (endX - startX) * t0;
            const y0 = startY + (endY - startY) * t0;
            const x1 = startX + (endX - startX) * t1;
            const y1 = startY + (endY - startY) * t1;

            const segment = new WebglLine(color, thickness);
            segment.lineSpaceX(-1, 2 / 4);
            segment.setX(0, x0);
            segment.setY(0, y0);
            segment.setX(1, x1);
            segment.setY(1, y1);
            // Annotate debug coordinates and color so runtime wrapper can log exact endpoints
            try {
                const c = (color && typeof (color as any).r === 'number') ? { r: (color as any).r, g: (color as any).g, b: (color as any).b, a: (color as any).a } : undefined;
                (segment as any).__spiderDebug = { aX: x0, aY: y0, bX: x1, bY: y1, tag: 'dotted-seg', colorRGBA: c };
            } catch (e) { /* ignore */ }
            plot.addLine(segment);
        }
    };

    // Helper function to get colorful brainwave colors
    const getBrainwaveColor = (label: string): string => {
        const brainwaveColors = {
            'Alpha': '#10B981',    // Emerald - associated with relaxed awareness
            'Beta': '#3B82F6',     // Blue - associated with active concentration
            'Gamma': '#8B5CF6',    // Violet - associated with high-level cognitive processing
            'Theta': '#F59E0B',    // Amber - associated with creativity and deep meditation
            'Delta': '#EF4444'     // Red - associated with deep sleep and healing
        };
        return brainwaveColors[label as keyof typeof brainwaveColors] || colors.labels;
    };

    // Draw multi-layered colorful edge between two points, inset toward center
    const drawLayeredEdge = (
        fctx: CanvasRenderingContext2D,
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        centerX: number,
        centerY: number,
        baseColor: string,
        basePixelWidth: number,
        layers: number,
        maxInsetPx: number
    ) => {
        try {
            // helper to move a point towards center by up to insetPx (clamped)
            const moveTowardsCenter = (px: number, py: number, insetPx: number) => {
                const dx = centerX - px;
                const dy = centerY - py;
                const d = Math.hypot(dx, dy) || 1;
                const f = Math.min(0.95, insetPx / d);
                return { x: px + dx * f, y: py + dy * f };
            };

            // Draw layers from outer (largest inset) to inner (small inset)
            // Use evenly spaced inset so layers are visually separated.
            const layerSpacing = maxInsetPx / Math.max(1, layers);
            for (let layer = layers; layer >= 1; layer--) {
                // inset increases for outer layers so they sit inside the main outline
                const insetPx = layer * layerSpacing;

                const p0 = moveTowardsCenter(x0, y0, insetPx);
                const p1 = moveTowardsCenter(x1, y1, insetPx);

                // Make strokes very thin but visible: scale with canvas size and layer index
                const lw = Math.max(0.35, basePixelWidth * (0.28 + (layer / Math.max(1, layers)) * 0.6));
                // Prefer slightly higher alpha for inner layers to keep them visible
                const alpha = Math.min(0.28, 0.06 + (layer / Math.max(1, layers)) * 0.28);

                fctx.beginPath();
                fctx.moveTo(p0.x, p0.y);
                fctx.lineTo(p1.x, p1.y);

                // Slightly darken outer layers so the layered outline reads with
                // more depth. Compute a per-layer darkening factor (outer -> darker).
                const darkFactor = Math.max(0.6, 1 - (layer / Math.max(1, layers + 1)) * 0.36);
                if (layer === layers) {
                    // outermost: soft glow but darker and still thin
                    fctx.save();
                    fctx.shadowColor = darkenHexToRgba(baseColor, Math.max(0.64, darkFactor * 0.94), alpha * 0.9);
                    fctx.shadowBlur = Math.max(4, Math.round(basePixelWidth * 6));
                    fctx.strokeStyle = darkenHexToRgba(baseColor, darkFactor, alpha * 0.95);
                    fctx.lineWidth = lw;
                    fctx.lineCap = 'round';
                    fctx.stroke();
                    fctx.restore();
                } else if (layer === 1) {
                    // inner crisp stroke (thin but highest alpha) — keep near-original brightness
                    fctx.strokeStyle = darkenHexToRgba(baseColor, Math.min(1, 1 - ((1 / Math.max(1, layers + 1)) * 0.06)), Math.min(1, alpha + 0.28));
                    fctx.lineWidth = Math.max(0.5, lw * 0.9);
                    fctx.lineCap = 'round';
                    fctx.stroke();
                    // tiny lighter highlight for contrast
                    fctx.beginPath();
                    fctx.moveTo(p0.x, p0.y);
                    fctx.lineTo(p1.x, p1.y);
                    fctx.strokeStyle = 'rgba(255,255,255,0.32)';
                    fctx.lineWidth = Math.max(0.35, lw * 0.14);
                    fctx.lineCap = 'round';
                    fctx.stroke();
                } else {
                    // middle layers: thin strokes with moderate alpha and slightly darkened
                    fctx.strokeStyle = darkenHexToRgba(baseColor, darkFactor * 0.92, alpha * 0.95);
                    fctx.lineWidth = lw;
                    fctx.lineCap = 'round';
                    fctx.stroke();
                }
            }
        } catch (e) { /* ignore layer draw errors */ }
    };

    // Draw curved Bezier accent strokes along an edge
    const drawCurvedAccents = (fctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, count: number, curviness: number) => {
        try {
            const dx = x1 - x0;
            const dy = y1 - y0;
            const len = Math.hypot(dx, dy) || 1;
            // normal (perpendicular) vector
            let nx = -dy / len;
            let ny = dx / len;

            for (let i = 0; i < count; i++) {
                // offset magnitude: vary per accent so they don't overlap exactly
                const offsetT = (i + 1) / (count + 1); // 0..1
                const offset = (curviness * len) * (0.4 + 0.6 * offsetT);
                // alternate side for each accent for variety
                const side = (i % 2 === 0) ? 1 : -1;
                const ox = nx * offset * side;
                const oy = ny * offset * side;

                // control points along the segment (1/3 and 2/3), nudged by the offset
                const cp1x = x0 + dx * 0.33 + ox;
                const cp1y = y0 + dy * 0.33 + oy;
                const cp2x = x0 + dx * 0.66 + ox;
                const cp2y = y0 + dy * 0.66 + oy;

                // slight alpha and thin stroke for accents
                const alpha = Math.max(0.06, 0.28 * (0.9 - offsetT * 0.6));
                fctx.beginPath();
                fctx.moveTo(x0, y0);
                fctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x1, y1);
                fctx.strokeStyle = hexToRgbaString(color, alpha);
                fctx.lineWidth = Math.max(0.5, Math.min(2.2, len * 0.0025) * (0.8 - offsetT * 0.28));
                fctx.lineCap = 'round';
                fctx.setLineDash([2, 6]);
                fctx.stroke();
                fctx.setLineDash([]);
            }
        } catch (e) { /* ignore accent draw errors */ }
    };

    // Calculate polygon vertices for the web (inverted 180 degrees)
    const calculatePentagonVertices = useCallback((radius: number, sidesOverride?: number) => {
        const vertices: { x: number; y: number; angle: number }[] = [];
        const sides = Math.max(3, (sidesOverride ?? plotData.length) || 5);
        const angleStep = (2 * Math.PI) / sides;

        for (let i = 0; i < sides; i++) {
            const angle = i * angleStep + Math.PI / 2;
            vertices.push({
                x: radius * Math.cos(angle),
                y: radius * Math.sin(angle),
                angle
            });
        }
        return vertices;
    }, [plotData]);

    // Calculate data points positioned on the web (inverted 180 degrees)
    const calculateDataPoints = useCallback((dataSource?: SpiderPlotData[]) => {
        // Compute data points deterministically by canonical label order so angles
        // never become misaligned with labels even if upstream data ordering varies.
        const source = dataSource ?? plotData;
        const canonicalOrder = ["Alpha", "Beta", "Gamma", "Theta", "Delta"].filter(l => source.some(s => (s.label ?? '').toLowerCase() === l.toLowerCase()));
        const numPoints = Math.max(3, canonicalOrder.length || 5);

        return canonicalOrder.map((label, index) => {
            // Find the matching value in source by label (case-insensitive)
            const found = source.find(p => (p.label ?? '').toLowerCase() === label.toLowerCase()) as SpiderPlotData | undefined;
            const value = found?.value ?? 0;
            const maxVal = found?.maxValue ?? 100;
            const normalizedValue = Math.min(value / maxVal, 1);
            const pointRadius = WEB_RADIUS * normalizedValue;
            const angle = index * (2 * Math.PI / numPoints) + Math.PI / 2;

            return {
                x: pointRadius * Math.cos(angle),
                y: pointRadius * Math.sin(angle),
                value: Number(Number(value).toFixed(1)),
                label,
                angle,
                normalizedValue
            };
        });
    }, [plotData]);

    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const fillCanvas = fillCanvasRef.current;

        // Alternate layout: radialBars uses only the 2D fill canvas and does
        // not initialize the WebGL plot. This provides a completely different
        // visual for the SpiderPlot while remaining low-risk.
        if (layout === 'radialBars') {
            if (!fillCanvas || filteredPlotData.length === 0) {
                setIsInitialized(false);
                return;
            }

            const devicePixelRatio = window.devicePixelRatio || 1;
            fillCanvas.width = width * devicePixelRatio;
            fillCanvas.height = height * devicePixelRatio;
            fillCanvas.style.width = `${width}px`;
            fillCanvas.style.height = `${height}px`;
            const fctx = fillCanvas.getContext('2d');
            if (!fctx) return;
            fctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

            // Clear
            fctx.clearRect(0, 0, width, height);

            const centerX = width / 2;
            const centerY = height / 2;
            const baseRadius = Math.min(width, height) * 0.28;
            const barThickness = Math.min(width, height) * 0.048; // thinner bars

            const total = filteredPlotData.length;
            const gap = Math.PI * 0.02; // small gap between bars
            const arcSpan = (2 * Math.PI - total * gap) / total;

            // Draw background circle for subtle framing (thinner)
            fctx.beginPath();
            fctx.arc(centerX, centerY, baseRadius + barThickness * 1.3, 0, Math.PI * 2);
            fctx.fillStyle = hexToRgbaString(colors.web, 0.02);
            fctx.fill();

            filteredPlotData.forEach((d, i) => {
                const normalized = Math.min(1, Math.max(0, (d.value ?? 0) / (d.maxValue ?? 100)));
                const start = -Math.PI / 2 + i * (arcSpan + gap);
                const end = start + arcSpan;

                // background arc (track)
                fctx.beginPath();
                fctx.lineWidth = Math.max(2, Math.round(barThickness * 0.9));
                fctx.lineCap = 'round';
                fctx.strokeStyle = hexToRgbaString(colors.web, 0.14);
                fctx.arc(centerX, centerY, baseRadius, start, end);
                fctx.stroke();

                // foreground arc (value)
                fctx.beginPath();
                const valueEnd = start + (end - start) * normalized;
                fctx.lineWidth = Math.max(2, Math.round(barThickness * 0.9));
                fctx.lineCap = 'round';
                // gradient per bar from brighter to muted
                const grad = fctx.createLinearGradient(
                    centerX + Math.cos(start) * baseRadius,
                    centerY + Math.sin(start) * baseRadius,
                    centerX + Math.cos(valueEnd) * baseRadius,
                    centerY + Math.sin(valueEnd) * baseRadius
                );
                const bc = getBrainwaveColor(d.label);
                grad.addColorStop(0, hexToRgbaString(bc, 1));
                grad.addColorStop(1, hexToRgbaString(bc, 0.6));
                fctx.strokeStyle = grad;
                fctx.arc(centerX, centerY, baseRadius, start, valueEnd);
                fctx.stroke();

                // Label: draw text outside the arc (closer for thinner bars)
                const labelAngle = (start + end) / 2;
                const lx = centerX + (baseRadius + barThickness * 1.4) * Math.cos(labelAngle);
                const ly = centerY + (baseRadius + barThickness * 1.4) * Math.sin(labelAngle);
                fctx.font = `${Math.max(11, Math.round(Math.min(width, height) * 0.035))}px Inter, system-ui, -apple-system`;
                fctx.fillStyle = hexToRgbaString(colors.labels, 1);
                fctx.textAlign = 'center';
                fctx.textBaseline = 'middle';
                fctx.fillText(d.label, lx, ly);

                // Small numeric value below label
                const nvx = centerX + (baseRadius + barThickness * 2.0) * Math.cos(labelAngle);
                const nvy = centerY + (baseRadius + barThickness * 2.0) * Math.sin(labelAngle);
                fctx.font = `${Math.max(10, Math.round(Math.min(width, height) * 0.028))}px Inter, system-ui, -apple-system`;
                fctx.fillStyle = hexToRgbaString(colors.points, 0.95);
                fctx.fillText(`${Number(((d.value ?? 0)).toFixed(1))}`, nvx, nvy);
            });

            setIsInitialized(true);

            // no WebGL animation loop required for radialBars
            return () => {
                // nothing to teardown for radial bars
                try { if (fillCanvas) { const f = fillCanvas.getContext('2d'); if (f) f.clearRect(0, 0, width, height); } } catch (e) {}
                setIsInitialized(false);
            };
        }
        const devicePixelRatio = window.devicePixelRatio || 1;

        // Set canvas size
        canvas.width = width * devicePixelRatio;
        canvas.height = height * devicePixelRatio;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        // Setup fill canvas (2D) under the WebGL canvas to draw filled polygon
        if (fillCanvas) {
            fillCanvas.width = width * devicePixelRatio;
            fillCanvas.height = height * devicePixelRatio;
            fillCanvas.style.width = `${width}px`;
            fillCanvas.style.height = `${height}px`;
            // scale 2D context
            const fctx = fillCanvas.getContext('2d');
            if (fctx) {
                fctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
                // clear
                fctx.clearRect(0, 0, width, height);
            }
        }

        try {
            const plot = new WebglPlot(canvas);
            // Optionally wrap plot.addLine to emit debug info for every added line (helps trace stray lines)
            try {
                if (debugPlot) {
                    const originalAddLine = plot.addLine.bind(plot);
                    // @ts-ignore - runtime debug wrapper (kept only when debugPlot=true)
                    plot.addLine = (line: any) => {
                        try {
                            // Prefer explicit debug annotation when available (set when we construct lines)
                            if (line && line.__spiderDebug) {
                                const d = line.__spiderDebug;
                                if (Number.isFinite(d.aX) && Number.isFinite(d.aY) && Number.isFinite(d.bX) && Number.isFinite(d.bY)) {
                                    console.debug('[SpiderPlot] plot.addLine debug', { aX: d.aX, aY: d.aY, bX: d.bX, bY: d.bY, tag: d.tag, extra: d });
                                    return originalAddLine(line as any);
                                }
                            }
                            let aX: any = undefined, aY: any = undefined, bX: any = undefined, bY: any = undefined;

                            // Attempt several heuristics to extract endpoints from various WebglLine shapes
                            if (line && Array.isArray(line.x) && Array.isArray(line.y)) {
                                aX = line.x[0]; aY = line.y[0]; bX = line.x[1]; bY = line.y[1];
                            } else if (line && Array.isArray(line.points)) {
                                aX = line.points[0]?.x; aY = line.points[0]?.y; bX = line.points[1]?.x; bY = line.points[1]?.y;
                            } else if (typeof line.x1 === 'number' && typeof line.y1 === 'number' && typeof line.x2 === 'number' && typeof line.y2 === 'number') {
                                aX = line.x1; aY = line.y1; bX = line.x2; bY = line.y2;
                            } else {
                                // last resort: try numeric properties on the object
                                aX = (line && line.x && line.x[0]) || (line && line._x && line._x0);
                                aY = (line && line.y && line.y[0]) || (line && line._y && line._y0);
                                bX = (line && line.x && line.x[1]) || (line && line._x && line._x1);
                                bY = (line && line.y && line.y[1]) || (line && line._y && line._y1);
                            }

                            const allFinite = Number.isFinite(aX) && Number.isFinite(aY) && Number.isFinite(bX) && Number.isFinite(bY);
                            if (allFinite) {
                                console.debug('[SpiderPlot] plot.addLine call', { aX, aY, bX, bY, lineType: line?.constructor?.name });
                            } else {
                                // Reduce noise: only log keys and constructor name when coordinates are not available
                                const keys = line && typeof line === 'object' ? Object.keys(line) : typeof line;
                                console.debug('[SpiderPlot] plot.addLine call (no coords)', { keys, lineType: line?.constructor?.name });
                            }
                        } catch (e) { /* ignore logging errors */ }
                        return originalAddLine(line as any);
                    };
                }
            } catch (e) { /* ignore wrapper errors */ }
            plotRef.current = plot;

            // If fewer than 3 active bands after exclusions, skip plotting and clear existing lines.
            if (filteredPlotData.length < 3) {
                try {
                    if (plotRef.current) plotRef.current.removeAllLines();
                } catch (e) { /* ignore */ }
                setIsInitialized(false);
                return;
            }

            const targetPoints = calculateDataPoints(filteredPlotData);
            // cancel any running interpolation
            if (rafAnimRef.current) {
                try { cancelAnimationFrame(rafAnimRef.current); } catch (e) { }
                rafAnimRef.current = null;
            }
            // If simplePlot is enabled, skip animation and set points immediately
            if (effSimplePlot) {
                animatedPointsRef.current = targetPoints.map(p => ({ ...p }));
                try { setAnimatedPoints(animatedPointsRef.current); } catch (e) {}
            } else {
                const startPoints = (animatedPointsRef.current && animatedPointsRef.current.length === targetPoints.length) ? animatedPointsRef.current : targetPoints.map(p => ({ ...p }));
                const duration = 600;
                const startTime = performance.now();
                const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
                const step = (now: number) => {
                    const t = Math.min(1, (now - startTime) / duration);
                    const eased = easeOut(t);
                    const interp = targetPoints.map((tp, i) => {
                        const sp = startPoints[i] || tp;
                        return {
                            x: sp.x + (tp.x - sp.x) * eased,
                            y: sp.y + (tp.y - sp.y) * eased,
                            angle: tp.angle,
                            value: Number((sp.value + (tp.value - sp.value) * eased).toFixed(1)),
                            label: tp.label,
                            normalizedValue: (sp.normalizedValue ?? 0) + ((tp.normalizedValue ?? 0) - (sp.normalizedValue ?? 0)) * eased
                        };
                    });
                    try {
                        // Avoid redundant state updates: only set when values actually changed
                        const cur = animatedPointsRef.current;
                        let needSet = true;
                        if (cur && cur.length === interp.length) {
                            needSet = interp.some((p: any, i: number) => {
                                const c = cur[i];
                                return !c || Math.abs(p.x - c.x) > 1e-6 || Math.abs(p.y - c.y) > 1e-6 || p.value !== c.value;
                            });
                        }
                        if (needSet) setAnimatedPoints(interp);
                        animatedPointsRef.current = interp;
                    } catch (e) { }
                    if (t < 1) rafAnimRef.current = requestAnimationFrame(step);
                    else rafAnimRef.current = null;
                };
                rafAnimRef.current = requestAnimationFrame(step);
            }

            const dataPoints = (animatedPointsRef.current && animatedPointsRef.current.length === targetPoints.length) ? animatedPointsRef.current : targetPoints;
            // Debug snapshot: log ordered plotData and computed dataPoints (label, angle, coords)
            try {
                console.debug('[SpiderPlot] ordered/filtered plotData', filteredPlotData.map(p => ({ label: p.label, value: p.value })));
                console.debug('[SpiderPlot] dataPoints snapshot', dataPoints.map(p => ({ label: p.label, angle: p.angle, x: p.x, y: p.y, value: p.value })));
            } catch (e) { /* ignore logging errors */ }
            // Subtle, softer grid colors for a cleaner UI
            const webColor = hexToColorRGBA(colors.web, 0.6);
            const dataColor = hexToColorRGBA(colors.stroke, 1.0);

            // Clear any existing lines
            plot.removeAllLines();

            // 1. Draw concentric pentagon web rings
            const webColorStrong = hexToColorRGBA(colors.web, 0.55);
            const webColorLight = hexToColorRGBA(colors.web, 0.36);
            
            for (let level = 1; level <= webLevels; level++) {
                const levelRadius = WEB_RADIUS * (level / webLevels);
                const vertices = calculatePentagonVertices(levelRadius, filteredPlotData.length);
                // Use the same color for all rings
                const ringColor = webColorLight;
                // Create dotted polygon by drawing multiple small segments between each vertex
                const vertCount = vertices.length;
                for (let side = 0; side < vertCount; side++) {
                    const startVertex = vertices[side];
                    const endVertex = vertices[(side + 1) % vertCount];
                    // Create dotted polygon ring segments (thinner, lighter)
                    // For a classic spider/radar look we prefer crisp 2D canvas rings
                    // and avoid WebGL dotted decorations which can produce artifacts.
                    if (!effSimplePlot && layout !== 'spider') {
                        createDottedLine(
                            plot,
                            startVertex.x,
                            startVertex.y,
                            endVertex.x,
                            endVertex.y,
                            ringColor,
                            1,
                            26
                        );
                    }
                }

                // (grid lines will be drawn on the 2D overlay canvas to ensure
                // perfect alignment with the filled polygon and vertices)
            }

            // 2. Draw dotted radial spokes from center to pentagon vertices
            {
                // Use canonical outer vertices computed for the active (filtered) data
                const outerVertices = calculatePentagonVertices(WEB_RADIUS, filteredPlotData.length);
                const spokes = outerVertices.length;
                for (let i = 0; i < spokes; i++) {
                    const outer = outerVertices[i];
                    const outerX = outer.x;
                    const outerY = outer.y;

                    // Debug: log spoke drawing parameters (lightly)
                    try { console.debug('[SpiderPlot] spoke', { index: i, angle: outer.angle }); } catch (e) { }
                    // WebGL dotted spokes only for decorative modes; for a
                    // classic spider plot we draw spokes on the 2D canvas below.
                    if (!effSimplePlot && layout !== 'spider') createDottedLine(plot, 0, 0, outerX, outerY, webColorStrong, 1, 22);
                }

                // (grid spokes will be drawn on the 2D overlay canvas instead)
            }

            // 3. Add dotted web connecting lines between rings
            const webStrandColor = hexToColorRGBA(colors.web, 0.28);
            
            // 3. Draw dotted connecting lines between pentagon rings
            for (let level = 1; level < webLevels; level += 2) {
                const innerRadius = WEB_RADIUS * (level / webLevels);
                const outerRadius = WEB_RADIUS * ((level + 1) / webLevels);
                
                const spokes = Math.max(3, filteredPlotData.length || 5);
                for (let i = 0; i < spokes; i++) {
                    const angle = i * (2 * Math.PI / spokes) + Math.PI / 2;

                    const innerX = innerRadius * Math.cos(angle);
                    const innerY = innerRadius * Math.sin(angle);
                    const outerX = outerRadius * Math.cos(angle);
                    const outerY = outerRadius * Math.sin(angle);

                    // Create very subtle connecting strands (skip for classic spider)
                    if (!effSimplePlot && layout !== 'spider') createDottedLine(plot, innerX, innerY, outerX, outerY, webStrandColor, 1, 18);
                }
            }

            // 4. Draw filled data area (pentagon shape based on values)
            // Draw filled polygon on 2D overlay canvas for reliable fill
            // Skip fill entirely in `simplePlot` (minimal rendering)
            if (!effSimplePlot && dataPoints.length >= 3 && fillCanvasRef.current) {
                try {
                    // Ease transition for fill opacity to make updates feel smooth
                    try { /* avoid repeatedly forcing CSS transitions (can cause flicker) */ } catch (e) { }
                    const fctx = fillCanvasRef.current.getContext('2d');
                        if (fctx) {
                        const centerX = width / 2;
                        const centerY = height / 2;
                        // Avoid toggling canvas opacity/transition on every draw — leaves it to layout/styles
                        try { /* no-op: skip per-frame opacity/transition writes to prevent flicker */ } catch (e) { }
                        fctx.clearRect(0, 0, width, height);

                        // Draw grid lines (rings + radial spokes) on the 2D canvas
                        if (showGridLines) {
                            try {
                                const gridAlpha = 0.6; // fairly visible grid
                                const ringStroke = hexToRgbaString(colors.web, gridAlpha);
                                const spokeStroke = hexToRgbaString(colors.web, gridAlpha);
                                const numSides = Math.max(3, filteredPlotData.length || 5);

                                const centerMin = Math.min(centerX, centerY);
                                // For the classic spider layout prefer solid polygon rings
                                // and solid spokes (no dotted appearance)
                                if (layout === 'spider') {
                                    for (let level = 1; level <= webLevels; level++) {
                                        const levelRadius = WEB_RADIUS * (level / webLevels);
                                        const verts = calculatePentagonVertices(levelRadius, numSides);
                                        fctx.beginPath();
                                        for (let vi = 0; vi < verts.length; vi++) {
                                            const vx = centerX + verts[vi].x * centerX;
                                            const vy = centerY - verts[vi].y * centerY;
                                            if (vi === 0) fctx.moveTo(vx, vy);
                                            else fctx.lineTo(vx, vy);
                                        }
                                        // close
                                        const v0x = centerX + verts[0].x * centerX;
                                        const v0y = centerY - verts[0].y * centerY;
                                        fctx.lineTo(v0x, v0y);
                                        fctx.strokeStyle = ringStroke;
                                            // slightly stronger lines for classic spider (dotted)
                                            fctx.lineWidth = Math.max(0.6, Math.min(width, height) * 0.003);
                                            fctx.lineCap = 'round';
                                            fctx.setLineDash([4, 4]);
                                            fctx.stroke();
                                    }

                                    // Draw radial spokes (polygon)
                                    const outerVerts = calculatePentagonVertices(WEB_RADIUS, numSides);
                                    fctx.beginPath();
                                    for (let i = 0; i < outerVerts.length; i++) {
                                        const ox = centerX + outerVerts[i].x * centerX;
                                        const oy = centerY - outerVerts[i].y * centerY;
                                        fctx.moveTo(centerX, centerY);
                                        fctx.lineTo(ox, oy);
                                    }
                                    fctx.strokeStyle = spokeStroke;
                                    // match ring thinness for consistent visual weight (dotted)
                                    fctx.lineWidth = Math.max(0.6, Math.min(width, height) * 0.003);
                                    fctx.lineCap = 'round';
                                    fctx.setLineDash([1, 5]);
                                    fctx.stroke();
                                } else if (circularGrid) {
                                    for (let level = 1; level <= webLevels; level++) {
                                        const levelRadius = WEB_RADIUS * (level / webLevels);
                                        const rpx = levelRadius * centerMin;
                                        fctx.beginPath();
                                        fctx.arc(centerX, centerY, rpx, 0, Math.PI * 2);
                                        fctx.strokeStyle = ringStroke;
                                        fctx.lineWidth = Math.max(0.6, Math.min(width, height) * 0.0025);
                                        fctx.lineCap = 'round';
                                        fctx.setLineDash([1, 4]);
                                        fctx.stroke();
                                    }

                                    // radial spokes for circular grid (evenly spaced)
                                    fctx.beginPath();
                                    const spokes = numSides;
                                    const outerRpx = WEB_RADIUS * centerMin;
                                    for (let i = 0; i < spokes; i++) {
                                        const angle = i * (2 * Math.PI / spokes) + Math.PI / 2;
                                        const ox = centerX + outerRpx * Math.cos(angle);
                                        const oy = centerY - outerRpx * Math.sin(angle);
                                        fctx.moveTo(centerX, centerY);
                                        fctx.lineTo(ox, oy);
                                    }
                                    fctx.strokeStyle = spokeStroke;
                                    fctx.lineWidth = Math.max(0.6, Math.min(width, height) * 0.0025);
                                    fctx.lineCap = 'round';
                                    fctx.setLineDash([2, 4]);
                                    fctx.stroke();
                                } else {
                                    // polygon rings (existing behavior for non-spider)
                                    for (let level = 1; level <= webLevels; level++) {
                                        const levelRadius = WEB_RADIUS * (level / webLevels);
                                        const verts = calculatePentagonVertices(levelRadius, numSides);
                                        fctx.beginPath();
                                        for (let vi = 0; vi < verts.length; vi++) {
                                            const vx = centerX + verts[vi].x * centerX;
                                            const vy = centerY - verts[vi].y * centerY;
                                            if (vi === 0) fctx.moveTo(vx, vy);
                                            else fctx.lineTo(vx, vy);
                                        }
                                        // close
                                        const v0x = centerX + verts[0].x * centerX;
                                        const v0y = centerY - verts[0].y * centerY;
                                        fctx.lineTo(v0x, v0y);
                                        fctx.strokeStyle = ringStroke;
                                        // very thin lines for a delicate grid
                                        fctx.lineWidth = Math.max(0.4, Math.min(width, height) * 0.002);
                                        fctx.lineCap = 'round';
                                        // dotted appearance: short dash, short gap
                                        fctx.setLineDash([1, 2]);
                                        fctx.stroke();
                                    }

                                    // Draw radial spokes (polygon)
                                    const outerVerts = calculatePentagonVertices(WEB_RADIUS, numSides);
                                    fctx.beginPath();
                                    for (let i = 0; i < outerVerts.length; i++) {
                                        const ox = centerX + outerVerts[i].x * centerX;
                                        const oy = centerY - outerVerts[i].y * centerY;
                                        fctx.moveTo(centerX, centerY);
                                        fctx.lineTo(ox, oy);
                                    }
                                    fctx.strokeStyle = spokeStroke;
                                    // match ring thinness for consistent visual weight
                                    fctx.lineWidth = Math.max(0.4, Math.min(width, height) * 0.002);
                                    fctx.lineCap = 'round';
                                    fctx.setLineDash([1, 2]);
                                    fctx.stroke();
                                }
                            } catch (e) { /* ignore grid draw errors */ }
                        }

                        fctx.beginPath();
                            // Compute confidence-interval polygons (if ciLower/ciUpper present on filteredPlotData)
                            const numSides = Math.max(3, filteredPlotData.length || 5);
                            const lowerPoints: { x: number; y: number }[] = [];
                            const upperPoints: { x: number; y: number }[] = [];
                            for (let i = 0; i < numSides; i++) {
                                const label = filteredPlotData[i]?.label;
                                const v = filteredPlotData[i]?.value ?? 0;
                                const maxV = filteredPlotData[i]?.maxValue ?? 100;
                                const ciL = (filteredPlotData[i] as any)?.ciLower ?? v;
                                const ciU = (filteredPlotData[i] as any)?.ciUpper ?? v;
                                const angle = i * (2 * Math.PI / numSides) + Math.PI / 2;
                                const normL = Math.max(0, Math.min(1, (ciL ?? 0) / maxV));
                                const normU = Math.max(0, Math.min(1, (ciU ?? 0) / maxV));
                                lowerPoints.push({ x: WEB_RADIUS * normL * Math.cos(angle), y: WEB_RADIUS * normL * Math.sin(angle) });
                                upperPoints.push({ x: WEB_RADIUS * normU * Math.cos(angle), y: WEB_RADIUS * normU * Math.sin(angle) });
                            }

                            // Draw confidence area (between lower and upper polygons)
                            try {
                                if (lowerPoints.length === upperPoints.length && lowerPoints.length >= 3) {
                                    fctx.beginPath();
                                    // Start at first upper point
                                    for (let i = 0; i < upperPoints.length; i++) {
                                        const px = centerX + upperPoints[i].x * centerX;
                                        const py = centerY - upperPoints[i].y * centerY;
                                        if (i === 0) fctx.moveTo(px, py);
                                        else fctx.lineTo(px, py);
                                    }
                                    // Then back around the lower points in reverse
                                    for (let i = lowerPoints.length - 1; i >= 0; i--) {
                                        const px = centerX + lowerPoints[i].x * centerX;
                                        const py = centerY - lowerPoints[i].y * centerY;
                                        fctx.lineTo(px, py);
                                    }
                                    fctx.closePath();
                                    fctx.fillStyle = hexToRgbaString(colors.fill, 0.12);
                                    fctx.fill();
                                }
                            } catch (e) { /* ignore CI draw errors */ }

                            for (let i = 0; i < dataPoints.length; i++) {
                            // Note: WebGL Y axis is positive-up whereas 2D canvas Y is positive-down.
                            // Invert Y here so the filled polygon aligns with the WebGL outline.
                            const px = centerX + dataPoints[i].x * centerX;
                            const py = centerY - dataPoints[i].y * centerY;
                            if (i === 0) fctx.moveTo(px, py);
                            else fctx.lineTo(px, py);
                        }
                        // close
                        const px0 = centerX + dataPoints[0].x * centerX;
                        const py0 = centerY - dataPoints[0].y * centerY;
                        fctx.lineTo(px0, py0);
                        fctx.closePath();

                        // For classic spider layout, use a multicolor segmented fill
                        if (layout === 'spider') {
                            try {
                                const centerX = width / 2;
                                const centerY = height / 2;
                                // Draw one triangular segment per web edge, blending the two vertex colors
                                for (let i = 0; i < dataPoints.length; i++) {
                                    const pA = dataPoints[i];
                                    const pB = dataPoints[(i + 1) % dataPoints.length];
                                    const ax = centerX + pA.x * centerX;
                                    const ay = centerY - pA.y * centerY;
                                    const bx = centerX + pB.x * centerX;
                                    const by = centerY - pB.y * centerY;

                                    // Create a gradient along the edge between the two vertices
                                    const grad = fctx.createLinearGradient(ax, ay, bx, by);
                                    const ca = getBrainwaveColor(pA.label);
                                    const cb = getBrainwaveColor(pB.label);
                                    // Slight alpha so layers and grid remain visible beneath
                                    const fillAlpha = effPremium ? 0.42 : 0.34;
                                    grad.addColorStop(0, hexToRgbaString(ca, fillAlpha));
                                    grad.addColorStop(1, hexToRgbaString(cb, fillAlpha));

                                    fctx.beginPath();
                                    fctx.moveTo(centerX, centerY);
                                    fctx.lineTo(ax, ay);
                                    fctx.lineTo(bx, by);
                                    fctx.closePath();
                                    fctx.fillStyle = grad;
                                    fctx.fill();
                                }

                                // Add a subtle radial highlight to tie the segments together
                                try {
                                    const highlight = fctx.createRadialGradient(centerX, centerY, Math.max(8, Math.min(width, height) * 0.02), centerX, centerY, Math.max(width, height) * 0.6);
                                    highlight.addColorStop(0, hexToRgbaString('#ffffff', 0.12));
                                    highlight.addColorStop(0.5, 'rgba(255,255,255,0.04)');
                                    highlight.addColorStop(1, 'rgba(255,255,255,0)');
                                    fctx.globalCompositeOperation = 'lighter';
                                    fctx.fillStyle = highlight;
                                    fctx.fillRect(0, 0, width, height);
                                    fctx.globalCompositeOperation = 'source-over';
                                } catch (e) { /* ignore */ }
                            } catch (e) { /* ignore */ }
                        } else {
                            // Create a gentle radial gradient for the filled area with smoother stops
                            const grad = fctx.createRadialGradient(centerX, centerY, Math.max(12, Math.min(width, height) * 0.06), centerX, centerY, Math.max(width, height));
                            try {
                                const c1 = hexToRgbaString(colors.fill, effPremium ? 0.48 : 0.42);
                                const c2 = hexToRgbaString(colors.fill, effPremium ? 0.06 : 0.08);
                                const c3 = hexToRgbaString('#ffffff', 0.02);
                                grad.addColorStop(0, c1);
                                grad.addColorStop(0.6, c2);
                                grad.addColorStop(1, c3);
                            } catch (e) {
                                grad.addColorStop(0, hexToRgbaString(colors.fill, 0.36));
                                grad.addColorStop(1, hexToRgbaString(colors.fill, 0.06));
                            }

                            // Soft shadow glow for the area (larger, softer for premium look)
                            fctx.save();
                            fctx.shadowColor = hexToRgbaString(colors.fill, effPremium ? 0.22 : 0.28);
                            fctx.shadowBlur = Math.max(10, Math.round(Math.min(width, height) * (effPremium ? 0.055 : 0.03)));
                            fctx.fillStyle = grad;
                            fctx.fill();
                            fctx.restore();
                        }

                        // Do not perform per-frame setTimeout opacity changes (can cause flicker)
                        try { /* no-op */ } catch (e) { }
                    }
                } catch (e) { /* ignore fill errors */ }
            }

            // --- Draw data outline and vertex points on the 2D overlay canvas ---
            // Avoid adding outline segments to WebGL so the grid (rings/spokes)
            // remains untouched. The 2D canvas sits beneath the WebGL canvas.
            if (dataPoints.length >= 3 && fillCanvasRef.current) {
                try {
                    const fctx = fillCanvasRef.current.getContext('2d');
                    if (fctx) {
                        const centerX = width / 2;
                        const centerY = height / 2;
                        // Draw a soft center hub to anchor the web (thinner)
                        const hubRadius = Math.max(4, Math.round(Math.min(width, height) * 0.012));
                        const hubGrad = fctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, hubRadius * 3);
                        hubGrad.addColorStop(0, hexToRgbaString(colors.web, 0.22));
                        hubGrad.addColorStop(1, 'rgba(255,255,255,0)');
                        fctx.beginPath();
                        fctx.fillStyle = hubGrad;
                        fctx.arc(centerX, centerY, hubRadius * 3, 0, Math.PI * 2);
                        fctx.fill();

                        // Draw each edge with the color of the source vertex
                        for (let k = 0; k < dataPoints.length; k++) {
                            const p0 = dataPoints[k];
                            const p1 = dataPoints[(k + 1) % dataPoints.length];

                            // Defensive checks similar to previous logic
                            if (!isFinite(p0.x) || !isFinite(p0.y) || !isFinite(p1.x) || !isFinite(p1.y)) continue;

                            const x0 = centerX + p0.x * centerX;
                            const y0 = centerY - p0.y * centerY;
                            const x1 = centerX + p1.x * centerX;
                            const y1 = centerY - p1.y * centerY;

                            fctx.beginPath();
                            // Always draw a minimal solid outline when simplePlot is requested
                            if (effSimplePlot) {
                                fctx.setLineDash([]);
                                fctx.moveTo(x0, y0);
                                fctx.lineTo(x1, y1);
                                fctx.strokeStyle = hexToRgbaString(colors.stroke, 0.85);
                                fctx.lineWidth = Math.max(1, Math.round(Math.min(width, height) * 0.006));
                                fctx.lineCap = 'round';
                                fctx.stroke();
                            } else {
                                if (layout === 'spider' && effLayeredOutline) {
                                    // Use multi-layered colored outlines to achieve a modern look
                                    const basePixelWidth = Math.max(1, Math.round(Math.min(width, height) * 0.009));
                                    const color = getBrainwaveColor(p0.label) || colors.stroke;
                                    const maxInsetPx = Math.min(width, height) * 0.12; // increase inset for better separation of many layers
                                    // draw inset layered edges inside the main outline
                                    drawLayeredEdge(fctx, x0, y0, x1, y1, width / 2, height / 2, color, basePixelWidth, Math.max(1, outlineLayers), maxInsetPx);
                                    // Add curved accents inset slightly to sit visually inside the layered outline
                                    if (effCurvedAccents) {
                                        const insetForAccent = maxInsetPx * 0.6;
                                        // move endpoints toward center for accent baseline
                                        const moveToCenter = (px: number, py: number, inset: number) => {
                                            const dx = width / 2 - px;
                                            const dy = height / 2 - py;
                                            const d = Math.hypot(dx, dy) || 1;
                                            const f = Math.min(0.9, inset / d);
                                            return { x: px + dx * f, y: py + dy * f };
                                        };
                                        const a0 = moveToCenter(x0, y0, insetForAccent);
                                        const a1 = moveToCenter(x1, y1, insetForAccent);
                                        drawCurvedAccents(fctx, a0.x, a0.y, a1.x, a1.y, color, Math.max(1, accentCount), accentCurviness);
                                    }
                                } else if (layout === 'spider') {
                                    // Classic simple spider outline fallback
                                    fctx.setLineDash([]);
                                    fctx.moveTo(x0, y0);
                                    fctx.lineTo(x1, y1);
                                    fctx.strokeStyle = hexToRgbaString(colors.stroke, 0.9);
                                    fctx.lineWidth = Math.max(1, Math.round(Math.min(width, height) * 0.012));
                                    fctx.lineCap = 'round';
                                    fctx.stroke();
                                    // optional curved accents for the simple fallback too
                                    if (effCurvedAccents) {
                                        const accentColor = getBrainwaveColor(p0.label) || colors.stroke;
                                        drawCurvedAccents(fctx, x0, y0, x1, y1, accentColor, Math.max(1, accentCount), accentCurviness);
                                    }
                                } else {
                                    fctx.setLineDash([8, 6]);
                                    fctx.moveTo(x0, y0);
                                    fctx.lineTo(x1, y1);
                                    // subtle gradient stroke between the two vertex colors
                                    try {
                                        const g = fctx.createLinearGradient(x0, y0, x1, y1);
                                        g.addColorStop(0, hexToRgbaString(getBrainwaveColor(p0.label), 1.0));
                                        g.addColorStop(1, hexToRgbaString(getBrainwaveColor(p1.label), 0.85));
                                        fctx.strokeStyle = g;
                                    } catch (e) {
                                        fctx.strokeStyle = hexToRgbaString(getBrainwaveColor(p0.label), 1.0);
                                    }
                                    fctx.lineWidth = Math.max(1, Math.round(Math.min(width, height) * 0.01));
                                    fctx.lineCap = 'round';
                                    // soft glow behind stroke
                                    fctx.save();
                                    fctx.shadowColor = hexToRgbaString(getBrainwaveColor(p0.label), 0.22);
                                    fctx.shadowBlur = Math.max(4, Math.round(Math.min(width, height) * 0.012));
                                    fctx.stroke();
                                    fctx.restore();
                                }
                            }
                        }

                        // Draw vertex markers
                        for (let i = 0; i < dataPoints.length; i++) {
                            const p = dataPoints[i];
                            if (!isFinite(p.x) || !isFinite(p.y)) continue;
                            const px = centerX + p.x * centerX;
                            const py = centerY - p.y * centerY;
                            const radius = Math.max(2, Math.round(Math.min(width, height) * (effSimplePlot ? 0.006 : 0.008)));

                            if (effSimplePlot) {
                                // Minimal point: very small filled circle, thinner
                                fctx.beginPath();
                                fctx.fillStyle = hexToRgbaString(colors.points || getBrainwaveColor(p.label), 1.0);
                                fctx.arc(px, py, Math.max(1, Math.round(radius * 0.6)), 0, Math.PI * 2);
                                fctx.fill();
                            } else {
                                // outer halo gradient
                                const halo = fctx.createRadialGradient(px, py, 0, px, py, radius * 3);
                                halo.addColorStop(0, hexToRgbaString(getBrainwaveColor(p.label), 0.28));
                                halo.addColorStop(1, 'rgba(255,255,255,0)');
                                fctx.beginPath();
                                fctx.fillStyle = halo;
                                fctx.arc(px, py, radius * 3, 0, Math.PI * 2);
                                fctx.fill();

                                // core point
                                fctx.beginPath();
                                fctx.fillStyle = hexToRgbaString(getBrainwaveColor(p.label), 1.0);
                                fctx.arc(px, py, radius, 0, Math.PI * 2);
                                fctx.fill();
                                fctx.lineWidth = 1;
                                fctx.strokeStyle = 'rgba(255,255,255,0.85)';
                                fctx.stroke();
                            }
                        }

                        // Hover highlight: emphasize the hovered vertex and spoke
                        try {
                            if (hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < dataPoints.length) {
                                const hp = dataPoints[hoveredIndex];
                                if (isFinite(hp.x) && isFinite(hp.y)) {
                                    const hx = centerX + hp.x * centerX;
                                    const hy = centerY - hp.y * centerY;
                                    // draw highlighted spoke from center to point
                                    fctx.beginPath();
                                    fctx.moveTo(centerX, centerY);
                                    fctx.lineTo(hx, hy);
                                    fctx.strokeStyle = hexToRgbaString(getBrainwaveColor(hp.label), 0.95);
                                    fctx.lineWidth = Math.max(1, Math.round(Math.min(width, height) * 0.008));
                                    fctx.lineCap = 'round';
                                    fctx.globalCompositeOperation = 'source-over';
                                    fctx.stroke();

                                    // draw a soft halo around the hovered point (smaller)
                                    const haloR = Math.max(6, Math.round(Math.min(width, height) * 0.035));
                                    const halo = fctx.createRadialGradient(hx, hy, 0, hx, hy, haloR);
                                    halo.addColorStop(0, hexToRgbaString(getBrainwaveColor(hp.label), 0.22));
                                    halo.addColorStop(1, 'rgba(255,255,255,0)');
                                    fctx.beginPath();
                                    fctx.fillStyle = halo;
                                    fctx.arc(hx, hy, haloR, 0, Math.PI * 2);
                                    fctx.fill();

                                    // draw a bright dot on top (smaller)
                                    fctx.beginPath();
                                    fctx.fillStyle = hexToRgbaString(getBrainwaveColor(hp.label), 1.0);
                                    fctx.arc(hx, hy, Math.max(2, Math.round(Math.min(width, height) * 0.008)), 0, Math.PI * 2);
                                    fctx.fill();

                                    // subtle value ring at the hovered radius (smaller)
                                    try {
                                        const centerMin = Math.min(centerX, centerY);
                                        const ringR = Math.max(4, Math.round(centerMin * (WEB_RADIUS * (hp.normalizedValue ?? 0))));
                                        fctx.beginPath();
                                        fctx.arc(centerX, centerY, ringR, 0, Math.PI * 2);
                                        fctx.strokeStyle = hexToRgbaString(getBrainwaveColor(hp.label), 0.12);
                                        fctx.lineWidth = 1.5;
                                        fctx.setLineDash([4, 4]);
                                        fctx.stroke();
                                        fctx.setLineDash([]);
                                    } catch (e) { /* ignore ring draw errors */ }
                                }
                            }
                        } catch (e) { /* ignore hover draw errors */ }
                    }
                } catch (e) { /* ignore drawing errors */ }
            }

            setIsInitialized(true);

            // Animation loop
            const render = () => {
                if (plotRef.current) {
                    plotRef.current.clear();
                    plotRef.current.update();
                    plotRef.current.draw();
                }
                animationRef.current = requestAnimationFrame(render);
            };

            render();

        } catch (error) {
            console.error('WebGL Spider Plot initialization failed:', error);
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            if (rafAnimRef.current) {
                try { cancelAnimationFrame(rafAnimRef.current); } catch (e) { }
                rafAnimRef.current = null;
            }
            if (plotRef.current) {
                plotRef.current.removeAllLines();
            }
        };
    }, [width, height, dataKey, colorsMemo, webLevels, layout, simplePlot, perfModeEnabled, circularGrid, showGridLines]);

    // Calculate label positions for HTML overlay
    const getLabelPositions = () => {
        if (!isInitialized) return [];
        
        const centerX = width / 2;
        const centerY = height / 2;
        
        return filteredPlotData.map((item, index) => {
            // Pentagon vertex angles (canonical placement)
            const sides = Math.max(3, filteredPlotData.length || 5);
            const baseAngle = index * (2 * Math.PI / sides) + Math.PI / 2;
            const angle = baseAngle; // keep canonical angle for classic spider layout
            
            // Convert from WebGL coordinates (-1 to 1) to screen coordinates
            const totalWebGLRadius = WEB_RADIUS + LABEL_OFFSET;
            
            // Convert WebGL coordinates to screen coordinates
            const webGLX = totalWebGLRadius * Math.cos(angle);
            const webGLY = totalWebGLRadius * Math.sin(angle);

            // Transform from WebGL space (-1 to 1) to screen space
            // Note: plotted data earlier in the canvas inverts Y (centerY - y*centerY),
            // so use the same convention here to keep labels aligned with plotted points.
            const screenX = centerX + (webGLX * centerX);
            const screenY = centerY - (webGLY * centerY);
            
            return {
                x: screenX,
                y: screenY,
                value: Number((item.value ?? 0).toFixed(1)),
                label: item.label
            };
        });
    };

    const labelPositions = getLabelPositions();

    const showPlaceholder = filteredPlotData.length < 3;

    return (
        <div 
            className={`relative ${className}`} 
            style={{
                width,
                height,
                borderRadius: effPremium ? '14px' : '10px',
                overflow: 'hidden',
                padding: effPremium ? 8 : undefined,
                boxShadow: effPremium ? '0 18px 48px rgba(2,6,23,0.08)' : undefined,
                border: effPremium ? '1px solid rgba(255,255,255,0.45)' : undefined,
                backdropFilter: effPremium ? 'saturate(140%) blur(8px)' : undefined,
                WebkitBackdropFilter: effPremium ? 'saturate(140%) blur(8px)' : undefined,
                // Layer dotted background (optional) under the gradient. Use
                // explicit backgroundImage/backgroundSize/backgroundRepeat so
                // it matches the dashboard flow area pattern exactly.
                // When `simplePlot` is requested, keep background plain and
                // avoid glass/dotted decorations for a minimal look.
                backgroundImage: (() => {
                    try {
                        if (effSimplePlot) {
                            return `${backgroundColor}`;
                        }
                        const dotColor = effDottedBackground ? hexToRgbaString(colors.web, 0.4) : null; // subtle but visible
                        const baseGradient = `linear-gradient(180deg, ${backgroundColor} 0%, rgba(255, 255, 255, 0.6) 100%)`;
                        if (dotColor) {
                            // radial-gradient creates a single-dot tile; backgroundSize controls spacing
                            return `radial-gradient(${dotColor} 1px, transparent 1px), ${baseGradient}`;
                        }
                        return baseGradient;
                    } catch (e) {
                        return `${backgroundColor}`;
                    }
                })(),
                backgroundSize: (!effSimplePlot && effDottedBackground) ? '10px 10px, auto' : undefined,
                backgroundRepeat: (!effSimplePlot && effDottedBackground) ? 'repeat, no-repeat' : undefined,
                backgroundPosition: (!effSimplePlot && effDottedBackground) ? '0 0, 0 0' : undefined
            }}
        >
            {/* 2D fill canvas sits underneath the WebGL canvas and paints the filled polygon */}
            <canvas
                ref={fillCanvasRef}
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 0,
                    // subtle premium filter for glass effect
                    filter: effPremium ? 'drop-shadow(0 8px 20px rgba(2,6,23,0.06))' : undefined,
                    transition: effPremium ? 'filter 320ms ease, opacity 420ms cubic-bezier(0.2,0.8,0.2,1)' : undefined
                }}
            />

            <canvas
                ref={canvasRef}
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'transparent',
                    zIndex: 1,
                    transition: effPremium ? 'transform 260ms cubic-bezier(0.2,0.8,0.2,1)' : undefined
                }}
                // enable pointer events on canvas for future hover interactions
                onMouseLeave={() => { setHoveredIndex(null); setTooltip({ visible: false, x: 0, y: 0 }); }}
                onMouseMove={(e) => {
                    try {
                        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
                        const mx = e.clientX - rect.left;
                        const my = e.clientY - rect.top;
                        const centerX = width / 2;
                        const centerY = height / 2;
                        // find nearest data point (in screen coordinates) — prefer animated points
                        const dataPts = (animatedPointsRef.current && animatedPointsRef.current.length) ? animatedPointsRef.current : calculateDataPoints(filteredPlotData);
                        let nearestIndex: number | null = null;
                        let nearestDist = Infinity;
                        for (let i = 0; i < dataPts.length; i++) {
                            const p = dataPts[i];
                            const px = centerX + p.x * centerX;
                            const py = centerY - p.y * centerY;
                            const d = Math.hypot(px - mx, py - my);
                            if (d < nearestDist) { nearestDist = d; nearestIndex = i; }
                        }
                        const HOVER_PX = Math.max(10, Math.min(24, Math.round(Math.min(width, height) * 0.04)));
                        if (nearestIndex !== null && nearestDist <= HOVER_PX) {
                            const p = dataPts[nearestIndex];
                            setHoveredIndex(nearestIndex);
                            // store coordinates relative to the widget container
                            setTooltip({ visible: true, x: mx, y: my, label: p.label, value: p.value });
                        } else {
                            setHoveredIndex(null);
                            setTooltip({ visible: false, x: 0, y: 0 });
                        }
                    } catch (err) { /* ignore */ }
                }}
            />
            {/* Tooltip */}
            {showTooltip && tooltip.visible && (
                <div style={{ position: 'absolute', left: tooltip.x + 12, top: tooltip.y + 12, zIndex: 80, pointerEvents: 'none' }}>
                    <div style={ effSimplePlot ? { background: 'rgba(0,0,0,0.8)', color: 'white', padding: '6px 8px', borderRadius: 6, fontSize: 12, boxShadow: '0 6px 20px rgba(0,0,0,0.25)' } : { background: effPremium ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.8)', color: effPremium ? '#0f172a' : 'white', padding: '8px 10px', borderRadius: 10, fontSize: 13, boxShadow: '0 10px 28px rgba(2,6,23,0.12)', border: effPremium ? '1px solid rgba(255,255,255,0.5)' : undefined, backdropFilter: effPremium ? 'saturate(140%) blur(8px)' : undefined }}>
                        <div style={{ fontWeight: 800 }}>{tooltip.label}</div>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>{displayMode === 'dB' ? `${tooltip.value} dB` : `${tooltip.value}%`}</div>
                    </div>
                </div>
            )}
            {/* Minimal placeholder when too few bands are visible */}
            {showPlaceholder && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 22, background: '#f3f4f6', boxShadow: effPremium ? 'inset 0 0 8px rgba(255,255,255,0.4), 0 6px 18px rgba(2,6,23,0.06)' : 'inset 0 0 6px rgba(0,0,0,0.06)' }} />
                        <div style={{ color: '#6b7280', fontSize: 13, fontWeight: 700 }}>Insufficient bands</div>
                    </div>
                </div>
            )}
            
            {/* HTML Labels Overlay */}
            {showLabels && isInitialized && (
                <div className="absolute inset-0 pointer-events-none">
                    {labelPositions.map((pos, index) => (
                        <div
                            key={`label-${index}`}
                            className="absolute transform -translate-x-1/2 -translate-y-1/2"
                            style={{ 
                                left: pos.x, 
                                top: pos.y,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 6,
                                pointerEvents: 'none'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
                                <span style={{ width: 8, height: 8, borderRadius: 6, background: getBrainwaveColor(pos.label), display: 'inline-block', boxShadow: '0 6px 12px rgba(2,6,23,0.04)' }} />
                                <span style={{ fontSize: Math.max(11, Math.min(13, width / 22)), fontWeight: 700, color: '#0f172a', textShadow: '0 6px 18px rgba(2,6,23,0.04)' }}>{pos.label}</span>
                            </div>
                            {showValues && (
                                <div style={{ fontSize: Math.max(10, Math.min(12, width / 26)), color: colors.points, fontWeight: 700 }}>
                                    {pos.value}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Dominant band badge */}
            {!effSimplePlot && dominant && (
                <div style={{ position: 'absolute', left: 12, top: 12, padding: '8px 10px', borderRadius: 12, display: 'flex', alignItems: 'center', boxShadow: effPremium ? '0 10px 28px rgba(2,6,23,0.10)' : '0 6px 18px rgba(2,6,23,0.06)', background: effPremium ? 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.8))' : 'rgba(255,255,255,0.9)', border: effPremium ? '1px solid rgba(255,255,255,0.6)' : undefined, backdropFilter: effPremium ? 'saturate(130%) blur(6px)' : undefined }}>
                    <div style={{ width: 12, height: 12, borderRadius: 4, background: getBrainwaveColor(dominant.label), marginRight: 10, boxShadow: '0 6px 18px rgba(2,6,23,0.06)' }} />
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{dominant.label}</div>
                    <div style={{ marginLeft: 10, fontSize: 13, color: '#475569', fontWeight: 700 }}>{dominant.value}</div>
                </div>
            )}

            {/* Small runtime controls (always visible for convenience) */}
            {/* <div style={{ position: 'absolute', left: 12, bottom: 12, pointerEvents: 'auto', zIndex: 80 }}>
                <div style={{ display: 'flex', gap: 8, padding: '8px', borderRadius: 10, background: premium ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.9)', boxShadow: premium ? '0 8px 22px rgba(2,6,23,0.08)' : undefined }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, color: '#374151', fontWeight: 700 }}>Display</label>
                        <select value={displayMode} onChange={(e) => setDisplayMode(e.target.value as any)} style={{ fontSize: 12 }}>
                            <option value='relative'>Relative (%)</option>
                            <option value='absolute'>Absolute</option>
                            <option value='dB'>dB</option>
                            <option value='raw'>Raw</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, color: '#374151', fontWeight: 700 }}>Processing</label>
                        <select value={processingMode} onChange={(e) => setProcessingMode(e.target.value as any)} style={{ fontSize: 12 }}>
                            <option value='welch'>Welch (smooth)</option>
                            <option value='simple'>Simple (fast)</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, color: '#374151', fontWeight: 700 }}>Stream</label>
                        <select value={streamingMode} onChange={(e) => setStreamingMode(e.target.value as any)} style={{ fontSize: 12 }}>
                            <option value='buffer'>Buffer</option>
                            <option value='single'>Single</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, color: '#374151', fontWeight: 700 }}>s/FFT</label>
                        <input type='number' value={samplesPerFFT} min={1} max={256} step={1} onChange={(e) => setSamplesPerFFT(Math.max(1, Math.min(256, Number(e.target.value) || 10)))} style={{ width: 72 }} />
                    </div>
                </div>
            </div> */}

            {/* Controls: FFT / smoother / rate / display mode */}
            {/* {!simplePlot && (
                <div style={{ position: 'absolute', left: 12, bottom: 12, pointerEvents: 'auto', zIndex: 70 }}>
                    <div style={{ display: 'flex', gap: 8, padding: '8px', borderRadius: 10, background: premium ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.9)', boxShadow: premium ? '0 8px 22px rgba(2,6,23,0.08)' : undefined }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#374151', fontWeight: 700 }}>Display</label>
                            <select value={displayMode} onChange={(e) => setDisplayMode(e.target.value as any)} style={{ fontSize: 12 }}>
                                <option value='relative'>Relative (%)</option>
                                <option value='absolute'>Absolute</option>
                                <option value='dB'>dB</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#374151', fontWeight: 700 }}>Processing</label>
                            <select value={processingMode} onChange={(e) => setProcessingMode(e.target.value as any)} style={{ fontSize: 12 }}>
                                <option value='welch'>Welch (smooth)</option>
                                <option value='simple'>Simple (fast)</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#374151', fontWeight: 700 }}>FFT</label>
                            <input type='number' value={fftSize} min={32} max={4096} step={32} onChange={(e) => setFftSize(Math.max(32, Math.min(4096, Number(e.target.value) || 256)))} style={{ width: 80 }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#374151', fontWeight: 700 }}>Smoother</label>
                            <input type='number' value={smootherWindow} min={1} max={1024} step={1} onChange={(e) => setSmootherWindow(Math.max(1, Math.min(1024, Number(e.target.value) || 128)))} style={{ width: 72 }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#374151', fontWeight: 700 }}>Rate ms</label>
                            <input type='number' value={postRateMs} min={100} max={5000} step={50} onChange={(e) => setPostRateMs(Math.max(100, Math.min(5000, Number(e.target.value) || 200)))} style={{ width: 72 }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 11, color: '#374151', fontWeight: 700 }}>EMA τ ms</label>
                            <input type='number' value={emaTauMs} min={100} max={10000} step={100} onChange={(e) => setEmaTauMs(Math.max(100, Math.min(10000, Number(e.target.value) || 1000)))} style={{ width: 86 }} />
                        </div>
                    </div>
                </div>
            )} */}

            {/* Legend (swatches + values) - hidden in simplePlot for minimal UI */}
            {!effSimplePlot && showLegend && (
                <div style={{ position: 'absolute', right: 12, top: 12, pointerEvents: 'auto', zIndex: 60 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: effPremium ? '8px' : '6px', borderRadius: 12, background: effPremium ? 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.82))' : 'rgba(255,255,255,0.9)', boxShadow: effPremium ? '0 12px 32px rgba(2,6,23,0.08)' : '0 6px 18px rgba(2,6,23,0.06)', border: effPremium ? '1px solid rgba(255,255,255,0.6)' : undefined }}>
                        {filteredPlotData.map((d, i) => (
                            <div key={`legend-${i}`} onMouseEnter={() => setHoveredIndex(i)} onMouseLeave={() => setHoveredIndex(null)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'default', minWidth: 110 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 4, background: getBrainwaveColor(d.label), boxShadow: '0 6px 12px rgba(2,6,23,0.04)' }} />
                                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 68 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: hoveredIndex === i ? '#0f172a' : '#374151' }}>{d.label}</div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{Number(((d.value ?? 0)).toFixed(1))}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Animation indicator */}
            {animated && (
                <div className="absolute top-2 right-2 w-2 h-2 bg-green-400 rounded-full animate-pulse opacity-70" />
            )}
        </div>
    );
};

// Example component for testing
export const SpiderPlotExample: React.FC = () => {
    return (
        <div className="p-8 bg-slate-100 rounded-lg">
            <h3 className="text-gray-800 font-semibold mb-4">Animated WebGL Spider Plot</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Static version */}
                <div>
                    <h4 className="text-sm text-gray-600 mb-2">Static Version</h4>
                    <SpiderPlot 
                        width={300}
                        height={300}
                        showLabels={true}
                        showValues={true}
                        backgroundColor="rgba(255, 255, 255, 0.8)"
                        animated={false}
                        data={[
                            { label: 'Speed', value: 85, maxValue: 100 },
                            { label: 'Power', value: 92, maxValue: 100 },
                            { label: 'Accuracy', value: 78, maxValue: 100 },
                            { label: 'Defense', value: 65, maxValue: 100 },
                            { label: 'Agility', value: 88, maxValue: 100 },
                            { label: 'Intelligence', value: 73, maxValue: 100 },
                        ]}
                    />
                </div>

                {/* Animated version */}
                <div>
                    <h4 className="text-sm text-gray-600 mb-2">Animated Version (Random Values)</h4>
                    <SpiderPlot 
                        width={300}
                        height={300}
                        showLabels={true}
                        showValues={true}
                        backgroundColor="rgba(59, 130, 246, 0.05)"
                        animated={true}
                        colors={{
                            web: '#E5E7EB',
                            fill: '#3B82F6',
                            stroke: '#1D4ED8',
                            points: '#1E40AF',
                            labels: '#374151'
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default SpiderPlot;