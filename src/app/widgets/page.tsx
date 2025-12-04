'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo, useLayoutEffect } from 'react';
import DraggableWidget from '@/components/DraggableWidget';
import Toast from '@/components/ui/Toast';
import ConfirmModal from '@/components/ui/ConfirmModal';
import OnboardingTour from '@/components/ui/OnboardingTour';
import useTourStorage from '@/hooks/useTour';
import FlowModule from '@/components/FlowModule';
import { Widget, GridSettings, DragState, ToastState, ConfirmState } from '@/types/widget.types';
import { checkCollisionAtPosition } from '@/utils/widget.utils';
import Envelope from '@/components/Envelope';
import { useChannelData } from '@/lib/channelDataContext';

/**
 * Main Widgets component - Orchestrates the entire widget dashboard
 * Manages widget state, grid settings, drag operations, and user interactions
 */
const Widgets: React.FC = () => {
    // Flow debug logging (set true when troubleshooting flow wiring)
    const FLOW_LOG = false;

    // Modern flat color map for flowchart widgets (distinct flat colors, no gradients)
    const THEME_COLORS: Record<string, { bg: string, text: string, border: string, shadow: string }> = {
        default: { bg: '#ffffff', text: '#0f172a', border: '#d1d5db', shadow: '0 6px 18px rgba(2,6,23,0.04)' },
        channel: { bg: '#fffbeb', text: '#92400e', border: '#fcd34d', shadow: '0 8px 20px rgba(245,158,11,0.06)' },
        basic: { bg: '#eef2ff', text: '#3730a3', border: '#c7d2fe', shadow: '0 8px 20px rgba(99,102,241,0.06)' },
        spiderplot: { bg: '#ecfdf5', text: '#065f46', border: '#bbf7d0', shadow: '0 8px 20px rgba(16,185,129,0.06)' },
        fft: { bg: '#f0f9ff', text: '#075985', border: '#bde8ff', shadow: '0 8px 20px rgba(3,105,161,0.06)' },
        bandpower: { bg: '#fff1f2', text: '#9f1239', border: '#fecaca', shadow: '0 8px 20px rgba(239,68,68,0.06)' },
        filter: { bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff', shadow: '0 8px 20px rgba(124,58,237,0.06)' },
        envelope: { bg: '#fff7ed', text: '#92400e', border: '#fed7aa', shadow: '0 8px 20px rgba(245,158,11,0.06)' },
        candle: { bg: '#fffbeb', text: '#92400e', border: '#fcd34d', shadow: '0 8px 20px rgba(245,158,11,0.06)' },
        game: { bg: '#f0fdf4', text: '#065f46', border: '#bbf7d0', shadow: '0 8px 20px rgba(16,185,129,0.06)' },
    };

    
    // Small helper to get theme for a given widget type/id
    const themeFor = (type?: string) => THEME_COLORS[type || 'default'] || THEME_COLORS.default;

    // Map an arbitrary flow id (channel-1, spider-..., basic-1, etc.) to a theme text color
    const colorForId = (id?: string) => {
        if (!id) return THEME_COLORS.default.text;
        try {
            if (String(id).startsWith('channel')) return themeFor('channel').text;
            if (String(id).startsWith('spider')) return themeFor('spiderplot').text;
            if (String(id).startsWith('fft')) return themeFor('fft').text;
            if (String(id).startsWith('bandpower')) return themeFor('bandpower').text;
            if (String(id).startsWith('filter')) return themeFor('filter').text;
            if (String(id).startsWith('envelope')) return themeFor('envelope').text;
            if (String(id).startsWith('candle')) return themeFor('candle').text;
            if (String(id).startsWith('basic')) return themeFor('basic').text;
            // fallback: try to find in flowOptions
            const fo = flowOptions.find(o => String(o.id) === String(id));
            if (fo && (fo as any).type) return themeFor((fo as any).type).text;
        } catch (err) { }
        return THEME_COLORS.default.text;
    };

    // Map an item id (which can be a type or an instance id) to a canonical theme
    const themeForId = (id?: string) => {
        if (!id) return themeFor('default');
        try {
            const s = String(id).toLowerCase();
            if (s.startsWith('channel')) return themeFor('channel');
            if (s.startsWith('spider')) return themeFor('spiderplot');
            if (s.startsWith('fft')) return themeFor('fft');
            if (s.startsWith('bandpower')) return themeFor('bandpower');
            if (s.startsWith('filter')) return themeFor('filter');
            if (s.startsWith('envelope')) return themeFor('envelope');
            if (s.startsWith('candle')) return themeFor('candle');
            if (s.startsWith('basic')) return themeFor('basic');
            const fo = flowOptions.find(o => String(o.id) === String(id));
            if (fo && (fo as any).type) return themeFor((fo as any).type);
        } catch (err) { }
        return themeFor('default');
    };

    // Lighter color variant for arrows (prefer border color which is lighter than text)
    const colorForIdLight = (id?: string) => {
        // Darken the border color slightly to make arrows "a little darker"
        const darkenHex = (hex: string, amt = 0.18) => {
            try {
                let h = String(hex || '').replace('#', '');
                if (h.length === 3) h = h.split('').map(c => c + c).join('');
                const num = parseInt(h, 16);
                let r = (num >> 16) & 0xff;
                let g = (num >> 8) & 0xff;
                let b = num & 0xff;
                r = Math.max(0, Math.min(255, Math.floor(r * (1 - amt))));
                g = Math.max(0, Math.min(255, Math.floor(g * (1 - amt))));
                b = Math.max(0, Math.min(255, Math.floor(b * (1 - amt))));
                const out = (r << 16) + (g << 8) + b;
                return `#${out.toString(16).padStart(6, '0')}`;
            } catch (err) {
                return hex;
            }
        };

        if (!id) return darkenHex(THEME_COLORS.default.border);
        try {
            if (String(id).startsWith('channel')) return darkenHex(themeFor('channel').border);
            if (String(id).startsWith('spider')) return darkenHex(themeFor('spiderplot').border);
            if (String(id).startsWith('fft')) return darkenHex(themeFor('fft').border);
            if (String(id).startsWith('bandpower')) return darkenHex(themeFor('bandpower').border);
            if (String(id).startsWith('filter')) return darkenHex(themeFor('filter').border);
            if (String(id).startsWith('envelope')) return darkenHex(themeFor('envelope').border);
            if (String(id).startsWith('candle')) return darkenHex(themeFor('candle').border);
            if (String(id).startsWith('basic')) return darkenHex(themeFor('basic').border);
            const fo = flowOptions.find(o => String(o.id) === String(id));
            if (fo && (fo as any).type) return darkenHex(themeFor((fo as any).type).border);
        } catch (err) { }
        return darkenHex(THEME_COLORS.default.border);
    };

    // Premium action palette for flowchart control buttons
    // Refreshed 'smart' action palette — flat modern tones, neutral ghost, and subtle shadows
    const ACTION_COLORS: Record<string, { bg: string, text: string, shadow: string }> = {
        // primary: calm teal for main actions
        primary: { bg: '#0ea5a4', text: '#ffffff', shadow: '0 8px 24px rgba(14,165,164,0.12)' },
        // success: pleasant indigo used for confirmatory actions
        success: { bg: '#7c3aed', text: '#ffffff', shadow: '0 8px 24px rgba(124,58,237,0.12)' },
        // green: prominent teal-cyan for play/run actions
        green: { bg: '#4cc668ff', text: '#083344', shadow: '0 8px 24px rgba(6,182,212,0.10)' },
        // accent: warm amber for highlights/secondary actions
        accent: { bg: '#f59e0b', text: '#08131a', shadow: '0 8px 24px rgba(245,158,11,0.10)' },
        // neutral: dark slate for destructive/neutral controls
        neutral: { bg: '#0f172a', text: '#ffffff', shadow: '0 8px 24px rgba(15,23,42,0.06)' },
        // ghost: very light subtle background used for quiet buttons
        ghost: { bg: '#f8fafc', text: '#0f172a', shadow: 'none' },
    };

    // Manual connection drawing state
    const [drawingConnection, setDrawingConnection] = useState<{ from: string, startX: number, startY: number } | null>(null);

    // Local state for the in-flow connection mini-widget (connect/disconnect)
    const [connActive, setConnActive] = useState<boolean>(false);
    const [connConnecting, setConnConnecting] = useState<boolean>(false);
    const channelData = useChannelData();
    // "More" dropdown state is now handled inside FlowModule header
    // Tour storage (persistent flag) and local flag to control tour visibility
    const tourStorage = useTourStorage();
    const [showTour, setShowTour] = useState<boolean>(false);

    // Flowchart presets: allow saving/loading multiple named flow configurations
    type FlowPreset = { id: string; name: string; flowOptions: any[]; modalPositions: Record<string, { left: number, top: number }>; connections: Array<{ from: string, to: string }>; gridSettings: GridSettings; channelCount?: number };
    const createPresetId = (name: string) => String(name || 'preset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Math.random().toString(36).slice(2, 7);

    const [flowPresets, setFlowPresets] = useState<FlowPreset[]>([]);
    const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

    useEffect(() => {
        try {
            // Always open the tour on mount so it appears after every refresh/reload.
            setTimeout(() => setShowTour(true), 400);
        } catch (e) { }
    }, []);

    const handleSelectPreset = (id: string) => {
        try {
            const p = flowPresets.find(fp => fp.id === id);
            if (!p) return;
            // Apply preset to current flow state
            try { setFlowOptions(JSON.parse(JSON.stringify(p.flowOptions))); } catch (e) { }
            try { setModalPositions(JSON.parse(JSON.stringify(p.modalPositions))); } catch (e) { }
            try { setConnections(JSON.parse(JSON.stringify(p.connections || []))); } catch (e) { }
            try { setGridSettings(JSON.parse(JSON.stringify(p.gridSettings || gridSettings))); } catch (e) { }
            try { setChannelCount(typeof p.channelCount === 'number' ? p.channelCount : channelCount); } catch (e) { }
            setSelectedPresetId(id);
            try { showToast && showToast(`Loaded preset: ${p.name}`, 'success'); } catch (e) { }
        } catch (err) { }
    };

    const handleSavePreset = () => {
        try {
            const name = window.prompt('Preset name');
            if (!name) return;
            const id = createPresetId(name);
            const preset = {
                id,
                name,
                flowOptions: JSON.parse(JSON.stringify(flowOptions)),
                modalPositions: JSON.parse(JSON.stringify(modalPositions)),
                connections: JSON.parse(JSON.stringify(connections)),
                gridSettings: JSON.parse(JSON.stringify(gridSettings)),
                channelCount,
            };
            setFlowPresets(prev => [...prev, preset]);
            setSelectedPresetId(id);
            try { showToast && showToast('Preset saved', 'success'); } catch (e) { }
        } catch (err) { }
    };


    const onTourClose = () => {
        try { tourStorage.markSeen(); } catch (e) { }
        setShowTour(false);
    };

    // Onboarding tour steps (selectors must match elements inside the flow modal)
    const tourSteps: Array<{ selector: string; title: string; description: string; position?: 'auto' | 'right' | 'top' | 'bottom' | 'left'; action?: 'drag-demo' | 'connect-demo' | 'flow-demo' }> = [
        { selector: '#flow-palette', title: 'Applications Palette', description: 'Drag applications from here into the flow area to build your pipeline.', position: 'right' },
        // { selector: '#flow-palette input', title: 'Search Applications', description: 'Filter the palette to find the app you need quickly.', position: 'right' },
        { selector: '#flow-palette div[draggable]', title: 'Add an App', description: 'Drag any app from the palette into the flow area to add it to your pipeline.', position: 'right', action: 'drag-demo' },
        { selector: '#flow-area', title: 'Flow Area', description: 'Arrange nodes here. Connect outputs to inputs to route data through transforms and visualizations.', position: 'left', action: 'flow-demo' },
        // { selector: 'button[data-tour="connect-button"]', title: 'Connection Selector', description: 'Open the connection selector to choose a hardware source or device to connect.', position: 'right' },
        { selector: 'button[data-tour="connect-button"]', title: 'Connect / Disconnect', description: 'Start drawing connections between nodes or disconnect active links.', position: 'right', action: 'connect-demo' },
        // { selector: '[aria-label="Zoom controls"]', title: 'Zoom', description: 'Zoom the flow modal to see more or fewer nodes.', position: 'left' },
        // { selector: 'button[title="Zoom in"]', title: 'Zoom In', description: 'Increase the zoom level to inspect details.', position: 'left' },
        // { selector: 'button[title="Zoom out"]', title: 'Zoom Out', description: 'Decrease the zoom level to see more of the flow.', position: 'left' },
        // { selector: '[data-tour="download-layout"]', title: 'Save Layout', description: 'Export your current flowchart layout as a JSON file for sharing or backup.', position: 'left' },
        // { selector: '[data-tour="load-layout"]', title: 'Load Layout', description: 'Import a previously exported layout JSON file to restore your flow.', position: 'left' },
        { selector: 'button[title="Increase channels"]', title: 'Add Channel', description: 'Add another input channel to the flow (useful for multi-channel devices).', position: 'right' },
        { selector: 'button[title="Decrease channels"]', title: 'Remove Channel', description: 'Remove the highest-numbered channel from the flow.', position: 'right' },
        // { selector: '[data-tour="settings-replay"]', title: 'Replay Tour', description: 'Replay this onboarding anytime from the Flow settings.', position: 'left' },
        { selector: '[data-tour="play-button"]', title: 'Play', description: 'Click Play to arrange widgets onto the dashboard and start streaming data.', position: 'bottom' },
    ];

    // Forwarding subscriptions for runtime push-flow (map 'from->to' -> unsubscribe)
    const forwardingUnsubsRef = useRef<Record<string, () => void>>({});
    // Keep a ref copy of connections so setup/teardown callbacks declared
    // earlier can access the latest connections without dependency ordering issues.
    const connectionsRef = useRef<Array<{ from: string, to: string }>>([]);
    // Keep a ref copy of current dashboard widgets so early-declared
    // callbacks (like setupPushForwarding) can resolve instance ids
    // without depending on the `widgets` state (avoids TDZ issues).
    const widgetsRef = useRef<Widget[]>([]);

    // Setup forwarding subscriptions that implement runtime.push semantics:
    // when a source widget publishes outputs, forward them to each connected
    // target widget by calling publishWidgetOutputs(targetId, values).
    const setupPushForwarding = useCallback(() => {
        try {
            // Clear any existing forwarders first
            try {
                const entries = Object.values(forwardingUnsubsRef.current || {});
                for (const u of entries) try { u(); } catch (e) { }
            } catch (e) { }
            forwardingUnsubsRef.current = {};
            if (!channelData) return;
            const { subscribeToWidgetOutputs, publishWidgetOutputs } = channelData as any;
            if (typeof subscribeToWidgetOutputs !== 'function' || typeof publishWidgetOutputs !== 'function') return;

            // For every connection where the source is a widget (not a channel),
            // subscribe to its outputs and forward into the target's widget output buffer.
            const conns = connectionsRef.current || [];
            // Build a map of channel sources -> targets so we can create a
            // single subscription per channel that forwards samples to all
            // connected downstream widgets (fan-out behavior).
            const channelMap: Record<string, string[]> = {};
            for (const c of conns) {
                try {
                    const from = String(c.from || '');
                    const to = String(c.to || '');
                    if (!from || !to) continue;
                    if (from.startsWith('channel-')) {
                        // accumulate channel -> [targets]
                        channelMap[from] = channelMap[from] || [];
                        if (!channelMap[from].includes(to)) channelMap[from].push(to);
                        continue;
                    }
                    // Resolve publisher instance ids. Flow connections may refer
                    // to the base node id (e.g. 'bandpower') while the actual
                    // dashboard widget instance id is 'bandpower-<inst>'. Find
                    // matching widgets and subscribe to their outputs so the
                    // flow wires work regardless of whether the connection was
                    // created against a base node id or an instance id.
                    const publisherIds: string[] = [];
                    try {
                        // If any widget exactly matches the from id, prefer it
                        const exact = widgetsRef.current.find(w => String(w.id) === from);
                        if (exact) publisherIds.push(String(exact.id));
                        else {
                            const base = String(from).split('-')[0];
                            const matches = widgetsRef.current.filter(w => String(w.id).split('-')[0] === base).map(w => String(w.id));
                            if (matches.length > 0) publisherIds.push(...matches);
                        }
                    } catch (e) {
                        // ignore resolution errors and fall back to raw id
                    }

                    if (publisherIds.length === 0) publisherIds.push(from);

                    for (const pubId of publisherIds) {
                        if (FLOW_LOG) try { console.debug('[Flow] forward subscribe', { from: pubId, to }); } catch (e) { }
                        const key = `${pubId}=>${to}`;
                        if (forwardingUnsubsRef.current[key]) continue;
                        const unsub = subscribeToWidgetOutputs(pubId, (vals: Array<number | number[]>) => {
                            try {
                                if (FLOW_LOG) try { console.debug('[Flow] forward payload', { from: pubId, to, vals }); } catch (e) { }
                                publishWidgetOutputs(to, Array.isArray(vals) && vals.length === 1 ? vals[0] as any : vals.slice());
                            } catch (err) { /* swallow per-forward errors */ }
                        });
                        if (unsub) forwardingUnsubsRef.current[key] = unsub;
                    }
                } catch (err) { /* ignore per-connection errors */ }
            }

            // Create one sample-batch subscription per channel source and forward
            // the channel's latest processed value to all its targets. This
            // enables a single channel to feed multiple downstream widgets.
            try {
                const { subscribeToSampleBatches } = channelData as any;
                for (const ch of Object.keys(channelMap)) {
                    try {
                        const targets = channelMap[ch] || [];
                        if (!targets || targets.length === 0) continue;
                        const chKey = `${ch}=>${targets.join(',')}`;
                        if (forwardingUnsubsRef.current[chKey]) continue;
                        // Parse channel index
                        const m = String(ch).match(/channel-(\d+)/i);
                        const chIdx = m ? Math.max(0, parseInt(m[1], 10)) : 0;
                        const unsub = subscribeToSampleBatches((batch: Array<any>) => {
                            try {
                                if (!batch || batch.length === 0) return;
                                const last = batch[batch.length - 1] as any;
                                const key = `ch${chIdx}`;
                                let v: any = undefined;
                                if (last && last[key] !== undefined) v = last[key];
                                else if (last && (last as any)._raw && (last as any)._raw[key] !== undefined) v = Number((last as any)._raw[key]);
                                else v = 0;
                                for (const t of targets) {
                                    try { publishWidgetOutputs(t, v); } catch (e) { }
                                }
                            } catch (err) { /* swallow per-batch errors */ }
                        });
                        if (unsub) forwardingUnsubsRef.current[chKey] = unsub;
                    } catch (err) { /* ignore per-channel errors */ }
                }
            } catch (err) { /* ignore sample subscription errors */ }
        } catch (err) {
            try { console.warn('[Flow] setupPushForwarding failed', err); } catch (e) { }
        }
    }, [channelData]);

    const teardownPushForwarding = useCallback(() => {
        try {
            const entries = Object.values(forwardingUnsubsRef.current || {});
            for (const u of entries) try { u(); } catch (e) { }
        } catch (err) { }
        forwardingUnsubsRef.current = {};
    }, []);
    const lastSampleAtRef = useRef<number>(0);
    // Subscribe to provider sample batches to infer whether a device is actively streaming.
    useEffect(() => {
        let unsub: (() => void) | undefined;
        try {
            if (channelData && channelData.subscribeToSampleBatches) {
                unsub = channelData.subscribeToSampleBatches((batch) => {
                    try {
                                if (batch && batch.length > 0) {
                                    lastSampleAtRef.current = Date.now();
                                    try { if (!connActive) setConnActive(true); } catch (e) { }
                                    try { setConnConnecting(false); } catch (e) { }
                                }
                    } catch (e) { }
                });
            }
        } catch (err) {
            // ignore
        }
        const interval = setInterval(() => {
            try {
                if (lastSampleAtRef.current === 0) return;
                if (Date.now() - lastSampleAtRef.current > 2500 && connActive) {
                    setConnActive(false);
                }
            } catch (e) { }
        }, 800);
        return () => {
            try { if (unsub) unsub(); } catch (e) { }
            try { clearInterval(interval); } catch (e) { }
        };
    }, [channelData, connActive]);
    const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);
    // Mousemove listener for live arrow drawing
    useEffect(() => {
        if (!drawingConnection) return;
        const handleMove = (e: MouseEvent) => {
            const svg = document.getElementById('flowchart-arrow-svg');
            if (svg) {
                const rect = svg.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                setMousePos({ x, y });
            } else {
                setMousePos({ x: e.clientX, y: e.clientY });
            }
        };
        // Stop drawing if user releases mouse anywhere. Defer clearing to allow input's onMouseUp to finalize the connection.
        const handleMouseUp = (e: MouseEvent) => {
            // Defer clearing to next tick so React's onMouseUp handlers can run first
            setTimeout(() => {
                // If an input handler already finalized the connection, skip clearing
                if (inputHandledRef.current) {
                    inputHandledRef.current = false;
                    return;
                }
                // If mouseup happened on an input element, don't clear immediately — allow the input handler to run
                try {
                    const target = e?.target as HTMLElement | null;
                    if (target && typeof target.closest === 'function' && target.closest('[data-handle="input"]')) {
                        // leave for input handler
                        return;
                    }
                } catch (err) {
                    // ignore
                }
                setDrawingConnection(null);
                setMousePos(null);
            }, 0);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [drawingConnection]);

    // Settings modal state for flowchart widgets
    const [settingsModal, setSettingsModal] = useState<{ show: boolean, widgetId: string | null }>({ show: false, widgetId: null });
    // Draft of settings for the currently-open modal
    const [settingsDraft, setSettingsDraft] = useState<Record<string, any> | null>(null);

    // Channel data context (used to wire sampling rate into the Filter modal)
    const { setRegisteredChannels, setChannelFilters, samplingRate } = useChannelData();

    // Open settings for a given flow option id and seed the draft from flowOptions
    const openSettings = (widgetId: string) => {
        const opt = flowOptions.find(o => o.id === widgetId);
        // Pre-fill samplingRate for filter nodes from provider if missing
        const base = opt && (opt as any).config ? { ...(opt as any).config } : {};
        if (opt && opt.type === 'filter') {
            if (!base.samplingRate && samplingRate) base.samplingRate = samplingRate;
        }
        setSettingsDraft(base);
        setSettingsModal({ show: true, widgetId });
    };

    // Save current settingsDraft into flowOptions for the open widget
    const saveSettings = () => {
        if (!settingsModal.show || !settingsModal.widgetId) {
            setSettingsModal({ show: false, widgetId: null });
            setSettingsDraft(null);
            return;
        }
        setFlowOptions(prev => prev.map(o => o.id === settingsModal.widgetId ? { ...o, config: settingsDraft } : o));
        setSettingsModal({ show: false, widgetId: null });
        setSettingsDraft(null);
    };

    // Settings modal content (render per-node-type)
    const samplingRateHelp = 'Sampling rate used to interpret FFT data; choose the rate that matches your device input (e.g. 250, 500, 1000 Hz).';
    const renderSettingsModal = () => {
        if (!settingsModal.show || !settingsModal.widgetId) return null;
        const opt = flowOptions.find(o => o.id === settingsModal.widgetId);
        if (!opt) return null;
        const type = opt.type || 'unknown';
        const isSpiderPlot = type === 'spiderplot';
        const isChannel = type === 'channel';
        const isFFT = type === 'fft' || String(opt.id).startsWith('fft-');
        const isFilter = type === 'filter';




        return (
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                background: 'rgba(0,0,0,0.35)',
                zIndex: 100001,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <div style={{
                    background: 'white',
                    borderRadius: 16,
                    boxShadow: '0 12px 48px rgba(0,0,0,0.32)',
                    border: '2px solid #2563eb',
                    padding: 40,
                    minWidth: 340,
                    maxWidth: 520,
                    position: 'relative',
                }}>
                    <button
                        style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', fontSize: 22, color: '#2563eb', cursor: 'pointer' }}
                        onClick={() => { setSettingsModal({ show: false, widgetId: null }); setSettingsDraft(null); }}
                    >
                        &times;
                    </button>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <h3 style={{ fontWeight: 'bold', fontSize: 18, margin: 0 }}>Settings for {opt.label}</h3>
                                            <div>
                                                <button data-tour="settings-replay" onClick={() => { try { tourStorage.clearSeen(); setShowTour(true); } catch (e) { } }} style={{ padding: '6px 8px', borderRadius: 8, background: '#eef2ff', border: '1px solid #c7d2fe', cursor: 'pointer', fontWeight: 700, marginLeft: 8 }}>Replay Tour</button>
                                            </div>
                                        </div>
                                        <div style={{ height: 12 }} />

                                        {/* Informative description and live config summary to help users understand what this node will do */}
                    {(() => {
                        const existing = (opt as any).config || {};
                        const draft = settingsDraft || {};
                        const dirty = JSON.stringify(existing) !== JSON.stringify(draft);
                        const kind = draft.kind || existing.kind || opt.type || 'item';

                        let description = '';
                        if (isSpiderPlot) {
                            description = 'SpiderPlot aggregates multiple channel inputs into a radial plot.';
                        } else if (isChannel) {
                            description = 'Channel settings allow renaming the channel and similar metadata. Channel data itself comes from the device input stream.';
                        } else {
                            description = 'Configure this node. Changes are saved to the flow and will apply when you arrange/play the dashboard.';
                        }

                        return (
                            <div style={{ marginBottom: 14, color: '#374151' }}>
                                <div style={{ marginBottom: 8 }}>{description}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ fontSize: 12, color: '#6b7280' }}>Current config:</div>
                                    <div style={{ background: '#f3f4f6', padding: '6px 10px', borderRadius: 6, fontSize: 13, color: '#111827' }}>
                                        {kind && <span style={{ marginRight: 10 }}><strong>kind:</strong> {String(kind)}</span>}
                                        {((draft.samplingRate || existing.samplingRate) && <span style={{ marginRight: 10 }}><strong>sr:</strong> {draft.samplingRate || existing.samplingRate}</span>)}

                                    </div>
                                    {dirty ? <span style={{ marginLeft: 8, color: '#b91c1c', fontWeight: 600 }}>Unsaved changes</span> : <span style={{ marginLeft: 8, color: '#059669', fontWeight: 600 }}>Saved</span>}
                                </div>
                            </div>
                        );
                    })()}


                    {isFilter && (
                        <div>
                            {/* Filter selection: separate dropdowns for Notch, High-pass and Low-pass.
                                Only one filterKey is stored; selecting an option sets filterKey and clears other categories. */}
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                                <div>
                                    <label style={{ fontWeight: 500 }}>Notch:</label>
                                    <select value={(settingsDraft && settingsDraft.notchKey) ? settingsDraft.notchKey : 'none'} onChange={e => {
                                        const v = e.target.value;
                                        if (v === 'none') {
                                            setSettingsDraft(prev => ({ ...(prev || {}), notchKey: undefined, notchFreq: undefined }));
                                        } else {
                                            const nf = parseInt(v.split('-')[1] || '50', 10) || 50;
                                            setSettingsDraft(prev => ({ ...(prev || {}), notchKey: `notch-${nf}`, notchFreq: nf }));
                                        }
                                    }} style={{ marginLeft: 8 }}>
                                        <option value="none">None</option>
                                        <option value="notch-50">50 Hz</option>
                                        <option value="notch-60">60 Hz</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ fontWeight: 500 }}>High-pass:</label>
                                    <select value={(settingsDraft && settingsDraft.hpKey) ? settingsDraft.hpKey : 'none'} onChange={e => {
                                        const v = e.target.value;
                                        if (v === 'none') {
                                            setSettingsDraft(prev => ({ ...(prev || {}), hpKey: undefined }));
                                        } else {
                                            setSettingsDraft(prev => ({ ...(prev || {}), hpKey: v }));
                                        }
                                    }} style={{ marginLeft: 8 }}>
                                        <option value="none">None</option>
                                        <option value="hp-0.01">0.01 Hz</option>
                                        <option value="hp-0.02">0.02 Hz</option>
                                        <option value="hp-0.05">0.05 Hz</option>
                                        <option value="hp-0.1">0.1 Hz</option>
                                        <option value="hp-0.2">0.2 Hz</option>
                                        <option value="hp-0.5">0.5 Hz</option>
                                        <option value="hp-1.0">1.0 Hz</option>
                                        <option value="hp-2.0">2.0 Hz</option>
                                        <option value="hp-5.0">5.0 Hz</option>
                                        <option value="hp-10.0">10.0 Hz</option>
                                        <option value="hp-20.0">70.0 Hz</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ fontWeight: 500 }}>Low-pass:</label>
                                    <select value={(settingsDraft && settingsDraft.lpKey) ? settingsDraft.lpKey : 'none'} onChange={e => {
                                        const v = e.target.value;
                                        if (v === 'none') {
                                            setSettingsDraft(prev => ({ ...(prev || {}), lpKey: undefined }));
                                        } else {
                                            setSettingsDraft(prev => ({ ...(prev || {}), lpKey: v }));
                                        }
                                    }} style={{ marginLeft: 8 }}>
                                        <option value="none">None</option>
                                        <option value="lp-10.0">10 Hz</option>
                                        <option value="lp-20.0">20 Hz</option>
                                        <option value="lp-30.0">30 Hz</option>
                                        <option value="lp-50.0">50 Hz</option>
                                        <option value="lp-70.0">70 Hz</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontWeight: 500 }}>Sampling Rate (Hz):</label>
                                <select value={(settingsDraft && settingsDraft.samplingRate) || 250} onChange={e => setSettingsDraft(prev => ({ ...(prev || {}), samplingRate: parseInt(e.target.value, 10) }))} style={{ marginLeft: 8 }}>
                                    <option value={250}>250</option>
                                    <option value={500}>500</option>
                                    <option value={1000}>1000</option>
                                </select>
                                <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>Sampling rate used to configure filter coefficients.</div>
                            </div>

                            <div style={{ marginBottom: 8 }}>
                                <label style={{ fontWeight: 500 }}>
                                    <input type="checkbox" checked={(settingsDraft && settingsDraft.enabled) !== false} onChange={e => setSettingsDraft(prev => ({ ...(prev || {}), enabled: e.target.checked }))} style={{ marginRight: 8 }} />
                                    Enabled
                                </label>
                            </div>
                        </div>
                    )}

                    {isChannel && (
                        <div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontWeight: 500 }}>Channel Label:</label>
                                <input value={(settingsDraft && settingsDraft.label) || opt.label} onChange={e => setSettingsDraft(prev => ({ ...(prev || {}), label: e.target.value }))} style={{ marginLeft: 8, border: '1px solid #ccc', borderRadius: 6, padding: '4px 8px' }} />
                            </div>
                        </div>
                    )}

                    <button style={{ marginTop: 18, background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 'bold', cursor: 'pointer' }} onClick={saveSettings}>Save</button>
                </div>
            </div>
        );
    };
    // Modal widget positions state (for flowchart modal)
    // modalPositions is stored as normalized coordinates (0..1) relative to the
    // flow area (unscaled). We convert to/from pixel coordinates when reading
    // or writing so the rest of the code can operate on pixels.
    const initialModalPositionsPx: Record<string, { left: number, top: number }> = {};
    initialModalPositionsPx['channels-box'] = { left: 60, top: 100 };
    initialModalPositionsPx['spiderplot'] = { left: 320, top: 100 };
    initialModalPositionsPx['fft'] = { left: 540, top: 100 };
    initialModalPositionsPx['bandpower'] = { left: 760, top: 100 };
    // Place the aggregated Plots box horizontally aligned with Channels by default
    initialModalPositionsPx['plots-box'] = { left: 420, top: 100 };

    // Internal storage uses normalized coordinates: { left: number, top: number } where
    // values are 0..1 fractions of the container width/height. Initialize lazily to
    // fallback normalized values using assumed container size (1200x500) — these
    // will be converted at runtime to exact pixel positions when rendered.
    const normalizeFallback = (px: { left: number, top: number }) => ({ left: px.left / 1200, top: px.top / 500 });
    const initialModalPositions: Record<string, { left: number, top: number }> = {};
    Object.keys(initialModalPositionsPx).forEach(k => { initialModalPositions[k] = normalizeFallback(initialModalPositionsPx[k]); });
    const [modalPositions, setModalPositions] = useState<Record<string, { left: number, top: number }>>(initialModalPositions);

    // Helper: get the flow container (the inner scaled div) bounding rect.
    // Prefer the actual scaled inner wrapper if present, otherwise fall back
    // to the outer `#flow-area` element and finally to defaults for SSR.
    const getFlowContainerRect = () => {
        try {
            const area = document.getElementById('flow-area') as HTMLElement | null;
            if (area) {
                // Use the flow-area container's bounding rect (not the scaled inner wrapper).
                // The scaled inner wrapper may report a small height while absolute-positioned
                // children define the visible area; using the container ensures we measure
                // the full available modal space where widgets can be placed.
                return area.getBoundingClientRect();
            }
        } catch (e) { }
        return { width: 1200, height: 500, top: 0, left: 0, right: 1200, bottom: 500 } as DOMRect;
    };

    // Helper: get the full modal (viewport) rect so we can allow moving
    // widgets across the entire modal surface (not just the inner flow area).
    const getModalRect = () => {
        try {
            // Prefer the FlowModule container when embedded
            const moduleEl = document.getElementById('flow-module') as HTMLElement | null;
            if (moduleEl) return moduleEl.getBoundingClientRect();
        } catch (e) { }
        // Fallback to viewport
        return { top: 0, left: 0, width: (typeof window !== 'undefined' ? window.innerWidth : 1200), height: (typeof window !== 'undefined' ? window.innerHeight : 900), right: (typeof window !== 'undefined' ? window.innerWidth : 1200), bottom: (typeof window !== 'undefined' ? window.innerHeight : 900) } as DOMRect;
    };

    const pixelToNormalized = (leftPx: number, topPx: number) => {
        const r = getFlowContainerRect();
        const w = r.width || 1200;
        const h = r.height || 500;
        return { left: Math.max(0, Math.min(1, leftPx / w)), top: Math.max(0, Math.min(1, topPx / h)) };
    };

    const normalizedToPixel = (pos: { left: number, top: number }) => {
        const r = getFlowContainerRect();
        const w = r.width || 1200;
        const h = r.height || 500;
        return { left: Math.round((pos.left || 0) * w), top: Math.round((pos.top || 0) * h) };
    };

    // Helper: clamp a desired left/top so the element stays within the flow container
    // and never overlaps the presets header area. Returns clamped { left, top }.
    const clampToFlowBounds = (desiredLeft: number, desiredTop: number, elWidth: number, elHeight: number) => {
        try {
            const crect = getFlowContainerRect();
            const headerEl = typeof document !== 'undefined' ? document.getElementById('flow-presets-header') as HTMLElement | null : null;
            const headerH = headerEl ? Math.round(headerEl.getBoundingClientRect().height || 36) : 36;
            const minTop = headerH + 4; // leave a small gap under the header
            const maxLeft = Math.max(0, Math.floor((crect.width || 1200) - elWidth));
            const maxTop = Math.max(minTop, Math.floor((crect.height || 500) - elHeight));
            const clampedLeft = Math.max(0, Math.min(desiredLeft, maxLeft));
            const clampedTop = Math.max(minTop, Math.min(desiredTop, maxTop));
            return { left: clampedLeft, top: clampedTop };
        } catch (err) {
            return { left: Math.max(0, desiredLeft), top: Math.max(36, desiredTop) };
        }
    };

    // Action to arrange/expand the flow into dashboard widgets (Play)
    const playFlow = () => {
        try { markFlowSeen(); } catch (err) { setShowFlowModal(false); }

        // Debug: print current flowchart connections when the user clicks Play
        try {
            if (connections && connections.length > 0) {
                console.group('[Flow] playFlow - connections');
                        if (FLOW_LOG) try { console.table(connections); } catch (e) { if (FLOW_LOG) console.log('connections:', connections); }
                // // also log a raw copy to avoid accidental mutation issues when inspecting
                
                // console.groupEnd();
            } else {
                if (FLOW_LOG) console.debug('[Flow] playFlow - no connections to print');
            }
        } catch (err) {
            console.warn('[Flow] playFlow - failed to print connections', err);
        }
        // Arrange selected widgets to fill dashboard space using grid, offset by header
        setWidgets(prev => {
            const typeMap: Record<string, string> = {
                channel: 'basic',
                fft: 'FFTGraph',
                spiderplot: 'spiderplot',
                candle: 'candle',
                bandpower: 'statistic',
            };
            const explicitSelected = flowOptions.filter(opt => opt.selected);
            const anyPlotsExist = flowOptions.some(opt => opt.type === 'basic');
            let selectedWidgets: typeof flowOptions = [];
            if (explicitSelected.some(o => o.type === 'basic')) {
                selectedWidgets = explicitSelected;
            } else if (anyPlotsExist) {
                selectedWidgets = flowOptions.filter(opt => opt.type === 'basic');
            } else {
                selectedWidgets = flowOptions.filter(opt => opt.selected || (typeof opt.id === 'string' && opt.id.startsWith('channel-')));
            }
            const cols = gridSettings.cols || 24;
            const rows = gridSettings.rows || 16;
            let totalInstances = 0;
            for (const opt of selectedWidgets) {
                const insts = (opt as any).instances || Array.from({ length: (opt.count || 1) }, (_, i) => ({ id: `${opt.id}-${i + 1}` }));
                totalInstances += insts.length;
            }
            const count = Math.max(1, totalInstances);
            // Compute gridCols/gridRows to tile widgets to fill the dashboard
            // Use availableCols/availableRows aspect ratio to choose a near-square tiling
            const offsetCells = 3;
            const availableCols = Math.max(1, cols - offsetCells);
            const availableRows = Math.max(1, rows - offsetCells);
            const aspect = availableCols / availableRows;
            // Choose number of columns based on count and aspect ratio (near-square tiling)
            let gridCols = Math.max(1, Math.round(Math.sqrt(count * aspect)));
            if (gridCols > count) gridCols = count;
            const gridRows = Math.max(1, Math.ceil(count / gridCols));

            const baseColWidth = Math.max(1, Math.floor(availableCols / gridCols));
            const baseRowHeight = Math.max(1, Math.floor(availableRows / gridRows));
            // Distribute any leftover columns/rows so tiles fully cover the grid
            const colWidths: number[] = Array.from({ length: gridCols }, () => baseColWidth);
            let leftoverCols = availableCols - baseColWidth * gridCols;
            for (let i = 0; i < gridCols && leftoverCols > 0; i++, leftoverCols--) colWidths[i]++;
            const rowHeights: number[] = Array.from({ length: gridRows }, () => baseRowHeight);
            let leftoverRows = availableRows - baseRowHeight * gridRows;
            for (let i = 0; i < gridRows && leftoverRows > 0; i++, leftoverRows--) rowHeights[i]++;

            // Precompute cumulative offsets for columns and rows
            const colOffsets: number[] = [offsetCells];
            for (let i = 0; i < gridCols; i++) colOffsets.push(colOffsets[colOffsets.length - 1] + colWidths[i]);
            const rowOffsets: number[] = [offsetCells];
            for (let i = 0; i < gridRows; i++) rowOffsets.push(rowOffsets[rowOffsets.length - 1] + rowHeights[i]);

            let newWidgets: Widget[] = [];
            // Exclude non-visual flow nodes (filters, transforms like 'envelope')
            // from being materialized as dashboard widgets. Envelope should only
            // operate on channel data in the flow and not create a dashboard widget.
            const widgetTypes = selectedWidgets.filter(opt => !(typeof opt.id === 'string' && opt.id.startsWith('channel-')) && opt.type !== 'filter' && opt.type !== 'envelope');
            const allInstanceIds = new Set<string>();
            for (const opt of widgetTypes) {
                if (opt.type === 'basic') {
                    const insts = (opt as any).instances || Array.from({ length: (opt.count || 1) }, (_, i) => ({ id: `${opt.id}-${i}` }));
                    for (const ins of insts) allInstanceIds.add(ins.id);
                }
            }
            const channelsRouted = new Set<number>();
            for (const c of connections) {
                try {
                    if (typeof c.from === 'string' && typeof c.to === 'string' && c.from.startsWith('channel-') && allInstanceIds.has(c.to)) {
                        const m = c.from.match(/channel-(\d+)/i);
                        const idxVal = m ? parseInt(m[1], 10) : null;
                        if (idxVal !== null && !isNaN(idxVal)) channelsRouted.add(idxVal);
                    }
                } catch (err) { /* ignore */ }
            }

            // If there are any 'basic' (Plot) flow options, create a single aggregated
            // dashboard widget that will display multiple channel inputs in one plot.
            const hasBasic = widgetTypes.some(o => o.type === 'basic');

            let placeIndex = 0;
            widgetTypes.forEach((opt, optIdx) => {
                if (typeof opt.id === 'string' && opt.id.startsWith('channel-')) {
                    const m = opt.id.match(/channel-(\d+)/i);
                    const idxVal = m ? parseInt(m[1], 10) : null;
                    if (idxVal !== null && !isNaN(idxVal) && channelsRouted.has(idxVal)) return;
                }
                // If this is a basic plot and we're aggregating, skip creating per-instance widgets
                if (opt.type === 'basic' && hasBasic) {
                    // We'll add a single aggregated basic widget after the loop
                    return;
                }

                const instancesArr: Array<{ id: string, label?: string }> = (opt as any).instances || Array.from({ length: (opt.count || 1) }, (_, i) => ({ id: `${opt.id}-${i}`, label: `${opt.label} ${i}` }));
                for (let inst = 0; inst < instancesArr.length; inst++) {
                    const rowIdx = placeIndex % gridRows;
                    const colIdx = Math.floor(placeIndex / gridRows);
                    const x = colOffsets[colIdx];
                    const y = rowOffsets[rowIdx];
                    const safeX = Math.min(x, cols - colWidths[colIdx]);
                    const safeY = Math.min(y, rows - rowHeights[rowIdx]);
                    const instanceId = instancesArr[inst].id;
                    const widgetObj: Widget = {
                        id: instanceId,
                        x: safeX,
                        y: safeY,
                        width: colWidths[colIdx],
                        height: rowHeights[rowIdx],
                        minWidth: opt.type === 'basic' ? 6 : 3,
                        minHeight: opt.type === 'basic' ? 5 : 3,
                        type: typeMap[opt.type] || opt.type,
                    };
                    if (typeof opt.id === 'string' && opt.id.startsWith('channel-')) {
                        const m = opt.id.match(/channel-(\d+)/i);
                        const idxVal = m ? Math.max(0, parseInt(m[1], 10)) : 0;
                        (widgetObj as any).channelIndex = idxVal;
                    }
                    if (opt.type === 'basic') {
                        (widgetObj as any).channelIndex = inst;
                    }

                    newWidgets.push(widgetObj);
                    placeIndex++;
                }
            });

            // If we detected basic plot types, add a single aggregated basic widget.
            if (hasBasic) {
                // Place it at the next available slot
                const rowIdx = placeIndex % gridRows;
                const colIdx = Math.floor(placeIndex / gridRows);
                const x = colOffsets[colIdx];
                const y = rowOffsets[rowIdx];
                const safeX = Math.min(x, cols - colWidths[colIdx]);
                const safeY = Math.min(y, rows - rowHeights[rowIdx]);
                const aggWidget: Widget = {
                    id: 'plots-aggregated',
                    x: safeX,
                    y: safeY,
                    width: colWidths[colIdx],
                    height: rowHeights[rowIdx],
                    minWidth: 6,
                    minHeight: 5,
                    type: 'basic',
                };
                newWidgets.push(aggWidget);
            }

            return newWidgets;
        });
        // After arranging widgets, wire up runtime push-forwarding so published
        // widget outputs are forwarded along connections.
        try {
            setupPushForwarding();
        } catch (err) { /* ignore */ }
    };

    // Ensure forwarding subscriptions are torn down when the component unmounts
    useEffect(() => {
        return () => {
            try { teardownPushForwarding(); } catch (e) { }
        };
    }, [teardownPushForwarding]);

    // Debug: log modalPositions and flowScale when they change to help diagnose
    // issues where stored positions don't match the visual scaled surface.
    // (Effect moved below where `flowScale` is declared.)
    // Helper to find exact center of input/output circle relative to the flowchart SVG
    const getCircleCenter = (widgetId: string, handle: 'input' | 'output') => {
        try {
            const svg = document.getElementById('flowchart-arrow-svg');
            // Select the specific handle (input/output) for accurate positioning
            const selector = `[data-widgetid="${widgetId}"][data-handle="${handle}"]`;
            const el = document.querySelector(selector) as HTMLElement | null;
            if (!el || !svg) return null;

            // Prefer the actual <circle> element if present (more precise than wrapper SVG/div)
            let targetRect: DOMRect | null = null;
            try {
                // If the selected element is an SVG or contains a circle child, use that circle's bounding box
                const circle = (el as Element).querySelector && (el as Element).querySelector('circle');
                if (circle) {
                    targetRect = (circle as SVGCircleElement).getBoundingClientRect();
                } else {
                    targetRect = el.getBoundingClientRect();
                }
            } catch (err) {
                targetRect = el.getBoundingClientRect();
            }

            if (!targetRect) return null;
            const svgRect = svg.getBoundingClientRect();
            return { x: targetRect.left + targetRect.width / 2 - svgRect.left, y: targetRect.top + targetRect.height / 2 - svgRect.top };
        } catch (err) {
            return null;
        }
    };

    // Helper: distance from point to segment
    const pointToSegmentDistance = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
        const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
        const tt = Math.max(0, Math.min(1, t));
        const projx = x1 + tt * dx;
        const projy = y1 + tt * dy;
        return Math.hypot(px - projx, py - projy);
    };

    // Compute endpoints (in SVG coordinates) for a connection {from,to}
    const computeConnectionEndpoints = (from: string, to: string) => {
        try {
            const svg = document.getElementById('flowchart-arrow-svg');
            const svgRect = svg ? svg.getBoundingClientRect() : { left: 0, top: 0 } as DOMRect;
            const fromCenter = getCircleCenter(from, 'output');
            const toCenter = getCircleCenter(to, 'input');
            let startX: number, startY: number, endX: number, endY: number;
            const fromPos = modalPositions[from] ? normalizedToPixel(modalPositions[from]) : undefined;
            const toPos = modalPositions[to] ? normalizedToPixel(modalPositions[to]) : undefined;
            if (!fromCenter && !fromPos) return null;
            if (!toCenter && !toPos) return null;
            if (fromCenter) {
                startX = fromCenter.x;
                startY = fromCenter.y;
            } else {
                const fromWidgetType = (from.startsWith('channel') ? 0 : from.startsWith('spider') ? 1 : from.startsWith('fft') ? 2 : 3);
                const fromWidth = fromWidgetType === 3 ? 220 : 180;
                startX = (fromPos as { left: number, top: number }).left + fromWidth - (svgRect.left);
                startY = (fromPos as { left: number, top: number }).top + 35 - (svgRect.top);
            }
            if (toCenter) {
                endX = toCenter.x;
                endY = toCenter.y;
            } else {
                endX = (toPos as { left: number, top: number }).left + 7 - (svgRect.left);
                endY = (toPos as { left: number, top: number }).top + 35 - (svgRect.top);
            }
            return { startX, startY, endX, endY };
        } catch (err) {
            return null;
        }
    };

    // Geometry helpers for routing arrows around widget bounding boxes
    const lineIntersect = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) => {
        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if (denom === 0) return false; // parallel
        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
        return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
    };

    const segmentIntersectsRect = (x1: number, y1: number, x2: number, y2: number, rect: { left: number, top: number, right: number, bottom: number }) => {
        // If either endpoint is inside rect, consider it intersecting
        if (x1 >= rect.left && x1 <= rect.right && y1 >= rect.top && y1 <= rect.bottom) return true;
        if (x2 >= rect.left && x2 <= rect.right && y2 >= rect.top && y2 <= rect.bottom) return true;
        // Check intersection with each rect edge
        if (lineIntersect(x1, y1, x2, y2, rect.left, rect.top, rect.right, rect.top)) return true;
        if (lineIntersect(x1, y1, x2, y2, rect.right, rect.top, rect.right, rect.bottom)) return true;
        if (lineIntersect(x1, y1, x2, y2, rect.right, rect.bottom, rect.left, rect.bottom)) return true;
        if (lineIntersect(x1, y1, x2, y2, rect.left, rect.bottom, rect.left, rect.top)) return true;
        return false;
    };

    const computeAvoidingPath = (startX: number, startY: number, endX: number, endY: number, obstacles: Array<{ left: number, top: number, right: number, bottom: number, id?: string }>, excludeIds: string[] = []) => {
        // Quick check: if straight segment doesn't intersect any obstacle, return smooth cubic bezier
        const intersectsAny = obstacles.some(ob => excludeIds.includes(ob.id || '') ? false : segmentIntersectsRect(startX, startY, endX, endY, ob));
        if (!intersectsAny) {
            const dx = endX - startX;
            const controlOffset = Math.max(60, Math.abs(dx) / 2);
            const c1x = startX + controlOffset;
            const c1y = startY;
            const c2x = endX - controlOffset;
            const c2y = endY;
            return `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
        }

        // Try horizontal-middle elbow routing: start -> (mx,startY) -> (mx,endY) -> end
        const containerWidth = Math.max(Math.abs(endX - startX), (gridSettings.cols || 24) * (gridSettings.cellWidth || 50));
        const step = Math.max(20, (gridSettings.cellWidth || 50));
        const baseMx = (startX + endX) / 2;
        for (let k = 0; k <= containerWidth; k += step) {
            for (const sign of [1, -1]) {
                const mx = baseMx + sign * k;
                const segs: Array<[number, number, number, number]> = [
                    [startX, startY, mx, startY],
                    [mx, startY, mx, endY],
                    [mx, endY, endX, endY]
                ];
                const blocked = segs.some(([x1, y1, x2, y2]) => obstacles.some(ob => excludeIds.includes(ob.id || '') ? false : segmentIntersectsRect(x1, y1, x2, y2, ob)));
                if (!blocked) {
                    return `M ${startX} ${startY} L ${mx} ${startY} L ${mx} ${endY} L ${endX} ${endY}`;
                }
            }
        }

        // Try vertical-middle elbow routing: start -> (startX,my) -> (endX,my) -> end
        const baseMy = (startY + endY) / 2;
        const containerHeight = Math.max(Math.abs(endY - startY), (gridSettings.rows || 16) * (gridSettings.cellHeight || 50));
        for (let k = 0; k <= containerHeight; k += step) {
            for (const sign of [1, -1]) {
                const my = baseMy + sign * k;
                const segs: Array<[number, number, number, number]> = [
                    [startX, startY, startX, my],
                    [startX, my, endX, my],
                    [endX, my, endX, endY]
                ];
                const blocked = segs.some(([x1, y1, x2, y2]) => obstacles.some(ob => excludeIds.includes(ob.id || '') ? false : segmentIntersectsRect(x1, y1, x2, y2, ob)));
                if (!blocked) {
                    return `M ${startX} ${startY} L ${startX} ${my} L ${endX} ${my} L ${endX} ${endY}`;
                }
            }
        }

        // Fallback: larger curved bezier
        const dx = endX - startX;
        const controlOffset = Math.max(120, Math.abs(dx));
        const c1x = startX + controlOffset;
        const c1y = startY;
        const c2x = endX - controlOffset;
        const c2y = endY;
        return `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
    };
    // Simpler directional cubic bezier path that anchors to widget sides
    const getSmartPath = (x1: number, y1: number, x2: number, y2: number) => {
        const dx = Math.abs(x2 - x1);
        const offset = Math.max(60, dx * 0.4);
        const c1x = x1 + offset;
        const c2x = x2 - offset;
        return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
    };

    // Sample cubic bezier points and check segment intersection with obstacles
    const sampleCubic = (x1: number, y1: number, c1x: number, c1y: number, c2x: number, c2y: number, x2: number, y2: number, segments = 24) => {
        const pts: Array<{ x: number, y: number }> = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const mt = 1 - t;
            const x = mt * mt * mt * x1 + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * x2;
            const y = mt * mt * mt * y1 + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * y2;
            pts.push({ x, y });
        }
        return pts;
    };

    const bezierIntersectsObstacles = (x1: number, y1: number, x2: number, y2: number, obstacles: Array<{ left: number, top: number, right: number, bottom: number }>) => {
        const dx = Math.abs(x2 - x1);
        const offset = Math.max(60, dx * 0.4);
        const c1x = x1 + offset;
        const c1y = y1;
        const c2x = x2 - offset;
        const c2y = y2;
        const pts = sampleCubic(x1, y1, c1x, c1y, c2x, c2y, x2, y2, 28);
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            for (const ob of obstacles) {
                if (segmentIntersectsRect(a.x, a.y, b.x, b.y, ob)) return true;
            }
        }
        return false;
    };
    // Use FlowModalContext for modal state
    const { showFlowModal, setShowFlowModal, markFlowSeen } = require('@/context/FlowModalContext').useFlowModal();
    // Flowchart zoom scale (1 = 100%). Users can zoom in/out the flow modal to fit more widgets.
    const [flowScale, setFlowScale] = useState<number>(1);
    const clampScale = (v: number) => Math.max(0.4, Math.min(2.0, v));

    // Debug: log modalPositions and flowScale when they change to help diagnose
    // issues where stored positions don't match the visual scaled surface.
    useEffect(() => {
        try {
            if (FLOW_LOG) console.debug('[FlowDebug] flowScale/modalPositions', { flowScale, modalPositions });
        } catch (err) { /* ignore */ }
    }, [flowScale, modalPositions]);
    // Selected connection index (for arrow selection/deletion)
    const [selectedConnectionIndex, setSelectedConnectionIndex] = useState<number | null>(null);
    // List of all possible widgets in the flow (initially based on flowchart)
    // Channel configuration: default show DEFAULT_CHANNEL_COUNT channels, up to MAX_CHANNELS
    // Channel ids are zero-based: 'channel-0', 'channel-1', ...
    const MAX_CHANNELS = 16;
    const DEFAULT_CHANNEL_COUNT = 1;
    const [channelCount, setChannelCount] = useState<number>(DEFAULT_CHANNEL_COUNT);

    // Generate initial flow options with default channelCount
    // flow option objects may optionally include a `count` property for types that support multiple instances (e.g. 'basic')
    const initialFlowOptions: Array<{ id: string, label: string, type: string, selected: boolean, count?: number, instances?: Array<{ id: string, label?: string }> }> = [];
    // create channel-0 .. channel-(N-1)
    for (let ch = 0; ch < DEFAULT_CHANNEL_COUNT; ch++) {
        initialFlowOptions.push({ id: `channel-${ch}`, label: `Channel ${ch}`, type: 'channel', selected: true });
    }
    // Create a default basic Plot option with one instance so the Plots box appears
    // and we can wire channel-0 -> plot-instance-0 by default.
    const defaultBasicId = 'basic-0';
    const defaultBasicInstanceId = `${defaultBasicId}-0`;
    initialFlowOptions.push({ id: defaultBasicId, label: 'Plot', type: 'basic', selected: true, instances: [{ id: defaultBasicInstanceId, label: 'Plot 0' }] });
    // By default we only include the configured channels in the flowchart.
    // Other applications (spiderplot, FFT, Bandpower, etc.) can be added by the user


    // using the drag-and-drop Applications palette into the flow modal.
    const [flowOptions, setFlowOptions] = useState(initialFlowOptions);
    // Local UI state for application palette filtering
    const [appFilter, setAppFilter] = useState<string>('');

    // Register which channel flow nodes are present so the channel data context
    // will route incoming samples only to the active channels.
    useEffect(() => {
        const channelIds = flowOptions.filter(o => typeof o.id === 'string' && o.id.startsWith('channel-')).map(o => o.id as string);
        try {
            setRegisteredChannels(channelIds);
        } catch (err) {
            // ignore: context may be undefined during SSR or early render
        }
    }, [flowOptions, setRegisteredChannels]);

    // (per-channel filter mapping effect moved down so `connections` is
    // defined before it's referenced)
    // Handlers to increase/decrease visible channels in the combined widget
    const increaseChannels = useCallback(() => {
        // Find max existing channel number and add next
        setFlowOptions(prevOpts => {
            const channelIds = prevOpts.filter(o => typeof o.id === 'string' && o.id.startsWith('channel-'));
            const nums = channelIds.map(o => {
                const m = (o.id as string).match(/channel-(\d+)/i);
                return m ? parseInt(m[1], 10) : 0;
            });
            const maxExisting = nums.length > 0 ? Math.max(...nums) : 0;
            const next = Math.min(MAX_CHANNELS, maxExisting + 1);
            if (next <= maxExisting) return prevOpts;
            return [{ id: `channel-${next}`, label: `Channel ${next}`, type: 'channel', selected: true }, ...prevOpts];
        });
        setChannelCount(prev => Math.min(MAX_CHANNELS, prev + 1));
    }, [MAX_CHANNELS]);

    const decreaseChannels = useCallback(() => {
        setFlowOptions(prevOpts => {
            const channelIds = prevOpts.filter(o => typeof o.id === 'string' && o.id.startsWith('channel-'));
            if (channelIds.length === 0) return prevOpts;
            const nums = channelIds.map(o => {
                const m = (o.id as string).match(/channel-(\d+)/i);
                return m ? parseInt(m[1], 10) : 0;
            });
            const maxExisting = nums.length > 0 ? Math.max(...nums) : 0;
            // don't remove if only channel-0 remains
            if (maxExisting <= 0) return prevOpts;
            const removeId = `channel-${maxExisting}`;
            // remove the highest-numbered channel and any connections to it
            setConnections(prevConn => prevConn.filter(c => c.from !== removeId && c.to !== removeId));
            setModalPositions(prev => {
                const copy = { ...prev } as Record<string, { left: number, top: number }>;
                if (copy[removeId]) delete copy[removeId];
                return copy;
            });
            return prevOpts.filter(o => o.id !== removeId);
        });
        setChannelCount(prev => Math.max(1, prev - 1));
    }, []);
    // Connections between widgets (user-created)
    // By default connect channel-0 -> first plot instance so the Plots box shows data
    const [connections, setConnections] = useState<Array<{ from: string, to: string }>>([{ from: 'channel-0', to: `${defaultBasicId}-0` }]);

    // Log human-readable connections to the console whenever connections or flowOptions change
    useEffect(() => {
        try {
            console.group('[Flow] Current connections');
            if (!connections || connections.length === 0) {
                console.log('  (no connections)');
                console.groupEnd();
                return;
            }

            for (const c of connections) {
                const formatLabel = (id: string) => {
                    try {
                        // Direct match on flowOptions entry
                        const direct = flowOptions.find((o: any) => String(o.id) === String(id));
                        if (direct) return `${direct.label || direct.id} (${direct.type || 'unknown'})`;

                        // Otherwise, try to locate as an instance inside a flow option (e.g. basic-... -> instance id)
                        for (const o of flowOptions) {
                            const instances = (o as any).instances || [];
                            const ins = instances.find((ii: any) => String(ii.id) === String(id));
                            if (ins) return `${ins.label || ins.id} (${o.type || 'unknown'})`;
                        }

                        // Fallback to raw id
                        return String(id);
                    } catch (err) {
                        return String(id);
                    }
                };

                const fromLabel = formatLabel(String(c.from));
                const toLabel = formatLabel(String(c.to));
                console.log(`  ${fromLabel} -> ${toLabel}`);
            }

            console.groupEnd();
        } catch (err) {
            // ignore logging errors
        }
    }, [connections, flowOptions]);

    // Toast utility functions
    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        setToast({ show: true, message, type });
    }, []);

    // Helper to add a connection with validation and auto-creation for bandpower nodes.
    const addConnection = useCallback((from: string, to: string) => {
        try {
            // If the target is the base 'bandpower' palette entry, create a
            // dedicated bandpower node instance for this connection instead of
            // wiring multiple channels into one node.
            const isTargetBaseBandpower = String(to) === 'bandpower';
            const isTargetBandpowerInstance = String(to) !== 'bandpower' && String(to).split('-')[0] === 'bandpower';

            // Helper to create a new bandpower flow option and position it
            // Accept an optional `source` string to label which channel/plot this
            // BandPower instance was created for (helps map dashboard widgets
            // back to their originating source).
            const createBandpowerInstance = (source?: string, initialLeft = 200, initialTop = 100) => {
                const id = `bandpower-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 6)}`;
                const pretty = source ? `Bandpower — ${String(source)}` : 'Bandpower';
                setFlowOptions(prev => [...prev, { id, label: pretty, type: 'bandpower', selected: true, config: { source } }]);
                try { setModalPositions(prev => ({ ...prev, [id]: pixelToNormalized(initialLeft, initialTop) })); } catch (e) { }
                return id;
            };

            // If connecting to a bandpower base, create an instance per-source
            if (isTargetBandpowerInstance) {
                // If user is directly wiring to an existing BandPower instance,
                // ensure only one incoming connection is allowed.
                const already = connectionsRef.current && connectionsRef.current.some(c => c.to === to);
                if (already) {
                    try { showToast && showToast('This BandPower node already has an input. Create separate BandPower nodes per channel.', 'error'); } catch (e) { }
                    return;
                }
                // Connect directly (single instance) if source is valid
                if (/^channel-\d+/i.test(String(from)) || String(from).startsWith('basic-') || flowOptions.some(o => o.id === from)) {
                    setConnections(prev => {
                        const exists = prev.some(c => c.from === from && c.to === to);
                        if (exists) return prev;
                        return [...prev, { from, to }];
                    });
                    return;
                }
                try { showToast && showToast('BandPower accepts only single-channel inputs. Connect a channel or a per-channel Plot.', 'error'); } catch (e) { }
                return;
            }

            if (isTargetBaseBandpower) {
                // If source is an aggregated plots widget (plots-aggregated or plots-box),
                // expand into individual plot instances and create one BandPower per plot.
                if (String(from) === 'plots-aggregated' || String(from) === 'plots-box') {
                    // find all plot instances derived from flowOptions
                    const plotOptions = flowOptions.filter(o => o.type === 'basic');
                    for (const opt of plotOptions) {
                        const insts = (opt as any).instances || Array.from({ length: (opt.count || 1) }, (_, i) => ({ id: `${opt.id}-${i}` }));
                        for (const ins of insts) {
                            const newId = createBandpowerInstance(ins.id);
                            setConnections(prev => {
                                const exists = prev.some(c => c.from === ins.id && c.to === newId);
                                if (exists) return prev;
                                return [...prev, { from: ins.id, to: newId }];
                            });
                        }
                    }
                    return;
                }

                // If source is a specific channel or a per-instance plot, create a
                // single BandPower instance and connect them.
                    if (/^channel-\d+/i.test(String(from)) || String(from).startsWith('basic-') || flowOptions.some(o => o.id === from)) {
                    const newId = createBandpowerInstance(from);
                    setConnections(prev => {
                        const exists = prev.some(c => c.from === from && c.to === newId);
                        if (exists) return prev;
                        return [...prev, { from, to: newId }];
                    });
                    return;
                }

                // Otherwise, reject the connection: BandPower accepts single-channel sources only
                try { showToast && showToast('BandPower accepts only single-channel inputs. Connect a channel or a per-channel Plot.', 'error'); } catch (e) { }
                return;
            }

            // Default behavior: add the connection if it doesn't already exist
            setConnections(prev => {
                const exists = prev.some(c => c.from === from && c.to === to);
                if (exists) return prev;
                return [...prev, { from, to }];
            });
        } catch (err) {
            // swallow
        }
    }, [flowOptions, setFlowOptions, setModalPositions, showToast]);

    // Keep connectionsRef.current synchronized so push-forwarding can read latest
    useEffect(() => { connectionsRef.current = connections; }, [connections]);

    // Debug: Log connections and channel->plot mappings so we can confirm
    // whether Plot instances (in the Plots box) have incoming channel links.
    useEffect(() => {
        try {
            // list all plot instance ids derived from flowOptions
            const plotOptions = flowOptions.filter(o => o.type === 'basic');
            const plotInstanceIds: string[] = [];
            for (const opt of plotOptions) {
                const insts = (opt as any).instances || Array.from({ length: (opt.count || 1) }, (_, i) => ({ id: `${opt.id}-${i}` }));
                for (const ins of insts) plotInstanceIds.push(ins.id);
            }

            // Find all channel -> plot connections
            const channelToPlot = connections.filter(c => typeof c.from === 'string' && String(c.from).startsWith('channel-') && typeof c.to === 'string' && plotInstanceIds.includes(String(c.to)));

            if (FLOW_LOG) console.debug('[FlowDebug] connections', { total: connections.length, connections });
            if (FLOW_LOG) console.debug('[FlowDebug] plotInstanceIds', plotInstanceIds);
            if (FLOW_LOG) console.debug('[FlowDebug] channel->plot mappings', channelToPlot);

            // (mapped-samples logging removed to avoid re-rendering the Flow
            // component on every incoming device sample; use ChannelData logs
            // instead to inspect live sample values)
        } catch (err) {
            // swallow
        }
    }, [connections, flowOptions]);

    // Compute per-channel filter configuration from flow connections and
    // flowOptions. If a channel flow node is connected to a filter node
    // (channel-# -> filter-node-id) we register that filter config with
    // the channel data provider so emitted samples are filtered.
    useEffect(() => {
        try {
            const mapping: Record<number, { enabled?: boolean, filterType?: string, filterKeys?: string[], filterKey?: string, notchFreq?: number, samplingRate?: number }> = {};
            for (const c of connections) {
                try {
                    if (typeof c.from === 'string' && String(c.from).startsWith('channel-') && typeof c.to === 'string') {
                        const m = String(c.from).match(/channel-(\d+)/i);
                        if (!m) continue;
                        const chIdx = Math.max(0, parseInt(m[1], 10));
                        // find the target flow option
                        const targetOpt = flowOptions.find(o => o.id === String(c.to));
                        if (!targetOpt) continue;
                        if (targetOpt.type === 'filter') {
                            const cfg = (targetOpt as any).config || {};
                            // Build an ordered list of filter keys from explicit per-category fields
                            const keys: string[] = [];
                            // legacy single-key support
                            if (cfg.filterKey) keys.push(cfg.filterKey);
                            // new per-category keys
                            if (cfg.notchKey) keys.push(cfg.notchKey);
                            if (cfg.hpKey) keys.push(cfg.hpKey);
                            if (cfg.lpKey) keys.push(cfg.lpKey);
                            // legacy notch fields
                            if (!keys.length && cfg.filterType === 'notch') {
                                keys.push(`notch-${(cfg.notchFreq || 50)}`);
                            }

                            mapping[chIdx] = {
                                enabled: cfg.enabled !== false,
                                filterType: cfg.filterType || (keys.length > 0 && keys[0].startsWith('notch') ? 'notch' : undefined),
                                // pass an array of filter keys to the provider so it can apply them in order
                                filterKey: undefined,
                                notchFreq: cfg.notchFreq || (keys.length > 0 && keys[0].startsWith('notch') ? parseInt(keys[0].split('-')[1], 10) : undefined),
                                samplingRate: cfg.samplingRate || undefined,
                            };
                            // attach the ordered keys into a companion field for clarity
                            (mapping as any)[chIdx].filterKeys = keys.length ? keys : undefined;
                        }
                    }
                } catch (err) { /* ignore per-connection errors */ }
            }
            try {
                if (typeof setChannelFilters === 'function') setChannelFilters(mapping);
            } catch (err) { /* ignore */ }
        } catch (err) { /* ignore */ }
    }, [connections, flowOptions, setChannelFilters]);
    // --- selection & keyboard handlers for connections ---
    useEffect(() => {
        if (!showFlowModal) return;

        const onClick = (ev: MouseEvent) => {
            try {
                const svg = document.getElementById('flowchart-arrow-svg');
                if (!svg) return;
                const rect = svg.getBoundingClientRect();
                const mx = ev.clientX - rect.left;
                const my = ev.clientY - rect.top;

                let nearest = -1;
                let nearestDist = Infinity;
                for (let i = 0; i < connections.length; i++) {
                    const c = connections[i] as any;
                    const ep = computeConnectionEndpoints(c.from, c.to);
                    if (!ep) continue;
                    const d = pointToSegmentDistance(mx, my, ep.startX, ep.startY, ep.endX, ep.endY);
                    if (d < nearestDist) { nearest = i; nearestDist = d; }
                }
                // threshold in pixels
                if (nearest !== -1 && nearestDist <= 8) {
                    setSelectedConnectionIndex(nearest);
                } else {
                    setSelectedConnectionIndex(null);
                }
            } catch (err) { /* ignore */ }
        };

        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === 'Delete' || ev.key === 'Backspace') {
                if (selectedConnectionIndex !== null && selectedConnectionIndex >= 0 && selectedConnectionIndex < connections.length) {
                    setConnections(prev => prev.filter((_, idx) => idx !== selectedConnectionIndex));
                    setSelectedConnectionIndex(null);
                }
            }
        };

        window.addEventListener('click', onClick);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('click', onClick);
            window.removeEventListener('keydown', onKey);
        };
    }, [showFlowModal, connections, selectedConnectionIndex]);

    // Widget collection state. Start empty — dashboard widgets are created
    // by the arranger when the user clicks Play (or by explicit Add Widget).
    const [widgets, setWidgets] = useState<Widget[]>([]);
    // Modal state for connection UI
    const [showConnectionModal, setShowConnectionModal] = useState(false);

    // Grid configuration state - initialize with SSR-safe defaults, adjust in useEffect
    const [gridSettings, setGridSettings] = useState<GridSettings>({
        cols: 24,  // SSR-safe default
        rows: 16,  // SSR-safe default
        showGridlines: true,
        cellWidth: 50,
        cellHeight: 50,
    });

    // Populate initial presets after core defaults are available
    useEffect(() => {
        try {
            if (flowPresets && flowPresets.length > 0) return;
            const defaultPreset = {
                id: 'preset-default',
                name: 'Default',
                flowOptions: JSON.parse(JSON.stringify(initialFlowOptions)),
                modalPositions: JSON.parse(JSON.stringify(initialModalPositions)),
                connections: JSON.parse(JSON.stringify(connections || [])),
                gridSettings: JSON.parse(JSON.stringify(gridSettings)),
                channelCount: channelCount,
            };

            const examplePreset = (() => {
                try {
                    const fo = JSON.parse(JSON.stringify(initialFlowOptions));
                    // add channel-1 if not present
                    if (!fo.find((x: any) => x.id === 'channel-1')) {
                        fo.unshift({ id: 'channel-1', label: 'Channel 1', type: 'channel', selected: true });
                    }
                    const basic = fo.find((x: any) => x.id === defaultBasicId);
                    if (basic) {
                        basic.instances = basic.instances || [];
                        if (!basic.instances.find((ins: any) => ins.id === `${defaultBasicId}-1`)) {
                            basic.instances.push({ id: `${defaultBasicId}-1`, label: 'Plot 1' });
                        }
                    }
                    const mp: Record<string, { left: number, top: number }> = JSON.parse(JSON.stringify(initialModalPositions));
                    mp['channel-1'] = mp['channel-1'] || { left: 60, top: 140 };
                    const con = [{ from: 'channel-0', to: `${defaultBasicId}-0` }, { from: 'channel-1', to: `${defaultBasicId}-1` }];
                    return { id: 'preset-example', name: 'Example Flow', flowOptions: fo, modalPositions: mp, connections: con, gridSettings: JSON.parse(JSON.stringify(gridSettings)), channelCount: 2 };
                } catch (err) { return defaultPreset; }
            })();

            setFlowPresets([defaultPreset, examplePreset]);
            setSelectedPresetId(defaultPreset.id);
        } catch (err) { }
    }, []);

    // Active drag operation state
    const [dragState, setDragState] = useState<DragState>({
        isDragging: false,
        dragType: null,
        startX: 0,
        startY: 0,
        startWidth: 0,
        startHeight: 0,
        startMouseX: 0,
        startMouseY: 0,
        activeWidgetId: null,
    });

    // UI feedback states
    const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'info' });
    const [confirm, setConfirm] = useState<ConfirmState>({
        show: false, message: '', onConfirm: () => { }, onCancel: () => { }
    });

    // Refs for performance
    // widgetsRef declared earlier so callbacks defined above can use it.
    const gridSettingsRef = useRef<GridSettings>(gridSettings);
    // Flag to indicate an input handled mouseup and finalized the connection
    const inputHandledRef = useRef(false);

    // Arrow refresh tick to force re-render when modal positions or connections change
    const [arrowTick, setArrowTick] = useState(0);
    useEffect(() => {
        // Trigger a small re-render to ensure arrow geometry is recalculated after layout changes
        setArrowTick(t => t + 1);
    }, [modalPositions, connections, widgets, gridSettings]);

    // Client-only mount flag to avoid rendering DOM-dependent graphics during SSR
    const [isClient, setIsClient] = useState(false);
    useEffect(() => { setIsClient(true); }, []);

    // When the flow modal is opened, DOM nodes for modal items may not be ready immediately.
    // Schedule a double rAF to force arrow recalculation after the modal has painted.
    useEffect(() => {
        if (!showFlowModal) return;
        let raf1: number | null = null;
        let raf2: number | null = null;
        raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => {
                setArrowTick(t => t + 1);
            });
        });
        return () => {
            if (raf1) cancelAnimationFrame(raf1);
            if (raf2) cancelAnimationFrame(raf2);
        };
    }, [showFlowModal]);

    // Keep refs synchronized with state
    useEffect(() => {
        widgetsRef.current = widgets;
    }, [widgets]);

    useEffect(() => {
        gridSettingsRef.current = gridSettings;
    }, [gridSettings]);


    // Monitor screen size and adjust grid to use full viewport. Use useLayoutEffect
    // so sizing is computed before the browser paints and avoids an initial
    // layout jump (visible gap) when client JS hydrates.
    useLayoutEffect(() => {
        let resizeTimeout: NodeJS.Timeout;

        const adjustGridToScreen = () => {
            // UI Offsets
            const HEADER_HEIGHT = 64; // h-16 (px)
            const headerHeight = HEADER_HEIGHT;
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            // Calculate usable area for widgets
            const usableWidth = screenWidth;
            const usableHeight = screenHeight - headerHeight;

            // Choose desired number of columns and rows (can be made configurable)
            const targetCols = 24;
            const targetRows = 16;

            // Dynamically calculate cell size that fits whole grid cells into available area
            // Use integer cell sizes so boxes are not cut off; center the grid inside usable area
            const cellWidth = Math.max(1, Math.floor(usableWidth / targetCols));
            const cellHeight = Math.max(1, Math.floor(usableHeight / targetRows));

            // Total pixel size the grid will occupy
            const totalGridWidth = cellWidth * targetCols;
            const totalGridHeight = cellHeight * targetRows;

            // Center grid horizontally and vertically within usable area (below header)
            const offsetX = Math.max(0, Math.floor((usableWidth - totalGridWidth) / 2));
            const offsetY = headerHeight + Math.max(0, Math.floor((usableHeight - totalGridHeight) / 2));

            setGridSettings(prev => ({
                ...prev,
                cols: targetCols,
                rows: targetRows,
                cellWidth,
                cellHeight,
                offsetX,
                offsetY,
            }));

            // Constrain existing widgets to new grid boundaries
            setWidgets(prevWidgets =>
                prevWidgets.map(widget => {
                    // Prevent widgets from overlapping header
                    const minX = 0;
                    const maxX = targetCols - widget.width;
                    const minY = 0;
                    const maxY = targetRows - widget.height;
                    const constrainedX = Math.max(minX, Math.min(widget.x, maxX));
                    const constrainedY = Math.max(minY, Math.min(widget.y, maxY));
                    // If widget is too large for new grid, resize it
                    const constrainedWidth = Math.min(widget.width, targetCols);
                    const constrainedHeight = Math.min(widget.height, targetRows);
                    if (constrainedX !== widget.x || constrainedY !== widget.y ||
                        constrainedWidth !== widget.width || constrainedHeight !== widget.height) {
                        return {
                            ...widget,
                            x: constrainedX,
                            y: constrainedY,
                            width: Math.max(widget.minWidth, constrainedWidth),
                            height: Math.max(widget.minHeight, constrainedHeight)
                        };
                    }
                    return widget;
                })
            );
        };

        // Debounced resize handler to improve performance
        const handleResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(adjustGridToScreen, 100);
        };

        // Adjust on mount and window resize
        adjustGridToScreen();
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(resizeTimeout);
        };
    }, []);

    const hideToast = useCallback(() => {
        setToast(prev => ({ ...prev, show: false }));
    }, []);

    // Confirmation dialog utility functions
    const showConfirm = useCallback((message: string, onConfirm: () => void) => {
        setConfirm({
            show: true,
            message,
            onConfirm: () => {
                setConfirm(prev => ({ ...prev, show: false }));
                onConfirm();
            },
            onCancel: () => {
                setConfirm(prev => ({ ...prev, show: false }));
            }
        });
    }, []);

    /**
     * Add widget to the grid with collision detection and screen boundary awareness
     */
    const handleAddWidget = useCallback((type: string) => {
        let x = 0, y = 0;
        let found = false;

        // Set default sizes for each widget type
        let defaultWidth = 2;
        let defaultHeight = 2;
        let minWidth = 1;
        let minHeight = 1;

        if (type === 'basic') {
            // Make Plot (basic) widgets slightly larger by default so they have room for plots
            defaultWidth = 6;
            defaultHeight = 5;
            minWidth = 6;
            minHeight = 5;
        } else if (type === 'spiderplot') {
            defaultWidth = 6;
            defaultHeight = 6;
            minWidth = 4;
            minHeight = 4;
        } else if (type === 'FFTGraph') {
            defaultWidth = 6;
            defaultHeight = 5;
            minWidth = 4;
            minHeight = 3;
        } else if (type === 'channel') {
            defaultWidth = 4;
            defaultHeight = 3;
            minWidth = 3;
            minHeight = 2;
        } else if (type === 'bandpower') {
            defaultWidth = 5;
            defaultHeight = 4;
            minWidth = 4;
            minHeight = 3;
        } else if (type === 'candle') {
            defaultWidth = 4;
            defaultHeight = 4;
            minWidth = 3;
            minHeight = 3;
        } else if (type === 'game') {
            defaultWidth = 6;
            defaultHeight = 4;
            minWidth = 4;
            minHeight = 3;
        } else if (type === 'bargraph' || type === 'statistic') {
            defaultWidth = 5;
            defaultHeight = 4;
            minWidth = 3;
            minHeight = 3;
        }

        for (let row = 0; row < gridSettings.rows - defaultHeight + 1 && !found; row++) {
            for (let col = 0; col < gridSettings.cols - defaultWidth + 1 && !found; col++) {
                if (!checkCollisionAtPosition(widgets, 'temp', col, row, defaultWidth, defaultHeight, gridSettings)) {
                    x = col;
                    y = row;
                    found = true;
                }
            }
        }

        if (found) {
            const newWidget: Widget = {
                id: `widget-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                x,
                y,
                width: defaultWidth,
                height: defaultHeight,
                minWidth,
                minHeight,
                type,
            };
            setWidgets(prev => [...prev, newWidget]);
            showToast(`${type} widget added`, 'success');
        } else {
            showToast('No space available for new widget', 'error');
        }
    }, [widgets, gridSettings, showToast]);


    /**
     * Add an item to the flowchart modal at pixel coordinates (left, top)
     * This creates a flowOptions entry and a modalPositions entry so the
     * item appears inside the flow configuration modal (not the dashboard).
     */
    const handleAddFlowItemAt = useCallback((type: string, left: number, top: number) => {
        // Normalize incoming type to canonical flow types
        const lower = (type || '').toString().toLowerCase();
        let canonical = lower;
        if (lower === 'fftgraph' || lower === 'fft') canonical = 'fft';
        if (lower === 'bandpower' || lower === 'band') canonical = 'bandpower';
        if (lower === 'spiderplot' || lower === 'spider') canonical = 'spiderplot';
        if (lower === 'basic' || lower === 'realtime' || lower === 'real-time signal') canonical = 'basic';

        const labelMap: Record<string, string> = {
            spiderplot: 'Spider Plot',
            fft: 'FFT',
            channel: 'Channel',
            envelope: 'Envelope',
            candle: 'Candle',
            game: 'Game',
            bandpower: 'Bandpower',
            basic: 'Plot',
            filter: 'Filter'
        };
        const label = labelMap[canonical] || type;

        // Create a unique id for every dropped instance so multiple copies are allowed
        const id = `${canonical}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

        // Add to flowOptions so it's rendered in the flow modal
        setFlowOptions(prev => [...prev, { id, label, type: canonical, selected: true, ...(canonical === 'basic' ? { instances: [{ id: `${id}-0`, label: `${label} 0` }] } : {}) }]);

        // Adjust incoming coordinates for current zoom scale so items drop
        // where the user expects when the flow area is scaled via CSS
        // transform: scale(flowScale). We treat `left`/`top` as screen
        // coordinates relative to the scaled container, so divide by
        // flowScale to convert into the unscaled modal coordinate space.
        const s = flowScale || 1;
        const adjLeft = Math.round(left / s);
        const adjTop = Math.round(top / s);

        // Clamp left/top to reasonable bounds inside the flow *container* (not the full modal)
        // Use the flow container rect so dropped items cannot be placed outside the visible flow area.
        const crect = getFlowContainerRect();
        const containerWidth = Math.max(1200, Math.round(crect.width || 1200));
        const containerHeight = Math.max(500, Math.round(crect.height || 500));
        const widgetWidth = (canonical === 'bandpower') ? 220 : 180;
        const widgetHeight = 70;
        const clamped = clampToFlowBounds(adjLeft, adjTop, widgetWidth, widgetHeight);

        // Store normalized coordinates so positions remain correct under zoom/resize
        setModalPositions(prev => ({ ...prev, [id]: pixelToNormalized(clamped.left, clamped.top) }));
        showToast(`${label} added to flowchart`, 'success');
    }, [flowOptions, setFlowOptions, setModalPositions, showToast, flowScale]);

    /**
     * Add a new instance (sub-widget) to a basic flow option.
     * Each instance gets a stable unique id so connections can target it.
     */
    // Maximum number of plot instances allowed across all basic flow options
    const MAX_PLOT_INSTANCES = 16;

    const addBasicInstance = useCallback((optId: string) => {
        setFlowOptions(prev => {
            // Count existing basic instances across all basic options
            const basicOpts = prev.filter(p => p.type === 'basic');
            let totalInstances = 0;
            for (const o of basicOpts) {
                const insts = (o as any).instances || Array.from({ length: (o.count || 1) }, (_, i) => ({ id: `${o.id}-${i}` }));
                totalInstances += insts.length;
            }
            if (totalInstances >= MAX_PLOT_INSTANCES) {
                try { showToast(`Maximum of ${MAX_PLOT_INSTANCES} plots reached`, 'info'); } catch (e) { }
                return prev;
            }

            return prev.map(o => {
                if (o.id !== optId) return o;
                const existing = (o as any).instances || [];
                // nextIndex is zero-based
                const nextIndex = existing.length;
                const newId = `${o.id}-${Date.now().toString(36).substr(2, 6)}-${nextIndex}`;
                const newLabel = `${o.label} ${nextIndex}`;
                return { ...o, instances: [...existing, { id: newId, label: newLabel }] };
            });
        });
    }, [showToast]);

    const removeBasicInstance = useCallback((optId: string, instanceId: string) => {
        // Prevent removing the very last plot instance across all basic options
        const basicOpts = (Array.isArray(flowOptions) ? flowOptions : []).filter(o => o.type === 'basic');
        let totalInstances = 0;
        for (const o of basicOpts) {
            const insts = (o as any).instances || Array.from({ length: (o.count || 1) }, (_, i) => ({ id: `${o.id}-${i}` }));
            totalInstances += insts.length;
        }
        if (totalInstances <= 1) {
            try { showToast('At least one plot must remain in the Plots box', 'info'); } catch (e) { }
            return;
        }

        // Remove instance from flowOptions and any connections/modal positions that reference it
        setFlowOptions(prev => prev.map(o => o.id === optId ? { ...o, instances: ((o as any).instances || []).filter((ins: any) => ins.id !== instanceId) } : o));
        setConnections(prev => prev.filter(c => c.from !== instanceId && c.to !== instanceId));
        setModalPositions(prev => {
            const copy = { ...prev } as Record<string, { left: number, top: number }>;
            if (copy[instanceId]) delete copy[instanceId];
            return copy;
        });
    }, []);

    // Plot aggregate controls (mirror Channels box behavior but for basic/Plot instances)
    const increasePlots = useCallback(() => {
        // Add an instance to the first existing basic option, or create a new basic flow option if none
        const basicOpts = flowOptions.filter(o => o.type === 'basic');
        // Count existing basic instances to enforce MAX_PLOT_INSTANCES
        const existingCount = basicOpts.reduce((acc, o) => acc + (((o as any).instances || []).length || (o.count || 1)), 0);
        if (existingCount >= MAX_PLOT_INSTANCES) {
            try { showToast(`Maximum of ${MAX_PLOT_INSTANCES} plots reached`, 'info'); } catch (e) { }
            return;
        }
        if (basicOpts.length > 0) {
            // Prefer the currently selected basic option if present, otherwise fall back to the first
            const selectedBasic = basicOpts.find(o => (o as any).selected) || basicOpts[0];
            addBasicInstance(selectedBasic.id);
            return;
        }
        // Create a new basic flow option with one instance (zero-based instance id/label)
        const id = `basic-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const label = 'Plot';
        setFlowOptions(prev => [...prev, { id, label, type: 'basic', selected: true, instances: [{ id: `${id}-0`, label: `${label} 0` }] }]);
        // Adjust default stored position to account for current visual scale so
        // the node appears in the expected place when the flow surface is scaled.
        setModalPositions(prev => {
            const s = flowScale || 1;
            const adjLeft = Math.round(200 / s);
            const adjTop = Math.round(100 / s);
            return ({ ...prev, [id]: pixelToNormalized(adjLeft, adjTop) });
        });
    }, [flowOptions, addBasicInstance, flowScale, showToast]);

    const decreasePlots = useCallback(() => {
        // Remove the last created basic instance across all basic options
        const basicOpts = flowOptions.filter(o => o.type === 'basic');
        if (basicOpts.length === 0) return;
        // find last instance by timestamp suffix heuristic (instance ids contain timestamp when created)
        let lastOpt: any = null;
        let lastInsId: string | null = null;
        for (const o of basicOpts) {
            const insts = (o as any).instances || Array.from({ length: (o.count || 1) }, (_, i) => ({ id: `${o.id}-${i + 1}`, label: `${o.label} ${i + 1}` }));
            if (insts && insts.length > 0) {
                const candidate = insts[insts.length - 1];
                lastOpt = o;
                lastInsId = candidate.id;
            }
        }
        if (lastOpt && lastInsId) {
            removeBasicInstance(lastOpt.id, lastInsId);
            return;
        }
    }, [flowOptions, removeBasicInstance]);

    const handleRemovePlots = useCallback(() => {
        // Remove all basic plot flow options and any connections referencing them
        setFlowOptions(prev => prev.filter(o => o.type !== 'basic'));
        setConnections(prev => prev.filter(c => !c.from || !String(c.from).startsWith('basic-') && !String(c.from).includes('-') ? true : !String(c.from).includes('basic-')));
        setModalPositions(prev => {
            const copy = { ...prev } as Record<string, { left: number, top: number }>;
            if (copy['plots-box']) delete copy['plots-box'];
            Object.keys(copy).forEach(k => { if (k.startsWith('basic-')) delete copy[k]; });
            return copy;
        });
        showToast('Plots removed', 'info');
    }, [showToast]);

    /**
     * Remove widget by ID
     */
    const handleRemoveWidget = useCallback((id: string) => {
        // Remove the widget itself
        setWidgets(prev => prev.filter(widget => widget.id !== id));
        // Remove any flow option entry for this widget
        setFlowOptions(prev => prev.filter(opt => opt.id !== id));
        // Remove any connections that reference this widget (from or to)
        setConnections(prev => prev.filter(conn => conn.from !== id && conn.to !== id));
        // Remove any stored modal position for this widget
        setModalPositions(prev => {
            const copy = { ...prev } as Record<string, { left: number, top: number }>;
            if (copy[id]) delete copy[id];
            return copy;
        });

        showToast('Widget removed (and related connections cleared)', 'info');
    }, [showToast]);

    /**
     * Update widget properties
     */
    const handleUpdateWidget = useCallback((id: string, updates: Partial<Widget>) => {
        // Avoid creating new array/object references when the updates
        // do not actually change any widget properties. This prevents
        // redundant re-renders and potential update loops when mouse
        // move or other high-frequency handlers call this repeatedly
        // with identical values.
        setWidgets(prev => {
            const idx = prev.findIndex(w => w.id === id);
            if (idx === -1) return prev;
            const old = prev[idx];

            // If none of the provided update keys change the old widget,
            // return the previous array to avoid a state change.
            let changed = false;
            for (const k of Object.keys(updates || {})) {
                // compare shallowly for primitive fields (x,y,width,height,...)
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                if ((updates as any)[k] !== (old as any)[k]) { changed = true; break; }
            }
            if (!changed) return prev;

            const merged = { ...old, ...updates } as Widget;
            const next = prev.slice();
            next[idx] = merged;
            return next;
        });
    }, []);

    /**
     * Load layout (for import functionality)
     */
    const handleLoadLayout = useCallback((newWidgetsOrPayload: any, newGridSettings?: GridSettings) => {
        try { console.debug('[Page] handleLoadLayout called', { argIsArray: Array.isArray(newWidgetsOrPayload), sample: (Array.isArray(newWidgetsOrPayload) ? (newWidgetsOrPayload as Widget[]).slice(0,3).map((w:any)=>w.id) : null), grid: newGridSettings }); } catch (e) { }

        // If caller passed an array of widgets (legacy), behave as before
        if (Array.isArray(newWidgetsOrPayload)) {
            const arr = newWidgetsOrPayload as Widget[];
            setWidgets(arr);
            if (newGridSettings) setGridSettings(newGridSettings);
            try { showToast(`Layout loaded with ${arr.length} widgets`, 'success'); } catch (e) { }
            return;
        }

        // Otherwise treat arg as a payload object that may contain multiple fields
        const payload = newWidgetsOrPayload || {};

        // Prefer explicit widgets array if present
        let widgetsArr: Widget[] | null = Array.isArray(payload.widgets) ? payload.widgets : null;

        // If widgets array is empty or missing but payload contains flowOptions/modalPositions,
        // synthesize a reasonable set of widgets so imported files that store flow as
        // flowOptions+modalPositions are visible in the editor.
        if ((!widgetsArr || widgetsArr.length === 0) && Array.isArray(payload.flowOptions) && payload.flowOptions.length > 0) {
            try {
                const gs = (newGridSettings || payload.gridSettings) || gridSettingsRef.current || gridSettings;
                const modalPos = payload.modalPositions || {};
                const fo = payload.flowOptions || [];
                const synthesized: Widget[] = [];
                let nextIndex = 0;
                for (const opt of fo) {
                    // If an option contains multiple instances, create widgets for each instance
                    if (Array.isArray(opt.instances) && opt.instances.length > 0) {
                        for (const inst of opt.instances) {
                            const wid = inst.id || `${opt.id}-${nextIndex}`;
                            const posNorm = modalPos[wid] || modalPos[opt.id];
                            const pixel = posNorm ? normalizedToPixel(posNorm) : { left: (nextIndex % (gs.cols || 24)) * (gs.cellWidth || 50), top: Math.floor(nextIndex / (gs.cols || 24)) * (gs.cellHeight || 50) };
                            const x = Math.max(0, Math.floor(pixel.left / (gs.cellWidth || 50)));
                            const y = Math.max(0, Math.floor(pixel.top / (gs.cellHeight || 50)));
                            const typeMap: Record<string,string> = { channel: 'basic', basic: 'basic', fft: 'FFTGraph', spiderplot: 'spiderplot', bandpower: 'statistic', candle: 'candle' };
                            const type = typeMap[opt.type] || opt.type || 'basic';
                            synthesized.push({ id: wid, x, y, width: 4, height: 3, minWidth: 1, minHeight: 1, type, channelIndex: (typeof wid === 'string' && wid.startsWith('channel-')) ? Number((wid.match(/channel-(\d+)/)||[])[1]||0) : undefined });
                            nextIndex++;
                        }
                    } else {
                        const wid = opt.id || `opt-${nextIndex}`;
                        const posNorm = modalPos[wid] || modalPos[opt.id];
                        const pixel = posNorm ? normalizedToPixel(posNorm) : { left: (nextIndex % (gs.cols || 24)) * (gs.cellWidth || 50), top: Math.floor(nextIndex / (gs.cols || 24)) * (gs.cellHeight || 50) };
                        const x = Math.max(0, Math.floor(pixel.left / (gs.cellWidth || 50)));
                        const y = Math.max(0, Math.floor(pixel.top / (gs.cellHeight || 50)));
                        const typeMap: Record<string,string> = { channel: 'basic', basic: 'basic', fft: 'FFTGraph', spiderplot: 'spiderplot', bandpower: 'statistic', candle: 'candle' };
                        const type = typeMap[opt.type] || opt.type || 'basic';
                        synthesized.push({ id: wid, x, y, width: 4, height: 3, minWidth: 1, minHeight: 1, type, channelIndex: (typeof wid === 'string' && wid.startsWith('channel-')) ? Number((wid.match(/channel-(\d+)/)||[])[1]||0) : undefined });
                        nextIndex++;
                    }
                }
                widgetsArr = synthesized;
            } catch (e) {
                try { console.error('[Page] synthesize widgets failed', e); } catch (er) { }
            }
        }

        // If payload provided an explicit widgets array (possibly empty) use it,
        // otherwise fallback to the synthesized widgetsArr above.
        if (Array.isArray(payload.widgets) && payload.widgets.length > 0) widgetsArr = payload.widgets;

        if (widgetsArr) {
            setWidgets(widgetsArr);
        }

        // Apply other payload fields if present
        if (payload.gridSettings) setGridSettings(payload.gridSettings);
        if (Array.isArray(payload.connections)) setConnections(payload.connections);
        if (payload.modalPositions && typeof payload.modalPositions === 'object') setModalPositions(payload.modalPositions);
        if (Array.isArray(payload.flowOptions)) setFlowOptions(payload.flowOptions);
        if (typeof payload.channelCount === 'number') setChannelCount(payload.channelCount);

        try { showToast(`Layout loaded${widgetsArr ? ` with ${widgetsArr.length} widgets` : ''}`, 'success'); } catch (e) { }
    }, [showToast, gridSettings, setConnections, setModalPositions, setFlowOptions, setChannelCount]);

    /**
     * Save layout (export current widgets + grid settings as JSON)
     */
    const handleSaveLayout = useCallback(() => {
        try {
            // Compute pixel positions for each modal position so consumers can restore exact layout
            const pixelPositions: Record<string, { left: number, top: number }> = {};
            try {
                Object.keys(modalPositions || {}).forEach(k => {
                    try {
                        pixelPositions[k] = normalizedToPixel(modalPositions[k]);
                    } catch (e) { /* ignore */ }
                });
            } catch (e) { }

            const payload = { widgets, gridSettings, connections, modalPositions, pixelPositions, flowOptions, channelCount };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const now = new Date();
            const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
            a.download = `flow-layout-${ts}.json`;
            // append to DOM to ensure click works in all browsers
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showToast('Layout saved', 'success');
        } catch (e) {
            try { showToast('Failed to save layout', 'error'); } catch (err) { }
        }
    }, [widgets, gridSettings, connections, modalPositions, flowOptions, channelCount, showToast]);

    const handleZoomIn = useCallback(() => { setFlowScale(s => clampScale((s || 1) + 0.1)); }, [setFlowScale]);
    const handleZoomOut = useCallback(() => { setFlowScale(s => clampScale((s || 1) - 0.1)); }, [setFlowScale]);

    // Mouse move handler for drag operations
    // Use refs for dragState and gridSettings to avoid re-registering listeners
    // on every small state change which previously caused render loops.
    const dragStateRef = useRef(dragState);
    useEffect(() => { dragStateRef.current = dragState; }, [dragState]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const ds = dragStateRef.current;
            if (!ds || !ds.isDragging || !ds.activeWidgetId) return;

            const gs = gridSettingsRef.current || gridSettings;
            const deltaX = Math.round((e.clientX - ds.startMouseX) / (gs.cellWidth || 50));
            const deltaY = Math.round((e.clientY - ds.startMouseY) / (gs.cellHeight || 50));

            let newX = ds.startX;
            let newY = ds.startY;
            let newWidth = ds.startWidth;
            let newHeight = ds.startHeight;

            if (ds.dragType === 'move') {
                newX = Math.max(0, ds.startX + deltaX);
                newY = Math.max(0, ds.startY + deltaY);
            } else if (ds.dragType === 'resize') {
                newWidth = Math.max(1, ds.startWidth + deltaX);
                newHeight = Math.max(1, ds.startHeight + deltaY);
            }

            const activeWidget = widgetsRef.current.find(w => w.id === ds.activeWidgetId);
            if (activeWidget) {
                newWidth = Math.max(activeWidget.minWidth, newWidth);
                newHeight = Math.max(activeWidget.minHeight, newHeight);
            }

            if (ds.dragType === 'move') {
                const minX = 0;
                const maxX = (gs.cols || 24) - newWidth;
                const minY = 0;
                const maxY = (gs.rows || 16) - newHeight;
                newX = Math.max(minX, Math.min(newX, maxX));
                newY = Math.max(minY, Math.min(newY, maxY));
            } else if (ds.dragType === 'resize') {
                const maxAllowedWidth = Math.max(1, (gs.cols || 24) - newX);
                const maxAllowedHeight = Math.max(1, (gs.rows || 16) - newY);
                newWidth = Math.min(newWidth, maxAllowedWidth);
                newHeight = Math.min(newHeight, maxAllowedHeight);
                if (activeWidget) {
                    newWidth = Math.max(activeWidget.minWidth, newWidth);
                    newHeight = Math.max(activeWidget.minHeight, newHeight);
                }
            }

            if (!checkCollisionAtPosition(widgetsRef.current, ds.activeWidgetId, newX, newY, newWidth, newHeight, gs)) {
                handleUpdateWidget(ds.activeWidgetId, {
                    x: newX,
                    y: newY,
                    width: newWidth,
                    height: newHeight
                });
            }
        };

        const handleMouseUp = () => {
            setDragState(prev => ({ ...prev, isDragging: false, dragType: null, activeWidgetId: null }));
        };

        // Attach once for the component lifetime; handler reads latest state via refs
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleUpdateWidget]);

    // Memoized grid lines for performance
    const GridLines = useMemo(() => {
        if (!gridSettings.showGridlines) return null;

        return (
            <svg
                className="absolute inset-0 pointer-events-none"
                width="100%"
                height="100%"
                style={{ pointerEvents: 'none' }}
            >
                <defs>
                    <pattern
                        id="grid"
                        width={gridSettings.cellWidth}
                        height={gridSettings.cellHeight}
                        patternUnits="userSpaceOnUse"
                    >
                        <path
                            d={`M ${gridSettings.cellWidth} 0 L 0 0 0 ${gridSettings.cellHeight}`}
                            fill="none"
                            stroke="#cdcfd2ff"
                            strokeWidth="1"
                        />
                    </pattern>
                </defs>

                <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
        );
    }, [gridSettings.showGridlines, gridSettings.cellWidth, gridSettings.cellHeight]);

    return (
        <div className="h-full w-full bg-gray-100 flex flex-col" style={{ minHeight: 0 }}>
            {/* Flow Configuration Modal */}
            {showFlowModal && (
                <FlowModule
                    id="flow-module"
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        zIndex: 200000,
                        padding: 4,
                        display: 'flex',
                        flexDirection: 'column',
                        boxSizing: 'border-box'
                    }}
                    playFlow={playFlow}
                    showToast={showToast}
                    connActive={connActive}
                    setConnActive={setConnActive}
                    connConnecting={connConnecting}
                    setConnConnecting={setConnConnecting}
                    showConnectionModal={showConnectionModal}
                    setShowConnectionModal={setShowConnectionModal}
                    onSaveLayout={handleSaveLayout}
                    onLoadLayout={handleLoadLayout}
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    flowScale={flowScale}
                    flowPresets={flowPresets}
                    selectedFlowPresetId={selectedPresetId}
                    onSelectFlowPreset={handleSelectPreset}
                    onSaveFlowPreset={handleSavePreset}
                >
                        {/* Settings modal always rendered at top level of flowchart modal */}
                        {renderSettingsModal()}
                        {/* Close button intentionally removed to prevent accidental modal close */}

                        {/* Flowchart grid layout */}
                        {/* Row layout: left palette + flow area to avoid overlap */}
                            <div className="flow-row" style={{ gap: 16 }}>
                            <div id="flow-palette" className="flow-palette" style={{ padding: 8, borderRadius: 12, background: '#ffffff', border: '1px solid #eef2f7', boxShadow: '0 6px 22px rgba(17,24,39,0.06)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <div style={{ fontWeight: 700, padding: '6px 8px', color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span>Applications</span>
                                       
                                    </div>
                                    <div style={{ width: 110 }}>
                                        <input value={appFilter} onChange={e => setAppFilter(e.target.value)} placeholder="Search..." style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #e6eef8', fontSize: 13 }} />
                                    </div>
                                </div>

                                <div className="flow-palette-list" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                                    {/* Applications grouped into logical sections */}
                                    {isClient && (() => {
                                        const sections = [
                                            {
                                                title: 'Addition',
                                                items: [
                                                    { id: 'filter', label: 'Filter', desc: 'Signal transforms' },
                                                    { id: 'envelope', label: 'Envelope', desc: 'Amplitude envelope' },
                                                ]
                                            },
                                            {
                                                title: 'Visualization',
                                                items: [
                                                    { id: 'spiderplot', label: 'Spider Plot', desc: 'Radial multi-channel view' },
                                                    { id: 'FFTGraph', label: 'FFT', desc: 'Frequency spectrum' },
                                                    { id: 'candle', label: 'Candle', desc: 'Candlestick chart' },
                                                    { id: 'bandpower', label: 'Bandpower', desc: 'Power in frequency bands' },
                                                    { id: 'basic', label: 'Plot', desc: 'Real-time plot' },
                                                ]
                                            }
                                        ];

                                        return sections.map(section => {
                                            const visible = section.items.filter(it => !appFilter || String(it.label).toLowerCase().includes(appFilter.toLowerCase()));
                                            if (!visible || visible.length === 0) return null;
                                            return (
                                                <div key={section.title}>
                                                    <div style={{ fontSize: 12, fontWeight: 800, color: '#374151', margin: '6px 0' }}>{section.title}</div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                        {visible.map(item => {
                                                            const th = themeForId(String(item.id));
                                                            return (
                                                                <div
                                                                    key={item.id}
                                                                    draggable
                                                                    onDragStart={(e) => { try { e.dataTransfer.setData('application/widget-type', item.id); e.dataTransfer.effectAllowed = 'copy'; } catch (err) { } }}
                                                                    onMouseEnter={e => { const t = e.currentTarget as HTMLElement; t.style.transform = 'translateY(-4px)'; t.style.boxShadow = '0 12px 30px rgba(2,6,23,0.08)'; }}
                                                                    onMouseLeave={e => { const t = e.currentTarget as HTMLElement; t.style.transform = 'translateY(0px)'; t.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'; }}
                                                                    style={{ cursor: 'grab', padding: '10px 12px', background: th.bg, border: `1px solid ${th.border}`, borderRadius: 10, boxShadow: th.shadow, color: th.text, transition: 'transform 140ms ease, box-shadow 140ms ease', display: 'flex', alignItems: 'center', gap: 10 }}
                                                                >
                                                                    <div style={{ width: 36, height: 36, borderRadius: 8, background: th.border, display: 'flex', alignItems: 'center', justifyContent: 'center', color: th.text, fontWeight: 700, fontSize: 12 }}>
                                                                        {item.label.split(' ').map((s: string) => s.charAt(0)).slice(0, 2).join('')}
                                                                    </div>
                                                                    <div style={{ flex: 1 }}>
                                                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{item.label}</div>
                                                                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{item.desc}</div>
                                                                    </div>
                                                                    <div style={{ fontSize: 12, color: '#6b7280' }}>+</div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>

                            <div id="flow-area" className="flow-area" onDragOver={(e) => { e.preventDefault(); }} onDrop={(e) => {
                                e.preventDefault();
                                const type = e.dataTransfer.getData('application/widget-type') || e.dataTransfer.getData('text/plain');
                                if (!type) return;
                                const target = e.currentTarget as HTMLElement;
                                const rect = target.getBoundingClientRect();
                                const x = e.clientX - rect.left;
                                const y = e.clientY - rect.top;
                                // Add as a flowchart item (not dashboard widget). Compute pixel left/top inside flow area.
                                handleAddFlowItemAt(type, x, y);
                            }} style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, height: '100%', margin: '8px 0 12px 0', borderRadius: 12, border: `1px solid ${THEME_COLORS.default.border}`, boxShadow: '0 8px 40px rgba(2,6,23,0.06)', overflow: 'visible', background: THEME_COLORS.default.bg, backgroundImage: `radial-gradient(${THEME_COLORS.default.border} 1px, transparent 1px)`, backgroundSize: '12px 12px', WebkitUserSelect: 'none' as any, MozUserSelect: 'none' as any, msUserSelect: 'none' as any, userSelect: 'none' as any, boxSizing: 'border-box' }}>
                                {/* Header of saved flow presets (rendered inside flow area) */}
                                {Array.isArray(flowPresets) && flowPresets.length > 0 && (
                                    <div id="flow-presets-header" style={{ position: 'absolute', top: -1, left: 12, right: 12, display: 'flex', gap: 0, alignItems: 'center', zIndex: 20, pointerEvents: 'auto', overflowX: 'auto', padding: '0 0px' }}>
                                        {flowPresets.map((p, i) => {
                                            const isSel = selectedPresetId === p.id;
                                            return (
                                                <button
                                                    key={p.id}
                                                    onClick={() => { try { handleSelectPreset(p.id); } catch (e) { } }}
                                                    style={{
                                                        padding: '8px 12px',
                                                        borderTop: 'none',
                                                        borderLeft: i === 0 ? (isSel ? '2px solid #fbfcfdff' : '1px solid #e6eef8') : '1px solid #e6eef8',
                                                        borderRight: '1px solid #e6eef8',
                                                        borderBottom: 'none',
                                                        borderRadius: '0 0 0 0',
                                                        background: isSel ? '#eef2ff' : '#fff',
                                                        cursor: 'pointer',
                                                        fontWeight: 700,
                                                        fontSize: 13,
                                                        marginLeft: i === 0 ? 0 : -1,
                                                        boxShadow: 'none',
                                                        flex: 1,
                                                        minWidth: 0,
                                                        textAlign: 'center',
                                                    }}
                                                >
                                                    {p.name}
                                                </button>
                                            );
                                        })}
                                        <div style={{ width: 8 }} />
                                        <button onClick={() => { try { handleSavePreset(); } catch (e) { } }} style={{ marginLeft: '0px', padding: '8px 12px', borderRadius: '0 0 10px 10px', borderTop: 'none', border: '1px solid #eef2f7', background: '#abd0f6ff', cursor: 'pointer', fontSize: 13 }}>
                                            Save Flow
                                        </button>
                                    </div>
                                )}

                                {/* Inner scaled surface: keep outer container size constant and apply visual scaling to this inner wrapper. */}
                                {isClient ? (
                                    <div style={{ width: '100%', display: 'block', transform: `scale(${flowScale})`, transformOrigin: '0 0', willChange: 'transform', minHeight: 0 }}>
                                    {/* Flowchart nodes as boxes */}
                                    {/* Combined Channels box: visually represent all channels inside one widget but keep individual channel ids for connections */}
                                    {isClient && (() => {
                                        // derive channel list from flowOptions so removing one channel doesn't renumber others
                                        const boxPos = modalPositions['channels-box'] ? normalizedToPixel(modalPositions['channels-box']) : { left: 60, top: 80 };
                                        const channelOptions = flowOptions.filter(o => typeof o.id === 'string' && o.id.startsWith('channel-')).slice().sort((a, b) => {
                                            const ma = (a.id as string).match(/channel-(\d+)/i);
                                            const mb = (b.id as string).match(/channel-(\d+)/i);
                                            const na = ma ? parseInt(ma[1], 10) : 0;
                                            const nb = mb ? parseInt(mb[1], 10) : 0;
                                            return na - nb;
                                        });
                                        const channelsCount = channelOptions.length;
                                        // Make channels widget visually similar to other widgets
                                        const boxWidth = 220; // match other widget widths (180-220)
                                        // Vertical layout: compute row height but shrink if needed so all channels fit without scroll
                                        const desiredRowHeight = 24; // preferred compact row height
                                        const headerHeight = 34; // compact header
                                        const viewportHeight = (typeof window !== 'undefined') ? window.innerHeight : 900;
                                        // If available, constrain the channels box to the flowchart container size so it won't be cut
                                        let containerHeight = viewportHeight;
                                        let containerTop = 0;
                                        let containerLeft = 0;
                                        try {
                                            // Measure the flow container so the Channels box is clamped to it
                                            const r = getFlowContainerRect();
                                            containerHeight = r.height || containerHeight;
                                            containerTop = r.top || 0;
                                            containerLeft = r.left || 0;
                                        } catch (err) {
                                            // ignore DOM errors during SSR
                                        }
                                        // Maximum available for the widget (leave some margin for modal chrome)
                                        const maxAllowedHeight = Math.max(160, Math.min(900, containerHeight - 24));
                                        // Compute a rowHeight that will allow all channels to fit within maxAllowedHeight
                                        let rowHeight = desiredRowHeight;
                                        const desiredHeight = headerHeight + channelsCount * rowHeight + 12;
                                        if (desiredHeight > maxAllowedHeight) {
                                            // Reduce rowHeight to fit, but don't go below a reasonable minimum
                                            rowHeight = Math.max(10, Math.floor((maxAllowedHeight - headerHeight - 12) / channelCount));
                                        }
                                        const boxHeight = headerHeight + channelsCount * rowHeight + 12;
                                        // effectiveTop will be computed after we decide single vs two-column height
                                        let effectiveTop = boxPos.top;

                                        const handleDragChannels = (e: React.MouseEvent<HTMLDivElement>) => {
                                            e.preventDefault();
                                            const startX = e.clientX;
                                            const startY = e.clientY;
                                            const origLeft = boxPos.left;
                                            const origTop = boxPos.top;
                                            const onMouseMove = (moveEvent: MouseEvent) => {
                                                const dx = moveEvent.clientX - startX;
                                                const dy = moveEvent.clientY - startY;
                                                const s = flowScale || 1;
                                                const newLeft = Math.round((origLeft + dx / s) / 10) * 10;
                                                const newTop = Math.round((origTop + dy / s) / 10) * 10;
                                                // Clamp to flow container so channels box can't be dragged outside
                                                try {
                                                    const clamped = clampToFlowBounds(newLeft, newTop, boxWidth, boxHeight);
                                                    setModalPositions(pos => ({ ...pos, ['channels-box']: pixelToNormalized(clamped.left, clamped.top) }));
                                                } catch (err) {
                                                    setModalPositions(pos => ({ ...pos, ['channels-box']: pixelToNormalized(newLeft, newTop) }));
                                                }
                                            };
                                            const onMouseUp = () => {
                                                window.removeEventListener('mousemove', onMouseMove);
                                                window.removeEventListener('mouseup', onMouseUp);
                                            };
                                            window.addEventListener('mousemove', onMouseMove);
                                            window.addEventListener('mouseup', onMouseUp);
                                        };

                                        const handleRemoveChannels = (e?: React.MouseEvent) => {
                                            if (e) e.stopPropagation();
                                            // Remove all channel flow options and any connections referencing channels
                                            setFlowOptions(prev => prev.filter(o => !o.id.startsWith('channel-')));
                                            setConnections(prev => prev.filter(c => !c.from.startsWith('channel-') && !c.to.startsWith('channel-')));
                                            setModalPositions(prev => {
                                                const copy = { ...prev } as Record<string, { left: number, top: number }>;
                                                if (copy['channels-box']) delete copy['channels-box'];
                                                // Remove any per-channel modal positions if they exist
                                                Object.keys(copy).forEach(k => { if (k.startsWith('channel-')) delete copy[k]; });
                                                return copy;
                                            });
                                            showToast('Channels removed', 'info');
                                        };

                                        // Remove a specific channel by id (do not renumber remaining channels)
                                        const removeChannelAt = (channelId: string, e?: React.MouseEvent) => {
                                            if (e) e.stopPropagation();
                                            const id = channelId;
                                            const m = (id || '').match(/channel-(\d+)/i);
                                            const idx = m ? parseInt(m[1], 10) : null;

                                            // Remove the flow option for this channel
                                            setFlowOptions(prev => prev.filter(o => o.id !== id));

                                            // Remove any connections referencing this channel
                                            setConnections(prev => prev.filter(c => c.from !== id && c.to !== id));

                                            // Remove modal position for this channel
                                            setModalPositions(prev => {
                                                const copy = { ...prev } as Record<string, { left: number, top: number }>;
                                                if (copy[id]) delete copy[id];
                                                return copy;
                                            });

                                            // Remove any dashboard widget directly bound to this channel id or matching channelIndex
                                            setWidgets(prev => prev.filter(w => {
                                                if (w.id === id) return false;
                                                if (idx && (w as any).channelIndex && (w as any).channelIndex === idx) return false;
                                                return true;
                                            }));

                                            // Decrease visible count (informational) but do not renumber existing ids
                                            setChannelCount(prev => Math.max(0, prev - 1));
                                            showToast(`${id} removed`, 'info');
                                        };

                                        // Decide layout (number of columns) dynamically based on available height and width
                                        const MIN_ROW_HEIGHT = 12; // absolute minimum readable row height
                                        const preferredRowHeight = desiredRowHeight; // 24
                                        // Compute maximum rows we can show using MIN_ROW_HEIGHT
                                        const maxRowsByHeight = Math.max(1, Math.floor((maxAllowedHeight - headerHeight - 12) / MIN_ROW_HEIGHT));
                                        // If we can fit in one column at preferredRowHeight, prefer that
                                        const fitsSingleAtPreferred = (headerHeight + channelCount * preferredRowHeight + 12) <= maxAllowedHeight;
                                        let colsLayout = 1;
                                        if (!fitsSingleAtPreferred) {
                                            // Determine minimal columns required so rows <= maxRowsByHeight
                                            colsLayout = Math.max(1, Math.min(4, Math.ceil(channelCount / maxRowsByHeight)));
                                        }
                                        // Now compute rows needed and final row height to fill available height
                                        const rowsNeeded = Math.ceil(channelCount / colsLayout);
                                        let finalRowHeight = Math.floor((maxAllowedHeight - headerHeight - 12) / rowsNeeded);
                                        finalRowHeight = Math.max(MIN_ROW_HEIGHT, Math.min(preferredRowHeight, finalRowHeight));
                                        const finalBoxHeight = headerHeight + rowsNeeded * finalRowHeight + 12;
                                        // Recompute effective top so the box remains visible
                                        effectiveTop = Math.max(8, Math.min(boxPos.top, Math.max(8, containerTop + containerHeight - finalBoxHeight - 8)));

                                        // Position the channels box inside the same flowchart container so it aligns with other widgets.
                                        // Compute container width so we can clamp the box to remain visible inside it.
                                        let containerWidth = 1200;
                                        try {
                                            // Use flow container width so Channels box can't be dragged outside the flow area
                                            const r = getFlowContainerRect();
                                            containerWidth = r.width || containerWidth;
                                        } catch (err) {
                                            // ignore
                                        }

                                        // Clamp left/top to keep the box within the modal viewport bounds
                                        // but allow reasonable negative offsets so users can position
                                        // widgets near/into modal chrome if desired.
                                        const clampedLeft = Math.max(0, Math.min(boxPos.left, Math.floor(containerWidth - boxWidth)));
                                        const clampedTop = Math.max(0, Math.min(boxPos.top, Math.floor(containerHeight - finalBoxHeight)));

                                        const thCh = themeFor('channel');

                                        const contentMaxHeight = Math.max(40, finalBoxHeight - headerHeight - 18);
                                            return (
                                            <div
                                                key="channels-box"
                                                // Render as absolute inside the flowchart container so it aligns with other modal widgets
                                                style={{ position: 'absolute', left: clampedLeft, top: clampedTop, width: boxWidth, border: `1px solid ${themeFor('channel').border}`, borderRadius: 12, background: themeFor('channel').bg, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, boxShadow: themeFor('channel').shadow, zIndex: 2, overflow: 'visible' }}
                                                onMouseDown={handleDragChannels}
                                            >
                                                {/* Header with widget name, delete and settings buttons (compact) */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, background: THEME_COLORS.default.bg, padding: '6px 8px', borderRadius: 8 }}>
                                                    <strong style={{ fontSize: 12 }}>Data Center</strong>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <button
                                                            style={{ background: thCh.border, color: thCh.text, border: 'none', borderRadius: 6, padding: '2px 3px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                                            onClick={e => { e.stopPropagation(); decreaseChannels(); }}
                                                            title="Decrease channels"
                                                        >
                                                            −
                                                        </button>
                                                        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                                                            
                                                            <span style={{ fontSize: 11, color: '#474a51ff' }}>{`CH (${channelCount})`}</span>
                                                        </div>
                                                        <button
                                                            style={{ background: thCh.border, color: thCh.text, border: 'none', borderRadius: 6, padding: '2px 3px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                                            onClick={e => { e.stopPropagation(); increaseChannels(); }}
                                                            title="Increase channels"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                        {/* Delete button removed per request */}
                                                        <button
                                                            style={{ background: thCh.border, color: thCh.text, border: 'none', borderRadius: 6, padding: '2px 3px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                                            onClick={e => { e.stopPropagation(); openSettings('channels-box'); }}
                                                            title="Settings"
                                                        >
                                                            ⚙
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Channels list: switch to 2-column compact layout when vertical space is tight */}
                                                {(() => {
                                                    const minSingleColHeight = headerHeight + channelsCount * 12 + 12; // if below this, prefer multi-column
                                                    const useTwoColumns = boxHeight < minSingleColHeight || rowHeight < 12;
                                                    if (!useTwoColumns) {
                                                        // single column — allow the box to grow with content
                                                        return (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 6, paddingBottom: 6 }}>
                                                                {channelOptions.map((opt, idx) => {
                                                                    const id = opt.id as string;
                                                                    const m = id.match(/channel-(\d+)/i);
                                                                    const n = m ? parseInt(m[1], 10) : idx + 1;
                                                                    const circleR = Math.max(2, Math.floor(rowHeight * 0.16));
                                                                    const svgSize = Math.max(10, Math.floor(circleR * 2 + 2));
                                                                    return (
                                                                        <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `3px 6px`, borderRadius: 4, height: rowHeight }}>
                                                                            <div style={{ width: svgSize, height: svgSize }} />

                                                                            <span style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 600 }}>{opt.label}</span>

                                                                            <button
                                                                                onClick={e => removeChannelAt(id, e)}
                                                                                title={`Remove ${opt.label}`}
                                                                                style={{ marginRight: 6, background: thCh.border, color: thCh.text, border: 'none', borderRadius: 4, padding: 1, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: svgSize, height: svgSize }}
                                                                            >
                                                                                <svg width="100%" height="100%" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                                                                    <line x1="4" y1="4" x2="16" y2="16" stroke={thCh.text} strokeWidth="1.6" strokeLinecap="round" />
                                                                                    <line x1="16" y1="4" x2="4" y2="16" stroke={thCh.text} strokeWidth="1.6" strokeLinecap="round" />
                                                                                </svg>
                                                                            </button>

                                                                            <svg
                                                                                data-widgetid={id}
                                                                                data-handle="output"
                                                                                width={svgSize}
                                                                                height={svgSize}
                                                                                style={{ cursor: 'crosshair', marginLeft: 0, marginRight: 0 }}
                                                                                onMouseDown={e => {
                                                                                    e.stopPropagation();
                                                                                    const center = getCircleCenter(id, 'output');
                                                                                    if (center) {
                                                                                        setDrawingConnection({ from: id, startX: center.x, startY: center.y });
                                                                                        setMousePos({ x: center.x, y: center.y });
                                                                                    } else {
                                                                                        // Fallback: compute viewport coords of the visual center, then convert to SVG-relative coords
                                                                                        try {
                                                                                            const flowSvg = document.getElementById('flowchart-arrow-svg');
                                                                                            const svgRect = getFlowContainerRect();
                                                                                            const finalLeft = (containerLeft || 0) + boxPos.left; // viewport left of the fixed box
                                                                                            const viewportX = finalLeft + boxWidth; // right edge of box as fallback
                                                                                            const viewportY = effectiveTop + headerHeight + idx * rowHeight + Math.floor(rowHeight / 2);
                                                                                            const startX = viewportX - svgRect.left;
                                                                                            const startY = viewportY - svgRect.top;
                                                                                            setDrawingConnection({ from: id, startX, startY });
                                                                                            setMousePos({ x: startX, y: startY });
                                                                                        } catch (err) {
                                                                                            const startX = boxPos.left + boxWidth;
                                                                                            const startY = effectiveTop + headerHeight + idx * rowHeight + Math.floor(rowHeight / 2);
                                                                                            setDrawingConnection({ from: id, startX, startY });
                                                                                            setMousePos({ x: startX, y: startY });
                                                                                        }
                                                                                    }
                                                                                }}
                                                                            >
                                                                                <circle cx={svgSize / 2} cy={svgSize / 2} r={circleR} fill="#fff" stroke={thCh.text} strokeWidth={1} />
                                                                            </svg>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        );
                                                    }

                                                    // two-column layout: render rows, each with up to 2 channels side-by-side
                                                    const colsLayout = 2;
                                                    const rowsLayout = Math.ceil(channelsCount / colsLayout);
                                                    return (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4, paddingBottom: 4 }}>
                                                            {Array.from({ length: rowsLayout }).map((_, rowIdx) => {
                                                                const leftIndex = rowIdx * colsLayout;
                                                                return (
                                                                    <div key={rowIdx} style={{ display: 'flex', gap: 6, alignItems: 'center', height: rowHeight }}>
                                                                        {[0, 1].map((posIdx) => {
                                                                            const option = channelOptions[leftIndex + posIdx];
                                                                            if (!option) return <div key={posIdx} style={{ flex: 1 }} />;
                                                                            const id = option.id as string;
                                                                            const m = id.match(/channel-(\d+)/i);
                                                                            const n = m ? parseInt(m[1], 10) : leftIndex + posIdx + 1;
                                                                            const circleR = Math.max(2, Math.floor(rowHeight * 0.16));
                                                                            const svgSize = Math.max(10, Math.floor(circleR * 2 + 2));
                                                                            return (
                                                                                <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 6px', borderRadius: 4, flex: 1 }}>
                                                                                    <svg
                                                                                        data-widgetid={id}
                                                                                        data-handle="input"
                                                                                        width={svgSize}
                                                                                        height={svgSize}
                                                                                        style={{ cursor: 'pointer', marginRight: 6 }}
                                                                                        onMouseUp={e => {
                                                                                            e.stopPropagation();
                                                                                            if (drawingConnection && drawingConnection.from !== id) {
                                                                                                inputHandledRef.current = true;
                                                                                                addConnection(drawingConnection.from, id);
                                                                                                setDrawingConnection(null);
                                                                                                setMousePos(null);
                                                                                                setTimeout(() => { inputHandledRef.current = false; }, 0);
                                                                                            }
                                                                                        }}
                                                                                    >
                                                                                        <circle cx={svgSize / 2} cy={svgSize / 2} r={Math.max(3, circleR)} fill="#fff" stroke={thCh.text} strokeWidth={1.2} />
                                                                                    </svg>

                                                                                    <span style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 600 }}>{option.label}</span>

                                                                                    <svg
                                                                                        data-widgetid={id}
                                                                                        data-handle="output"
                                                                                        width={svgSize}
                                                                                        height={svgSize}
                                                                                        style={{ cursor: 'crosshair', marginLeft: 6, marginRight: 0 }}
                                                                                        onMouseDown={e => {
                                                                                            e.stopPropagation();
                                                                                            const center = getCircleCenter(id, 'output');
                                                                                            if (center) {
                                                                                                setDrawingConnection({ from: id, startX: center.x, startY: center.y });
                                                                                                setMousePos({ x: center.x, y: center.y });
                                                                                            } else {
                                                                                                // approximate start positions for left/right columns; convert viewport -> svg coords
                                                                                                try {
                                                                                                    const flowSvg = document.getElementById('flowchart-arrow-svg');
                                                                                                    const svgRect = getFlowContainerRect();
                                                                                                    const finalLeft = (containerLeft || 0) + boxPos.left;
                                                                                                    const colOffset = posIdx === 0 ? 0 : boxWidth / 2;
                                                                                                    const viewportX = finalLeft + colOffset + Math.floor(boxWidth / 2);
                                                                                                    const viewportY = effectiveTop + headerHeight + rowIdx * rowHeight + Math.floor(rowHeight / 2);
                                                                                                    const startX = viewportX - svgRect.left;
                                                                                                    const startY = viewportY - svgRect.top;
                                                                                                    setDrawingConnection({ from: id, startX, startY });
                                                                                                    setMousePos({ x: startX, y: startY });
                                                                                                } catch (err) {
                                                                                                    const colOffset = posIdx === 0 ? 0 : boxWidth / 2;
                                                                                                    const startX = boxPos.left + colOffset + Math.floor(boxWidth / 2);
                                                                                                    const startY = effectiveTop + headerHeight + rowIdx * rowHeight + Math.floor(rowHeight / 2);
                                                                                                    setDrawingConnection({ from: id, startX, startY });
                                                                                                    setMousePos({ x: startX, y: startY });
                                                                                                }
                                                                                            }
                                                                                        }}
                                                                                    >
                                                                                        <circle cx={svgSize / 2} cy={svgSize / 2} r={circleR} fill="#fff" stroke={thCh.text} strokeWidth={1} />
                                                                                    </svg>
                                                                                    <button
                                                                                        onClick={e => removeChannelAt(id, e)}
                                                                                        title={`Remove ${option.label}`}
                                                                                        style={{ marginRight: 6, background: thCh.border, color: thCh.text, border: 'none', borderRadius: 4, padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: svgSize, height: svgSize }}
                                                                                    >
                                                                                        <svg width="100%" height="100%" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                                                                            <line x1="4" y1="4" x2="16" y2="16" stroke={thCh.text} strokeWidth="1.6" strokeLinecap="round" />
                                                                                            <line x1="16" y1="4" x2="4" y2="16" stroke={thCh.text} strokeWidth="1.6" strokeLinecap="round" />
                                                                                        </svg>
                                                                                    </button>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        );
                                    })() }

                                    {/* Plots aggregated box: visually mirror the Channels box but list Plot instances */}
                                    {isClient ? (() => {
                                        const boxPos = modalPositions['plots-box'] ? normalizedToPixel(modalPositions['plots-box']) : { left: 60, top: 260 };
                                        // derive plot instances from basic flowOptions
                                        const plotOptions = flowOptions.filter(o => o.type === 'basic');
                                        // If there are no plot flow options, don't render the aggregated Plots box by default
                                        if (!plotOptions || plotOptions.length === 0) return null;
                                        const plotInstances: Array<{ id: string, label: string }> = [];
                                        for (const opt of plotOptions) {
                                            const insts = (opt as any).instances || Array.from({ length: (opt.count || 1) }, (_, i) => ({ id: `${opt.id}-${i}`, label: `${opt.label} ${i}` }));
                                            for (const ins of insts) plotInstances.push({ id: ins.id, label: ins.label });
                                        }
                                        const plotsCount = plotInstances.length;
                                        const boxWidth = 220;
                                        const desiredRowHeight = 24;
                                        const headerHeight = 34;
                                        const viewportHeight = (typeof window !== 'undefined') ? window.innerHeight : 900;
                                        let containerHeight = viewportHeight;
                                        let containerTop = 0;
                                        let containerLeft = 0;
                                        try {
                                            // Measure the flow container so the Plots box is clamped to it
                                            const r = getFlowContainerRect();
                                            containerHeight = r.height || containerHeight;
                                            containerTop = r.top || 0;
                                            containerLeft = r.left || 0;
                                        } catch (err) { }
                                        const maxAllowedHeight = Math.max(160, Math.min(900, containerHeight - 24));
                                        let rowHeight = desiredRowHeight;
                                        const desiredHeight = headerHeight + plotsCount * rowHeight + 12;
                                        if (desiredHeight > maxAllowedHeight) {
                                            rowHeight = Math.max(10, Math.floor((maxAllowedHeight - headerHeight - 12) / Math.max(1, plotsCount)));
                                        }
                                        const boxHeight = headerHeight + plotsCount * rowHeight + 12;
                                        let effectiveTop = boxPos.top;

                                        const handleDragPlots = (e: React.MouseEvent<HTMLDivElement>) => {
                                            e.preventDefault();
                                            const startX = e.clientX;
                                            const startY = e.clientY;
                                            const origLeft = boxPos.left;
                                            const origTop = boxPos.top;
                                            const onMouseMove = (moveEvent: MouseEvent) => {
                                                const dx = moveEvent.clientX - startX;
                                                const dy = moveEvent.clientY - startY;
                                                const s = flowScale || 1;
                                                const newLeft = Math.round((origLeft + dx / s) / 10) * 10;
                                                const newTop = Math.round((origTop + dy / s) / 10) * 10;
                                                // Clamp to flow container so plots box can't be dragged outside
                                                try {
                                                    const clamped = clampToFlowBounds(newLeft, newTop, boxWidth, finalBoxHeight);
                                                    setModalPositions(pos => ({ ...pos, ['plots-box']: pixelToNormalized(clamped.left, clamped.top) }));
                                                } catch (err) {
                                                    setModalPositions(pos => ({ ...pos, ['plots-box']: pixelToNormalized(newLeft, newTop) }));
                                                }
                                            };
                                            const onMouseUp = () => {
                                                window.removeEventListener('mousemove', onMouseMove);
                                                window.removeEventListener('mouseup', onMouseUp);
                                            };
                                            window.addEventListener('mousemove', onMouseMove);
                                            window.addEventListener('mouseup', onMouseUp);
                                        };

                                        // layout computations for multi-column similar to channels
                                        const MIN_ROW_HEIGHT = 12;
                                        const preferredRowHeight = desiredRowHeight;
                                        const maxRowsByHeight = Math.max(1, Math.floor((maxAllowedHeight - headerHeight - 12) / MIN_ROW_HEIGHT));
                                        const fitsSingleAtPreferred = (headerHeight + plotsCount * preferredRowHeight + 12) <= maxAllowedHeight;
                                        let colsLayout = 1;
                                        if (!fitsSingleAtPreferred) {
                                            colsLayout = Math.max(1, Math.min(4, Math.ceil(plotsCount / maxRowsByHeight)));
                                        }
                                        const rowsNeeded = Math.ceil(plotsCount / colsLayout);
                                        let finalRowHeight = Math.floor((maxAllowedHeight - headerHeight - 12) / rowsNeeded);
                                        finalRowHeight = Math.max(MIN_ROW_HEIGHT, Math.min(preferredRowHeight, finalRowHeight));
                                        const finalBoxHeight = headerHeight + rowsNeeded * finalRowHeight + 12;
                                        effectiveTop = Math.max(8, Math.min(boxPos.top, Math.max(8, containerTop + containerHeight - finalBoxHeight - 8)));

                                        let containerWidth = 1200;
                                        try {
                                            const r = getFlowContainerRect();
                                            containerWidth = r.width || containerWidth;
                                        } catch (err) { }

                                        const clampedLeft = Math.max(0, Math.min(boxPos.left, Math.floor(containerWidth - boxWidth)));
                                        const clampedTop = Math.max(0, Math.min(boxPos.top, Math.floor(containerHeight - finalBoxHeight)));

                                        const plotContentMax = Math.max(40, finalBoxHeight - headerHeight - 18);
                                        const pth = themeFor('basic');
                                        return (
                                            <div
                                                key="plots-box"
                                                style={{ position: 'absolute', left: clampedLeft, top: clampedTop, width: boxWidth, border: `1px solid ${pth.border}`, borderRadius: 12, background: pth.bg, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, boxShadow: pth.shadow, zIndex: 2, overflow: 'visible' }}
                                                onMouseDown={handleDragPlots}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, background: THEME_COLORS.default.bg, padding: '6px 8px', borderRadius: 8 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <button
                                                            style={{ background: pth.border, color: pth.text, border: 'none', borderRadius: 6, padding: '2px 3px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                                            onClick={e => { e.stopPropagation(); decreasePlots(); }}
                                                            title="Decrease plots"
                                                        >
                                                            −
                                                        </button>
                                                        <strong style={{ fontSize: 11 }}>Plots ({plotsCount})</strong>
                                                        <button
                                                            style={{ background: pth.border, color: pth.text, border: 'none', borderRadius: 6, padding: '2px 3px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                                            onClick={e => { e.stopPropagation(); increasePlots(); }}
                                                            title="Increase plots"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                        <button
                                                            style={{ background: pth.border, color: pth.text, border: 'none', borderRadius: 6, padding: '2px', cursor: 'pointer', fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                            onClick={e => { e.stopPropagation(); handleRemovePlots(); }}
                                                            title="Delete Plots"
                                                        >
                                                            <svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6z" fill="currentColor" /><path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor" /></svg>
                                                        </button>
                                                        <button
                                                            style={{ background: pth.border, color: pth.text, border: 'none', borderRadius: 6, padding: '2px 3px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                                            onClick={e => { e.stopPropagation(); openSettings('plots-box'); }}
                                                            title="Settings"
                                                        >
                                                            ⚙
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Plot instances list: switch to multi-column when needed */}
                                                {(() => {
                                                    const minSingleColHeight = headerHeight + plotsCount * 12 + 12;
                                                    const useTwoColumns = boxHeight < minSingleColHeight || rowHeight < 12;
                                                    if (!useTwoColumns) {
                                                        return (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4, paddingBottom: 4 }}>
                                                                {plotInstances.map((ins, idx) => {
                                                                    const circleR = Math.max(2, Math.floor(rowHeight * 0.16));
                                                                    const svgSize = Math.max(10, Math.floor(circleR * 2 + 2));
                                                                    const id = ins.id;
                                                                    return (
                                                                        <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `3px 6px`, borderRadius: 4, height: rowHeight }}>
                                                                            {/* Input handle: accept a connection into this plot instance */}
                                                                            <svg
                                                                                data-widgetid={id}
                                                                                data-handle="input"
                                                                                width={svgSize}
                                                                                height={svgSize}
                                                                                style={{ cursor: 'pointer', marginRight: 6 }}
                                                                                onMouseUp={e => {
                                                                                    e.stopPropagation();
                                                                                    if (drawingConnection && drawingConnection.from !== id) {
                                                                                        inputHandledRef.current = true;
                                                                                        addConnection(drawingConnection.from, id);
                                                                                        setDrawingConnection(null);
                                                                                        setMousePos(null);
                                                                                        setTimeout(() => { inputHandledRef.current = false; }, 0);
                                                                                    }
                                                                                }}
                                                                            >
                                                                                <circle cx={svgSize / 2} cy={svgSize / 2} r={Math.max(3, circleR)} fill="#fff" stroke={pth.text} strokeWidth={1.2} />
                                                                            </svg>
                                                                            <span style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 600 }}>{ins.label}</span>
                                                                            {
                                                                                (() => {
                                                                                    const canRemove = plotsCount > 1;
                                                                                    return (
                                                                                        <button
                                                                                            onClick={e => { e.stopPropagation(); if (!canRemove) return; removeBasicInstance(ins.id.split('-').slice(0, 2).join('-'), ins.id); }}
                                                                                            title={canRemove ? `Remove ${ins.label}` : 'Cannot remove last plot'}
                                                                                            disabled={!canRemove}
                                                                                            style={{ marginRight: 6, background: pth.border, color: pth.text, border: 'none', borderRadius: 4, padding: 0, cursor: canRemove ? 'pointer' : 'not-allowed', opacity: canRemove ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: svgSize, height: svgSize }}
                                                                                        >
                                                                                            <svg width="100%" height="100%" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                                                                                <line x1="4" y1="4" x2="16" y2="16" stroke={pth.text} strokeWidth="1.6" strokeLinecap="round" />
                                                                                                <line x1="16" y1="4" x2="4" y2="16" stroke={pth.text} strokeWidth="1.6" strokeLinecap="round" />
                                                                                            </svg>
                                                                                        </button>
                                                                                    );
                                                                                })()
                                                                            }
                                                                            <svg
                                                                                data-widgetid={id}
                                                                                data-handle="output"
                                                                                width={svgSize}
                                                                                height={svgSize}
                                                                                style={{ cursor: 'crosshair', marginLeft: 0, marginRight: 0 }}
                                                                                onMouseDown={e => {
                                                                                    e.stopPropagation();
                                                                                    const center = getCircleCenter(id, 'output');
                                                                                    if (center) {
                                                                                        setDrawingConnection({ from: id, startX: center.x, startY: center.y });
                                                                                        setMousePos({ x: center.x, y: center.y });
                                                                                    } else {
                                                                                        try {
                                                                                            const flowSvg = document.getElementById('flowchart-arrow-svg');
                                                                                            const svgRect = getFlowContainerRect();
                                                                                            const finalLeft = (containerLeft || 0) + boxPos.left;
                                                                                            const viewportX = finalLeft + boxWidth;
                                                                                            const viewportY = effectiveTop + headerHeight + idx * rowHeight + Math.floor(rowHeight / 2);
                                                                                            const startX = viewportX - svgRect.left;
                                                                                            const startY = viewportY - svgRect.top;
                                                                                            setDrawingConnection({ from: id, startX, startY });
                                                                                            setMousePos({ x: startX, y: startY });
                                                                                        } catch (err) {
                                                                                            const startX = boxPos.left + boxWidth;
                                                                                            const startY = effectiveTop + headerHeight + idx * rowHeight + Math.floor(rowHeight / 2);
                                                                                            setDrawingConnection({ from: id, startX, startY });
                                                                                            setMousePos({ x: startX, y: startY });
                                                                                        }
                                                                                    }
                                                                                }}
                                                                            >
                                                                                <circle cx={svgSize / 2} cy={svgSize / 2} r={circleR} fill="#fff" stroke={pth.text} strokeWidth={1} />
                                                                            </svg>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        );
                                                    }

                                                    // two-column layout
                                                    const cols = 2;
                                                    const rowsLayout = Math.ceil(plotsCount / cols);
                                                    return (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4, paddingBottom: 4 }}>
                                                            {Array.from({ length: rowsLayout }).map((_, rowIdx) => {
                                                                const leftIndex = rowIdx * cols;
                                                                return (
                                                                    <div key={rowIdx} style={{ display: 'flex', gap: 6, alignItems: 'center', height: finalRowHeight }}>
                                                                        {[0, 1].map((posIdx) => {
                                                                            const option = plotInstances[leftIndex + posIdx];
                                                                            if (!option) return <div key={posIdx} style={{ flex: 1 }} />;
                                                                            const id = option.id;
                                                                            const circleR = Math.max(2, Math.floor(finalRowHeight * 0.16));
                                                                            const svgSize = Math.max(10, Math.floor(circleR * 2 + 2));
                                                                            return (
                                                                                <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 6px', borderRadius: 4, flex: 1 }}>
                                                                                    <div style={{ width: svgSize, height: svgSize }} />
                                                                                    <span style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 600 }}>{option.label}</span>
                                                                                    <svg
                                                                                        data-widgetid={id}
                                                                                        data-handle="output"
                                                                                        width={svgSize}
                                                                                        height={svgSize}
                                                                                        style={{ cursor: 'crosshair', marginLeft: 6, marginRight: 0 }}
                                                                                        onMouseDown={e => {
                                                                                            e.stopPropagation();
                                                                                            const center = getCircleCenter(id, 'output');
                                                                                            if (center) {
                                                                                                setDrawingConnection({ from: id, startX: center.x, startY: center.y });
                                                                                                setMousePos({ x: center.x, y: center.y });
                                                                                            } else {
                                                                                                try {
                                                                                                    const flowSvg = document.getElementById('flowchart-arrow-svg');
                                                                                                    const svgRect = getFlowContainerRect();
                                                                                                    const finalLeft = (containerLeft || 0) + boxPos.left;
                                                                                                    const colOffset = posIdx === 0 ? 0 : boxWidth / 2;
                                                                                                    const viewportX = finalLeft + colOffset + Math.floor(boxWidth / 2);
                                                                                                    const viewportY = effectiveTop + headerHeight + rowIdx * finalRowHeight + Math.floor(finalRowHeight / 2);
                                                                                                    const startX = viewportX - svgRect.left;
                                                                                                    const startY = viewportY - svgRect.top;
                                                                                                    setDrawingConnection({ from: id, startX, startY });
                                                                                                    setMousePos({ x: startX, y: startY });
                                                                                                } catch (err) {
                                                                                                    const colOffset = posIdx === 0 ? 0 : boxWidth / 2;
                                                                                                    const startX = boxPos.left + colOffset + Math.floor(boxWidth / 2);
                                                                                                    const startY = effectiveTop + headerHeight + rowIdx * finalRowHeight + Math.floor(finalRowHeight / 2);
                                                                                                    setDrawingConnection({ from: id, startX, startY });
                                                                                                    setMousePos({ x: startX, y: startY });
                                                                                                }
                                                                                            }
                                                                                        }}
                                                                                    >
                                                                                        <circle cx={svgSize / 2} cy={svgSize / 2} r={circleR} fill="#fff" stroke="#2563eb" strokeWidth={1} />
                                                                                    </svg>
                                                                                    <button
                                                                                        onClick={e => { e.stopPropagation(); removeBasicInstance(id.split('-').slice(0, 2).join('-'), id); }}
                                                                                        title={`Remove ${option.label}`}
                                                                                        style={{ marginRight: 6, background: themeFor('basic').border, color: themeFor('basic').text, border: 'none', borderRadius: 4, padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: svgSize, height: svgSize }}
                                                                                    >
                                                                                        <svg width="100%" height="100%" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                                                                            <line x1="4" y1="4" x2="16" y2="16" stroke={themeFor('basic').text} strokeWidth="1.6" strokeLinecap="round" />
                                                                                            <line x1="16" y1="4" x2="4" y2="16" stroke={themeFor('basic').text} strokeWidth="1.6" strokeLinecap="round" />
                                                                                        </svg>
                                                                                    </button>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        );
                                    })() : (
                                        <div style={{ width: '100%', display: 'block', minHeight: 200 }} />
                                    )}
                                    </div>
                                ) : (
                                    <div style={{ width: '100%', display: 'block', minHeight: 500 }} />
                                )}

                                {/* Live arrow while dragging connection */}
                                {drawingConnection && mousePos && (() => {
                                    const fromCol = colorForId(drawingConnection.from as string);
                                    return (
                                        <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10000 }}>
                                            <path
                                                d={`M ${drawingConnection.startX} ${drawingConnection.startY} L ${mousePos.x} ${mousePos.y}`}
                                                stroke={colorForIdLight(drawingConnection.from as string)}
                                                strokeWidth={2.5}
                                                fill="none"
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                    );
                                })()}
                                {/* Render all manual connections as arrows (client-only to avoid SSR/CSR mismatch) */}
                                {isClient && (
                                        <svg id="flowchart-arrow-svg" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9999 }}>
                                        <defs />
                                        {connections.map(({ from, to }, idx) => {
                                        // Get exact circle centers when possible
                                        const fromCenter = getCircleCenter(from, 'output');
                                        const toCenter = getCircleCenter(to, 'input');

                                        // Fallback to modalPositions-based calculation
                                        let startX: number, startY: number, endX: number, endY: number;

                                        const fromPos = modalPositions[from] ? normalizedToPixel(modalPositions[from]) : undefined;
                                        const toPos = modalPositions[to] ? normalizedToPixel(modalPositions[to]) : undefined;

                                        // If we don't have either a DOM center or a modal position for either end, skip drawing
                                        if (!fromCenter && !fromPos) return null;
                                        if (!toCenter && !toPos) return null;

                                        if (fromCenter) {
                                            startX = fromCenter.x;
                                            startY = fromCenter.y;
                                        } else {
                                            const fromWidgetType = (from.startsWith('channel') ? 0 : from.startsWith('spider') ? 1 : from.startsWith('fft') ? 2 : 3);
                                            const fromWidth = fromWidgetType === 3 ? 220 : 180;
                                            startX = (fromPos as { left: number, top: number }).left + fromWidth;
                                            startY = (fromPos as { left: number, top: number }).top + 35;
                                        }
                                        if (toCenter) {
                                            endX = toCenter.x;
                                            endY = toCenter.y;
                                        } else {
                                            endX = (toPos as { left: number, top: number }).left + 7;
                                            endY = (toPos as { left: number, top: number }).top + 35;
                                        }
                                        // Build obstacle boxes from modalPositions for routing (convert normalized -> pixels)
                                        const obstacles: Array<{ left: number, top: number, right: number, bottom: number, id?: string }> = [];
                                        Object.keys(modalPositions).forEach(k => {
                                            const pnorm = modalPositions[k];
                                            const p = pnorm ? normalizedToPixel(pnorm) : { left: 0, top: 0 };
                                            // approximate modal widget sizes used in layout (match earlier logic)
                                            const widgetType = k.startsWith('channel') ? 'channel' : k.startsWith('spider') ? 'spiderplot' : k.startsWith('fft') ? 'fft' : 'bandpower';
                                            const w = (widgetType === 'bandpower') ? 220 : 180;
                                            const h = (widgetType === 'channel') ? 56 : 70;
                                            obstacles.push({ left: p.left, top: p.top, right: p.left + w, bottom: p.top + h, id: k });
                                        });

                                        // Convert to simple obstacle list
                                        const plainObstacles = obstacles.map(o => ({ left: o.left, top: o.top, right: o.right, bottom: o.bottom }));

                                        // If both endpoints are inside same box just draw simple line
                                        let path = `M ${startX} ${startY} L ${endX} ${endY}`;
                                        try {
                                            path = computeAvoidingPath(startX, startY, endX, endY, plainObstacles, [from, to]);
                                        } catch (err) { /* fallback to straight line */ }

                                        const isSelected = selectedConnectionIndex === idx;
                                        const gradId = `connGrad-${idx}`;
                                        return (
                                            // Render a slightly thicker invisible hit-area path to improve click/tap reliability,
                                            // and attach the click handler to it. The visible path keeps the gradient stroke.
                                            <g key={`conn-g-${idx}`}>
                                                <path
                                                    // hit area
                                                    d={path}
                                                    strokeOpacity={0}
                                                    strokeWidth={Math.max(12, isSelected ? 14 : 12)}
                                                    fill="none"
                                                    strokeLinecap="round"
                                                    pointerEvents="stroke"
                                                    onClick={e => {
                                                        try { e.stopPropagation(); } catch (err) { }
                                                        setSelectedConnectionIndex(idx);
                                                    }}
                                                />
                                                <path
                                                    // visible path - use a lighter solid color instead of gradient
                                                    d={path}
                                                    stroke={isSelected ? '#ef4444' : colorForIdLight(from as string)}
                                                    strokeWidth={isSelected ? 3.5 : 2}
                                                    fill="none"
                                                    strokeLinecap="round"
                                                    style={{ cursor: 'pointer', pointerEvents: 'none' }}
                                                />
                                            </g>
                                        );
                                    })}
                                    </svg>
                                )}

                                {/* Click-to-select arrows and keyboard delete handler */}
                                {/**
                                 * We attach a global click listener to detect clicks near arrows
                                 * (so we don't need to change SVG pointer-events which would
                                 * block underlying interactions). If the click is within a
                                 * small threshold of any connection line, select that connection.
                                 */}
                                {
                                    /* Register listeners via effect below */
                                }

                                {/* Inline Make Connection box removed — use the toolbar 'Make Connection' button instead */}
                                {/* Render flow options (except channel entries; those are inside the Channels box) */}
                                {isClient ? flowOptions.map((opt, idx) => {
                                    // Channels are rendered inside the Channels box; basic/Plot instances
                                    // are rendered only inside the aggregated Plots box to avoid
                                    // duplicate UI. Skip rendering individual `basic` option boxes
                                    // here so the plots-box is the single source of truth.
                                    if (opt.id.startsWith('channel-') || opt.type === 'basic') return null;
                                    const widgetId = opt.id;
                                    const defaultLeft = 200 + (idx % 3) * 220;
                                    const defaultTop = 100 + Math.floor(idx / 3) * 120;
                                    const widgetPos = modalPositions[widgetId] ? normalizedToPixel(modalPositions[widgetId]) : { left: defaultLeft, top: defaultTop };
                                    const widgetLeft = widgetPos.left;
                                    const widgetTop = widgetPos.top;
                                    const instancesList = (opt as any).instances || Array.from({ length: (opt.count || 1) }, (_, i) => ({ id: `${opt.id}-${i}`, label: `${opt.label} ${i}` }));
                                    // Make Plot boxes larger in the flow modal so input/output handles fit inside
                                    const widgetWidth = opt.type === 'bandpower' ? 220 : (opt.type === 'basic' ? 240 : 180);
                                    // Make Plot boxes grow vertically as instances are added so handles remain visible
                                    const widgetHeight = opt.type === 'basic' ? Math.max(90, 36 + instancesList.length * 28) : 70;

                                    const handleDrag = (e: React.MouseEvent<HTMLDivElement>) => {
                                        if (showConnectionModal) return; // Disable drag when modal is open
                                        e.preventDefault();
                                        const startX = e.clientX;
                                        const startY = e.clientY;
                                        const origLeft = widgetLeft;
                                        const origTop = widgetTop;
                                        const onMouseMove = (moveEvent: MouseEvent) => {
                                            const dx = moveEvent.clientX - startX;
                                            const dy = moveEvent.clientY - startY;
                                            const s = flowScale || 1;
                                            // Convert screen pixel delta into unscaled modal coords
                                            const newLeft = Math.round((origLeft + dx / s) / 10) * 10;
                                            const newTop = Math.round((origTop + dy / s) / 10) * 10;
                                            // Clamp to flow container so widget can't be dragged outside
                                            try {
                                                        const clamped = clampToFlowBounds(newLeft, newTop, widgetWidth, widgetHeight);
                                                        setModalPositions(pos => ({ ...pos, [widgetId]: pixelToNormalized(clamped.left, clamped.top) }));
                                            } catch (err) {
                                                setModalPositions(pos => ({ ...pos, [widgetId]: pixelToNormalized(newLeft, newTop) }));
                                            }
                                        };
                                        const onMouseUp = () => {
                                            window.removeEventListener('mousemove', onMouseMove);
                                            window.removeEventListener('mouseup', onMouseUp);
                                        };
                                        window.addEventListener('mousemove', onMouseMove);
                                        window.addEventListener('mouseup', onMouseUp);
                                    };

                                    const th = themeFor(opt.type);
                                    return (
                                        <div
                                            key={widgetId}
                                            style={{ position: 'absolute', left: widgetLeft, top: widgetTop, width: widgetWidth, height: widgetHeight, border: `1px solid ${th.border}`, borderRadius: 12, background: th.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: 12, color: th.text, zIndex: showConnectionModal || settingsModal.show ? 0 : 2, boxShadow: th.shadow, transition: 'box-shadow 0.2s', gap: 8, wordBreak: 'break-word', overflowWrap: 'break-word', textAlign: 'center', cursor: showConnectionModal || settingsModal.show ? 'default' : 'move', pointerEvents: showConnectionModal || settingsModal.show ? 'none' : 'auto' }}
                                            onMouseDown={handleDrag}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%', position: 'relative', justifyContent: 'space-between' }}>
                                                {/* Left area: for basic (Plot) show a decrement button, otherwise show input handle */}
                                                <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingLeft: 6 }}>
                                                    {opt.type === 'basic' ? (
                                                        <button
                                                            title="Remove last instance"
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                const insts = (opt as any).instances;
                                                                if (insts && insts.length > 0) {
                                                                    const lastId = insts[insts.length - 1].id;
                                                                    removeBasicInstance(opt.id, lastId);
                                                                } else {
                                                                    const cur = Math.max(1, (opt.count || 1) - 1);
                                                                    const removedId = `${opt.id}-${(opt.count || 1)}`;
                                                                    setFlowOptions(prev => prev.map(o => o.id === opt.id ? { ...o, count: cur } : o));
                                                                    setConnections(prev => prev.filter(c => c.from !== removedId && c.to !== removedId));
                                                                    setModalPositions(prev => { const copy = { ...prev }; if (copy[removedId]) delete copy[removedId]; return copy; });
                                                                }
                                                            }}
                                                            style={{ background: th.border, color: th.text, border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}
                                                        >
                                                            −
                                                        </button>
                                                    ) : (
                                                        <svg
                                                            data-widgetid={widgetId}
                                                            data-handle="input"
                                                            style={{ marginLeft: 0, marginRight: 8, zIndex: 100 }}
                                                            width={14}
                                                            height={14}
                                                            onMouseUp={e => {
                                                                e.stopPropagation();
                                                                    if (drawingConnection && drawingConnection.from !== widgetId) {
                                                                    inputHandledRef.current = true;
                                                                    addConnection(drawingConnection.from, widgetId);
                                                                    setDrawingConnection(null);
                                                                    setMousePos(null);
                                                                    setTimeout(() => { inputHandledRef.current = false; }, 0);
                                                                }
                                                            }}
                                                        >
                                                            <circle cx={7} cy={7} r={2.5} fill="#fff" stroke={th.text} strokeWidth={1.1} style={{ cursor: 'pointer' }} />
                                                        </svg>
                                                    )}
                                                </div>

                                                {/* Center area: title and add button for basic */}
                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                                                            <div>{opt.label}</div>
                                                            {opt.type === 'basic' && (
                                                                <>
                                                                    <button
                                                                        title="Add instance"
                                                                        onClick={e => { e.stopPropagation(); addBasicInstance(opt.id); }}
                                                                        style={{ background: '#10B981', color: 'white', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}
                                                                    >
                                                                        +
                                                                    </button>
                                                                    <div style={{ minWidth: 28, textAlign: 'center', fontSize: 11, fontWeight: 700 }}>{instancesList.length}</div>
                                                                </>
                                                            )}
                                                        </div>

                                                        {opt.type === 'envelope' && (
                                                            <div style={{ width: '100%', marginTop: 6 }}>
                                                                {/* Envelope transform UI subscribes to direct upstream sources (connections.to === opt.id) */}
                                                                <Envelope id={opt.id} incomingConnections={connections.filter(c => c.to === opt.id).map(c => c.from)} />
                                                            </div>
                                                        )}

                                                        {opt.type === 'basic' && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                                                                {instancesList.map((ins: any, idx: number) => (
                                                                    <div key={ins.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                                                        {/* Input circle for connecting a channel into this instance */}
                                                                        <svg
                                                                            data-widgetid={ins.id}
                                                                            data-handle="input"
                                                                            width={18}
                                                                            height={18}
                                                                            style={{ cursor: 'pointer' }}
                                                                            onMouseUp={e => {
                                                                                e.stopPropagation();
                                                                                    if (drawingConnection && drawingConnection.from !== ins.id) {
                                                                                    inputHandledRef.current = true;
                                                                                    addConnection(drawingConnection.from, ins.id);
                                                                                    setDrawingConnection(null);
                                                                                    setMousePos(null);
                                                                                    setTimeout(() => { inputHandledRef.current = false; }, 0);
                                                                                }
                                                                            }}
                                                                        >
                                                                            <circle cx={9} cy={9} r={4} fill="#fff" stroke="#10B981" strokeWidth={1.2} />
                                                                        </svg>

                                                                        <div style={{ fontSize: 11, fontWeight: 600, minWidth: 80, textAlign: 'center' }}>{ins.label}</div>

                                                                        <button
                                                                            onClick={e => { e.stopPropagation(); removeBasicInstance(opt.id, ins.id); }}
                                                                            title={`Remove ${ins.label}`}
                                                                            style={{ background: themeFor(opt.type).border, color: themeFor(opt.type).text, border: 'none', borderRadius: 4, padding: '0px 6px', cursor: 'pointer', fontWeight: 600, fontSize: 10, lineHeight: '16px', height: 18, minWidth: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                        >
                                                                            ×
                                                                        </button>

                                                                        {/* Output circle used to start a connection from this instance */}
                                                                        <svg
                                                                            data-widgetid={ins.id}
                                                                            data-handle="output"
                                                                            width={18}
                                                                            height={18}
                                                                            style={{ cursor: 'crosshair' }}
                                                                            onMouseDown={e => {
                                                                                e.stopPropagation();
                                                                                const center = getCircleCenter(ins.id, 'output');
                                                                                if (center) {
                                                                                    setDrawingConnection({ from: ins.id, startX: center.x, startY: center.y });
                                                                                    setMousePos({ x: center.x, y: center.y });
                                                                                } else {
                                                                                    const startX = widgetLeft + widgetWidth;
                                                                                    const startY = widgetTop + 24 + idx * 28;
                                                                                    setDrawingConnection({ from: ins.id, startX, startY });
                                                                                    setMousePos({ x: startX, y: startY });
                                                                                }
                                                                            }}
                                                                        >
                                                                            <circle cx={9} cy={9} r={3.5} fill="#fff" stroke="#2563eb" strokeWidth={1.1} />
                                                                        </svg>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Right area: Delete and Settings */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <button
                                                        style={{ background: themeFor(opt.type).border, color: themeFor(opt.type).text, border: 'none', borderRadius: 6,  cursor: showConnectionModal || settingsModal.show ? 'default' : 'pointer', fontWeight: 600, fontSize: 11, lineHeight: '18px', height: 22, width: 22, minWidth: 22, padding: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', pointerEvents: showConnectionModal || settingsModal.show ? 'none' : 'auto' }}
                                                        onClick={() => {
                                                            if (showConnectionModal || settingsModal.show) return;
                                                            handleRemoveWidget(opt.id);
                                                            setFlowOptions(prev => prev.filter(o => o.id !== opt.id));
                                                        }}
                                                        title={`Delete ${opt.label}`}
                                                    >
                                                        <svg width="100%" height="100%" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <line x1="5" y1="5" x2="15" y2="15" stroke={themeFor(opt.type).text} strokeWidth="1.6" strokeLinecap="round" />
                                                            <line x1="15" y1="5" x2="5" y2="15" stroke={themeFor(opt.type).text} strokeWidth="1.6" strokeLinecap="round" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        style={{ background: themeFor(opt.type).border, color: themeFor(opt.type).text, border: 'none', borderRadius: 8,  cursor: 'pointer', fontWeight: 600, fontSize: 12, boxShadow: themeFor(opt.type).shadow, pointerEvents: 'auto', zIndex: 100002, height: 22, width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2 }}
                                                        title="Settings"
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            openSettings(widgetId);
                                                        }}
                                                    >
                                                        <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Settings">
                                                            <path d="M19.14 12.94a7.49 7.49 0 000-1.88l2.03-1.58a0.5 0.5 0 00.12-0.64l-1.92-3.32a0.5 0.5 0 00-0.6-0.22l-2.39 0.96a7.37 7.37 0 00-1.6-0.93l-0.36-2.54A0.5 0.5 0 0013.89 2h-3.78a0.5 0.5 0 00-0.49 0.42l-0.36 2.54c-0.57 0.22-1.1 0.5-1.6 0.93l-2.39-0.96a0.5 0.5 0 00-0.6 0.22L2.71 9.84a0.5 0.5 0 00.12 0.64L4.86 12a7.49 7.49 0 000 1.88L2.83 15.46a0.5 0.5 0 00-0.12 0.64l1.92 3.32a0.5 0.5 0 00.6 0.22l2.39-0.96c0.5 0.43 1.03 0.8 1.6 1.03l0.36 2.54c0.06 0.27 0.28 0.42 0.49 0.42h3.78c0.22 0 0.43-0.15 0.49-0.42l0.36-2.54c0.57-0.23 1.1-0.6 1.6-1.03l2.39 0.96a0.5 0.5 0 00.6-0.22l1.92-3.32a0.5 0.5 0 00-0.12-0.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1112 8.5a3.5 3.5 0 010 7z" fill={themeFor(opt.type).text} />
                                                        </svg>
                                                    </button>

                                                    {opt.type !== 'basic' && (
                                                        <svg style={{ marginLeft: 10, marginRight: 0, zIndex: 100 }} width={16} height={16}>
                                                            <svg
                                                                data-widgetid={widgetId}
                                                                data-handle="output"
                                                                style={{ cursor: 'crosshair', marginLeft: 0, marginRight: 0, zIndex: 100 }}
                                                                width={opt.type === 'basic' ? 22 : 16}
                                                                height={opt.type === 'basic' ? 22 : 16}
                                                                onMouseDown={e => {
                                                                    e.stopPropagation();
                                                                    const center = getCircleCenter(widgetId, 'output');
                                                                    if (center) {
                                                                        setDrawingConnection({ from: widgetId, startX: center.x, startY: center.y });
                                                                        setMousePos({ x: center.x, y: center.y });
                                                                    } else {
                                                                        const startX = widgetLeft + widgetWidth;
                                                                        const startY = widgetTop + widgetHeight / 2;
                                                                        setDrawingConnection({ from: widgetId, startX, startY });
                                                                        setMousePos({ x: startX, y: startY });
                                                                    }
                                                                }}>
                                                                <circle cx={(opt.type === 'basic' ? 22 : 16) / 2} cy={(opt.type === 'basic' ? 22 : 16) / 2} r={opt.type === 'basic' ? 4.5 : 3.5} fill="#fff" stroke="#2563eb" strokeWidth={1.2} />
                                                            </svg>
                                                            <div
                                                                // For Plot widgets keep the input handle inside the box, otherwise keep the existing slight overlap
                                                                style={{ position: 'absolute', left: opt.type === 'basic' ? 10 : -8, top: '50%', transform: 'translateY(-50%)', zIndex: 100, width: opt.type === 'basic' ? 22 : 16, height: opt.type === 'basic' ? 22 : 16, cursor: drawingConnection ? 'pointer' : 'default' }}
                                                                data-widgetid={widgetId}
                                                                data-handle="input"
                                                                onMouseUp={e => {
                                                                    e.stopPropagation();
                                                                        if (drawingConnection && drawingConnection.from !== widgetId) {
                                                                            inputHandledRef.current = true;
                                                                            addConnection(drawingConnection.from, widgetId);
                                                                            setDrawingConnection(null);
                                                                            setMousePos(null);
                                                                            setTimeout(() => { inputHandledRef.current = false; }, 0);
                                                                        }
                                                                }}
                                                            >
                                                                <svg width={opt.type === 'basic' ? 22 : 16} height={opt.type === 'basic' ? 22 : 16}>
                                                                    <circle cx={(opt.type === 'basic' ? 22 : 16) / 2} cy={(opt.type === 'basic' ? 22 : 16) / 2} r={opt.type === 'basic' ? 4.5 : 3.5} fill="#fff" stroke="#2563eb" strokeWidth={1.2} />
                                                                </svg>
                                                            </div>
                                                        </svg>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }) : null}
                            </div>
                        </div>

                </FlowModule>
                )}
            {!showFlowModal && (
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center', boxSizing: 'border-box', minHeight: `calc(100vh )` }}>
                {/* Centered grid container sized to whole grid in pixels so cells are never cut */}
                <div style={{ position: 'relative', width: (gridSettings.cols || 24) * (gridSettings.cellWidth || 50), height: (gridSettings.rows || 16) * (gridSettings.cellHeight || 50), overflow: 'hidden' }}>
                    {GridLines}

                    {/* dashboard arrows removed: connections still render inside the flow modal only */}

                    {/* Render all widgets positioned by grid pixels inside the sized container */}
                    {(() => {
                        // Helper to expand incoming connections so that if a widget
                        // receives input from a filter node (filter-...), we expose
                        // the original channel-* sources that feed that filter. This
                        // ensures dashboard Plot widgets see channel-IDs even when
                        // a filter node is placed in the path (channel -> filter -> plot).
                        const getUpstreamSources = (wId: string) => {
                            // Direct connections to this dashboard widget id.
                            // Better match connection targets to widget instances:
                            // - accept exact matches (c.to === wId)
                            // - accept connections created against a flow-option id
                            //   (e.g. c.to === 'bandpower-abc') when the widget id
                            //   begins with that option id (e.g. 'bandpower-abc-0')
                            // - accept connections targeting the base palette id
                            //   (e.g. 'bandpower') as a final fallback
                            const baseTarget = String(wId || '').split('-')[0];
                            const direct = connections.filter(c => {
                                try {
                                    const to = String(c.to || '');
                                    if (!to) return false;
                                    if (to === wId) return true; // exact
                                    if (String(wId || '').startsWith(to)) return true; // connection to flow-option id
                                    if (to === baseTarget) return true; // user connected to palette base
                                } catch (err) { }
                                return false;
                            }).map(c => c.from);
                            const expanded: string[] = [];

                            // Expand direct sources: inline channels, unwrap filters -> channels, and keep other ids
                            for (const src of direct) {
                                try {
                                    const s = String(src);
                                    if (s.startsWith('channel-')) {
                                        if (!expanded.includes(s)) expanded.push(s);
                                    } else if (s.startsWith('filter-')) {
                                        // find channels that feed this filter
                                        const feeders = connections.filter(c => c.to === s && String(c.from).startsWith('channel-')).map(c => c.from);
                                        for (const f of feeders) if (!expanded.includes(String(f))) expanded.push(String(f));
                                    } else {
                                        // include other non-channel sources as-is (they will be ignored by plots)
                                        if (!expanded.includes(s)) expanded.push(s);
                                    }
                                } catch (err) { /* ignore */ }
                            }

                            // --- Auto-mapping for FFT dashboard widgets ---
                            // Some users wire the flowchart 'fft' node (e.g. id 'fft-...') to channels
                            // but the dashboard widget instance has a different id (e.g. 'widget-FFTGraph-...').
                            // To make dashboard FFT widgets receive channel-* inputs even when the
                            // flow connection targets a flow-node id, scan flowOptions for fft nodes
                            // and collect their channel feeders here when this is an FFTGraph widget.
                            try {
                                const targetWidget = widgets.find(w => w.id === wId);
                                if (targetWidget && targetWidget.type === 'FFTGraph') {
                                    // gather all flow-node ids that represent FFT nodes
                                    const fftNodeIds = (flowOptions || []).filter((o: any) => {
                                        return String(o.type || '').toLowerCase() === 'fft' || String(o.id || '').toLowerCase().startsWith('fft-');
                                    }).map((o: any) => String(o.id));

                                    for (const nodeId of fftNodeIds) {
                                        // find direct feeders into the flow fft node
                                        const feeders = connections.filter(c => c.to === nodeId).map(c => c.from);
                                        for (const f of feeders) {
                                            const s = String(f);
                                            if (s.startsWith('channel-')) {
                                                if (!expanded.includes(s)) expanded.push(s);
                                            } else if (s.startsWith('filter-')) {
                                                // if a filter feeds the fft node, resolve channels that feed that filter
                                                const chs = connections.filter(c2 => c2.to === s && String(c2.from).startsWith('channel-')).map(c2 => c2.from);
                                                for (const ch of chs) if (!expanded.includes(String(ch))) expanded.push(String(ch));
                                            }
                                        }
                                    }
                                }
                            } catch (err) {
                                // non-critical; if something goes wrong here, fall back to direct expanded list
                            }

                            // --- Auto-mapping for aggregated Plot dashboard widget ---
                            // If the dashboard has a single aggregated 'plots-aggregated' widget,
                            // collect all channel feeders that target any basic flow nodes so the
                            // aggregated widget can display all connected channels in a single plot.
                            try {
                                const targetWidget = widgets.find(w => w.id === wId);
                                if (targetWidget && targetWidget.type === 'basic' && wId === 'plots-aggregated') {
                                    // gather all flow-node ids that represent basic/Plot nodes
                                    const plotNodeIds = (flowOptions || []).filter((o: any) => String(o.type || '').toLowerCase() === 'basic' || String(o.id || '').toLowerCase().startsWith('basic-')).map((o: any) => {
                                        const insts = (o as any).instances || Array.from({ length: (o.count || 1) }, (_, i) => ({ id: `${o.id}-${i}` }));
                                        return insts.map((ins: any) => String(ins.id));
                                    }).flat();

                                    for (const nodeId of plotNodeIds) {
                                        const feeders = connections.filter(c => c.to === nodeId).map(c => c.from);
                                        for (const f of feeders) {
                                            const s = String(f);
                                            if (s.startsWith('channel-')) {
                                                if (!expanded.includes(s)) expanded.push(s);
                                            } else if (s.startsWith('filter-')) {
                                                const chs = connections.filter(c2 => c2.to === s && String(c2.from).startsWith('channel-')).map(c2 => c2.from);
                                                for (const ch of chs) if (!expanded.includes(String(ch))) expanded.push(String(ch));
                                            } else {
                                                if (!expanded.includes(s)) expanded.push(s);
                                            }
                                        }
                                    }
                                }
                            } catch (err) { /* ignore auto-mapping errors */ }

                            return expanded;
                        };

                        return widgets.map(widget => (
                            <DraggableWidget
                                key={widget.id}
                                widget={widget}
                                widgets={widgets}
                                onRemove={handleRemoveWidget}
                                gridSettings={gridSettings}
                                dragState={dragState}
                                setDragState={setDragState}
                                onUpdateWidget={handleUpdateWidget}
                                incomingConnections={getUpstreamSources(widget.id)}
                            />
                        ));
                    })()}

                    {/* Popover rendered outside the widget, anchored near the connection controls */}
                </div>
            </div>
            )}

            {/* When the flow modal is closed we still need transform nodes (like Envelope)
                to remain active so they can publish outputs into the provider. Render
                envelope instances invisibly when the Flow modal is not open so their
                subscriptions remain active even while the user is viewing the dashboard. */}
            {!showFlowModal && (
                <div style={{ display: 'none' }} aria-hidden>
                    {flowOptions && flowOptions.filter((opt: any) => opt.type === 'envelope').map((opt: any) => (
                        <Envelope
                            key={`hidden-envelopes-${opt.id}`}
                            id={opt.id}
                            incomingConnections={connections.filter((c: any) => c.to === opt.id).map((c: any) => c.from)}
                        />
                    ))}
                </div>
            )}

            <Toast toast={toast} onClose={hideToast} />
            <ConfirmModal confirm={confirm} />
            {/* Onboarding tour for the Flow modal */}
            <OnboardingTour
                steps={tourSteps as any}
                open={showTour}
                onClose={onTourClose}
                preventAutoScroll={true}
                initial={0}
            />
        </div>
    );
};

export default Widgets;