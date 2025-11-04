'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import DraggableWidget from '@/components/DraggableWidget';
import Toast from '@/components/ui/Toast';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { Widget, GridSettings, DragState, ToastState, ConfirmState } from '@/types/widget.types';
import { checkCollisionAtPosition } from '@/utils/widget.utils';
import ConnectionDataWidget from '@/components/ConnectionDataWidget';
import { useChannelData } from '@/lib/channelDataContext';

/**
 * Main Widgets component - Orchestrates the entire widget dashboard
 * Manages widget state, grid settings, drag operations, and user interactions
 */
const Widgets: React.FC = () => {

    // Manual connection drawing state
    const [drawingConnection, setDrawingConnection] = useState<{ from: string, startX: number, startY: number } | null>(null);
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

    // Open settings for a given flow option id and seed the draft from flowOptions
    const openSettings = (widgetId: string) => {
        const opt = flowOptions.find(o => o.id === widgetId);
        setSettingsDraft(opt && (opt as any).config ? { ...(opt as any).config } : {});
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
                    <h3 style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>Settings for {opt.label}</h3>

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

                    

                    {isFFT && (
                        <div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontWeight: 500 }}>FFT Size:</label>
                                <select value={(settingsDraft && settingsDraft.fftSize) || 256} onChange={e => setSettingsDraft(prev => ({ ...(prev || {}), fftSize: parseInt(e.target.value, 10) }))} style={{ marginLeft: 8 }}>
                                    <option value={128}>128</option>
                                    <option value={256}>256</option>
                                    <option value={512}>512</option>
                                    <option value={1024}>1024</option>
                                </select>
                                <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>Choose FFT window size (power of two). Larger sizes give finer frequency resolution but more latency.</div>
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontWeight: 500 }}>Window:</label>
                                <select value={(settingsDraft && settingsDraft.window) || 'hann'} onChange={e => setSettingsDraft(prev => ({ ...(prev || {}), window: e.target.value }))} style={{ marginLeft: 8 }}>
                                    <option value="none">None</option>
                                    <option value="hann">Hann</option>
                                    <option value="hamming">Hamming</option>
                                    <option value="blackman">Blackman</option>
                                </select>
                                <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>Windowing reduces spectral leakage. Hann is a good default for biomedical signals.</div>
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontWeight: 500 }}>Sampling Rate (Hz):</label>
                                <select value={(settingsDraft && settingsDraft.samplingRate) || 250} onChange={e => setSettingsDraft(prev => ({ ...(prev || {}), samplingRate: parseInt(e.target.value, 10) }))} style={{ marginLeft: 8 }}>
                                    <option value={250}>250</option>
                                    <option value={500}>500</option>
                                    <option value={1000}>1000</option>
                                </select>
                                <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>{samplingRateHelp}</div>
                            </div>
                        </div>
                    )}

                    {isFilter && (
                        <div>
                           
                            {/* Notch frequency selection (50Hz / 60Hz) */}
                            {(((settingsDraft && settingsDraft.filterType) || 'notch') === 'notch') && (
                                <div style={{ marginBottom: 12 }}>
                                    <label style={{ fontWeight: 500 }}>Notch Frequency (Hz):</label>
                                    <select value={(settingsDraft && settingsDraft.notchFreq) || 50} onChange={e => setSettingsDraft(prev => ({ ...(prev || {}), notchFreq: parseInt(e.target.value, 10) }))} style={{ marginLeft: 8 }}>
                                        <option value={50}>50 Hz</option>
                                        <option value={60}>60 Hz</option>
                                    </select>
                                    <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>Choose the mains notch frequency to remove from signals.</div>
                                </div>
                            )}
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
    const initialModalPositions: Record<string, { left: number, top: number }> = {};
    // Place a combined Channels container (holds individual channel handles visually)
    initialModalPositions['channels-box'] = { left: 60, top: 80 };
    // Place a combined Plots container (mirrors Channels box for Plot instances)
    initialModalPositions['plots-box'] = { left: 60, top: 260 };
    // Keep positions for the other flowchart items (three rows: spiderplot, fft, bandpower)
    // Single spiderplot widget position
    initialModalPositions['spiderplot'] = { left: 320, top: 100 };
    // FFT and Bandpower single placeholders
    initialModalPositions['fft'] = { left: 540, top: 100 };
    initialModalPositions['bandpower'] = { left: 760, top: 100 };
    const [modalPositions, setModalPositions] = useState<Record<string, { left: number, top: number }>>(initialModalPositions);
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
    const { showFlowModal, setShowFlowModal } = require('@/context/FlowModalContext').useFlowModal();
    // List of all possible widgets in the flow (initially based on flowchart)
    // Channel configuration: default show DEFAULT_CHANNEL_COUNT channels, up to MAX_CHANNELS
    // Channel ids are zero-based: 'channel-0', 'channel-1', ...
    const MAX_CHANNELS = 16;
    const DEFAULT_CHANNEL_COUNT = 1;
    const [channelCount, setChannelCount] = useState<number>(DEFAULT_CHANNEL_COUNT);

    // Generate initial flow options with default channelCount
    // flow option objects may optionally include a `count` property for types that support multiple instances (e.g. 'basic')
    const initialFlowOptions: Array<{ id: string, label: string, type: string, selected: boolean, count?: number }> = [];
    // create channel-0 .. channel-(N-1)
    for (let ch = 0; ch < DEFAULT_CHANNEL_COUNT; ch++) {
        initialFlowOptions.push({ id: `channel-${ch}`, label: `Channel ${ch}`, type: 'channel', selected: true });
    }
    // By default we only include the configured channels in the flowchart.
    // Other applications (spiderplot, FFT, Bandpower, etc.) can be added by the user
    // using the drag-and-drop Applications palette into the flow modal.
    const [flowOptions, setFlowOptions] = useState(initialFlowOptions);

    // Register which channel flow nodes are present so the channel data context
    // will route incoming samples only to the active channels.
    const { setRegisteredChannels, setChannelFilters } = useChannelData();
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
    const [connections, setConnections] = useState<Array<{ from: string, to: string }>>([]);

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

            console.debug('[FlowDebug] connections', { total: connections.length, connections });
            console.debug('[FlowDebug] plotInstanceIds', plotInstanceIds);
            console.debug('[FlowDebug] channel->plot mappings', channelToPlot);

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
            const mapping: Record<number, { enabled?: boolean, filterType?: string, notchFreq?: number, samplingRate?: number }> = {};
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
                            mapping[chIdx] = {
                                enabled: cfg.enabled !== false,
                                filterType: cfg.filterType || 'notch',
                                notchFreq: cfg.notchFreq || 50,
                                samplingRate: cfg.samplingRate || undefined,
                            };
                        }
                    }
                } catch (err) { /* ignore per-connection errors */ }
            }
            try {
                if (typeof setChannelFilters === 'function') setChannelFilters(mapping);
            } catch (err) { /* ignore */ }
        } catch (err) { /* ignore */ }
    }, [connections, flowOptions, setChannelFilters]);
    
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
    const widgetsRef = useRef<Widget[]>(widgets);
    const gridSettingsRef = useRef<GridSettings>(gridSettings);
    // Flag to indicate an input handled mouseup and finalized the connection
    const inputHandledRef = useRef(false);

    // Arrow refresh tick to force re-render when modal positions or connections change
    const [arrowTick, setArrowTick] = useState(0);
    useEffect(() => {
        // Trigger a small re-render to ensure arrow geometry is recalculated after layout changes
        setArrowTick(t => t + 1);
    }, [modalPositions, connections, widgets, gridSettings]);

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

    // Toast utility functions
    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        setToast({ show: true, message, type });
    }, []);

    // Monitor screen size and adjust grid to use full viewport
    useEffect(() => {
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

        // Clamp left/top to reasonable bounds inside the flow modal container
        const containerWidth = 1200; // default used elsewhere
        const containerHeight = 500;
        const widgetWidth = (canonical === 'bandpower') ? 220 : 180;
        const widgetHeight = 70;
        const clampedLeft = Math.max(8, Math.min(Math.round(left), Math.max(8, Math.floor(containerWidth - widgetWidth - 8))));
        const clampedTop = Math.max(8, Math.min(Math.round(top), Math.max(8, Math.floor(containerHeight - widgetHeight - 8))));

        setModalPositions(prev => ({ ...prev, [id]: { left: clampedLeft, top: clampedTop } }));
        showToast(`${label} added to flowchart`, 'success');
    }, [flowOptions, setFlowOptions, setModalPositions, showToast]);

    /**
     * Add a new instance (sub-widget) to a basic flow option.
     * Each instance gets a stable unique id so connections can target it.
     */
    const addBasicInstance = useCallback((optId: string) => {
        setFlowOptions(prev => prev.map(o => {
            if (o.id !== optId) return o;
            const existing = (o as any).instances || [];
            // nextIndex is zero-based
            const nextIndex = existing.length;
            const newId = `${o.id}-${Date.now().toString(36).substr(2,6)}-${nextIndex}`;
            const newLabel = `${o.label} ${nextIndex}`;
            return { ...o, instances: [...existing, { id: newId, label: newLabel }] };
        }));
    }, []);

    const removeBasicInstance = useCallback((optId: string, instanceId: string) => {
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
        if (basicOpts.length > 0) {
            // Prefer the currently selected basic option if present, otherwise fall back to the first
            const selectedBasic = basicOpts.find(o => (o as any).selected) || basicOpts[0];
            addBasicInstance(selectedBasic.id);
            return;
        }
    // Create a new basic flow option with one instance (zero-based instance id/label)
    const id = `basic-${Date.now()}-${Math.random().toString(36).substr(2,6)}`;
    const label = 'Plot';
    setFlowOptions(prev => [...prev, { id, label, type: 'basic', selected: true, instances: [{ id: `${id}-0`, label: `${label} 0` }] }]);
        setModalPositions(prev => ({ ...prev, [id]: { left: 200, top: 100 } }));
    }, [flowOptions, addBasicInstance]);

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
        setWidgets(prev => prev.map(widget =>
            widget.id === id ? { ...widget, ...updates } : widget
        ));
    }, []);

    /**
     * Load layout (for import functionality)
     */
    const handleLoadLayout = useCallback((newWidgets: Widget[], newGridSettings?: GridSettings) => {
        setWidgets(newWidgets);
        if (newGridSettings) {
            setGridSettings(newGridSettings);
        }
        showToast(`Layout loaded with ${newWidgets.length} widgets`, 'success');
    }, [showToast]);

    // Mouse move handler for drag operations
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragState.isDragging || !dragState.activeWidgetId) return;

            const deltaX = Math.round((e.clientX - dragState.startMouseX) / gridSettings.cellWidth);
            const deltaY = Math.round((e.clientY - dragState.startMouseY) / gridSettings.cellHeight);

            let newX = dragState.startX;
            let newY = dragState.startY;
            let newWidth = dragState.startWidth;
            let newHeight = dragState.startHeight;

            if (dragState.dragType === 'move') {
                // Prevent widgets from moving over header
                newX = Math.max(0, dragState.startX + deltaX);
                newY = Math.max(0, dragState.startY + deltaY);
            } else if (dragState.dragType === 'resize') {
                newWidth = Math.max(1, dragState.startWidth + deltaX);
                newHeight = Math.max(1, dragState.startHeight + deltaY);
            }

            // Apply widget-specific minimum constraints
            const activeWidget = widgets.find(w => w.id === dragState.activeWidgetId);
            if (activeWidget) {
                newWidth = Math.max(activeWidget.minWidth, newWidth);
                newHeight = Math.max(activeWidget.minHeight, newHeight);
            }

            // Enhanced boundary constraints - allow symmetric edge positioning
            if (dragState.dragType === 'move') {
                // Prevent widgets from moving over header
                const minX = 0;
                const maxX = gridSettings.cols - newWidth;
                const minY = 0;
                const maxY = gridSettings.rows - newHeight;
                newX = Math.max(minX, Math.min(newX, maxX));
                newY = Math.max(minY, Math.min(newY, maxY));
            } else if (dragState.dragType === 'resize') {
                // Ensure widget doesn't exceed grid boundaries during resize
                const maxAllowedWidth = Math.max(1, gridSettings.cols - newX);
                const maxAllowedHeight = Math.max(1, gridSettings.rows - newY);
                newWidth = Math.min(newWidth, maxAllowedWidth);
                newHeight = Math.min(newHeight, maxAllowedHeight);
                // Also ensure minimum sizes are respected
                if (activeWidget) {
                    newWidth = Math.max(activeWidget.minWidth, newWidth);
                    newHeight = Math.max(activeWidget.minHeight, newHeight);
                }
            }

            // Check collision before updating
            if (!checkCollisionAtPosition(widgets, dragState.activeWidgetId, newX, newY, newWidth, newHeight, gridSettings)) {
                handleUpdateWidget(dragState.activeWidgetId, {
                    x: newX,
                    y: newY,
                    width: newWidth,
                    height: newHeight
                });
            }
        };

        const handleMouseUp = () => {
            // End any active drag operation
            setDragState(prev => ({
                ...prev,
                isDragging: false,
                dragType: null,
                activeWidgetId: null,
            }));
        };


        if (dragState.isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragState, widgets, gridSettings, handleUpdateWidget]);

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
        <div className="min-h-screen w-screen bg-gray-100 flex flex-col overflow-hidden">
            {/* Flow Configuration Modal */}
            {showFlowModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    background: 'rgba(0,0,0,0.25)',
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <div style={{
                        background: 'white',
                        borderRadius: 12,
                        boxShadow: '0 2px 16px rgba(0,0,0,0.15)',
                        padding: 32,
                        // Make text inside the flow configuration modal non-selectable
                        WebkitUserSelect: 'none' as any,
                        MozUserSelect: 'none' as any,
                        msUserSelect: 'none' as any,
                        userSelect: 'none' as any,
                        minWidth: 1200,
                        maxWidth: 1400,
                        width: '90vw',
                        position: 'relative',
                        overflow: 'auto',
                        margin: 'auto',
                    }}>
                        {/* Settings modal always rendered at top level of flowchart modal */}
                        {renderSettingsModal()}
                        <button
                            style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', fontSize: 22, color: '#2563eb', cursor: 'pointer' }}
                            onClick={() => setShowFlowModal(false)}
                        >
                            &times;
                        </button>
                        <h2 style={{ fontWeight: 'bold', fontSize: 22, marginBottom: 2 }}>Configure Flow</h2>
                        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                            <button
                                style={{ background: '#2563eb', color: 'white', padding: '8px 18px', borderRadius: 8, fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 16 }}
                                onClick={() => {
                                    // Download full flowchart layout (widgets, grid, connections, positions, options) as JSON file
                                    try {
                                        const layout = {
                                            widgets,
                                            gridSettings,
                                            connections,
                                            modalPositions,
                                            flowOptions,
                                            channelCount,
                                        };
                                        const json = JSON.stringify(layout, null, 2);
                                        const blob = new Blob([json], { type: 'application/json' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = 'flowchart-layout.json';
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        URL.revokeObjectURL(url);
                                        showToast('Flowchart layout downloaded!', 'success');
                                    } catch (err) {
                                        showToast('Failed to download layout', 'error');
                                    }
                                }}
                            >Save Layout</button>
                            {/* Left palette is now shown inside the flow area as a draggable list (see below) */}
                            <button
                                style={{ background: '#10B981', color: 'white', padding: '8px 18px', borderRadius: 8, fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 16 }}
                                onClick={() => {
                                    // Open file selector to load flowchart layout
                                    try {
                                        const input = document.createElement('input');
                                        input.type = 'file';
                                        input.accept = '.json,application/json';
                                        input.onchange = (e) => {
                                            const target = e.target as HTMLInputElement | null;
                                            if (!target || !target.files || target.files.length === 0) return;
                                            const file = target.files[0];
                                            if (!file) return;
                                            const reader = new FileReader();
                                            reader.onload = (ev) => {
                                                try {
                                                    const layout = JSON.parse(ev.target?.result as string);
                                                    if (layout && typeof layout === 'object') {
                                                        if (layout.widgets) setWidgets(layout.widgets);
                                                        if (layout.gridSettings) setGridSettings(layout.gridSettings);
                                                        if (layout.connections) setConnections(layout.connections);
                                                        if (layout.modalPositions) setModalPositions(layout.modalPositions);
                                                            if (layout.flowOptions) setFlowOptions(layout.flowOptions);
                                                            // Restore channel count if present; otherwise infer from flowOptions
                                                            if (typeof layout.channelCount === 'number') {
                                                                setChannelCount(layout.channelCount);
                                                            } else if (layout.flowOptions && Array.isArray(layout.flowOptions)) {
                                                                const cnt = (layout.flowOptions as any[]).filter(o => typeof o.id === 'string' && o.id.startsWith('channel-')).length;
                                                                setChannelCount(cnt || 1);
                                                            }
                                                        showToast('Flowchart layout loaded!', 'success');
                                                    } else {
                                                        showToast('Invalid layout file', 'error');
                                                    }
                                                } catch (err) {
                                                    showToast('Failed to parse layout file', 'error');
                                                }
                                            };
                                            reader.readAsText(file);
                                        };
                                        input.click();
                                    } catch (err) {
                                        showToast('Failed to open file selector', 'error');
                                    }
                                }}
                            >Load Layout</button>
                            {/* Make Connection button placed next to Load Layout for convenience */}
                            <button
                                style={{ background: '#f59e0b', color: 'white', padding: '8px 18px', borderRadius: 8, fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 16 }}
                                onClick={() => setShowConnectionModal(true)}
                            >Make Connection</button>
                        </div>
                        {/* Connection modal (opened via toolbar Make Connection button) */}
                        {showConnectionModal && (
                            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 100002, pointerEvents: 'auto' }}>
                                <div
                                    style={{
                                        position: 'fixed',
                                        top: 0,
                                        left: 0,
                                        width: '100vw',
                                        height: '100vh',
                                        background: 'rgba(81, 75, 75, 0.39)',
                                        zIndex: 200002,
                                        pointerEvents: 'auto',
                                    }}
                                    onClick={() => setShowConnectionModal(false)}
                                />
                                <div
                                    style={{
                                        position: 'fixed',
                                        top: '50%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        paddingLeft: 0,
                                        paddingRight: 0,
                                        marginLeft: 0,
                                        marginRight: 0,
                                        borderRadius: 16,
                                        boxShadow: '0 12px 48px rgba(0,0,0,0.32)',
                                        border: '2px solid #2563eb',
                                        padding: 40,
                                        minWidth: 420,
                                        maxWidth: 520,
                                        background: 'rgba(248, 247, 247, 1)',
                                        zIndex: 200003,
                                        pointerEvents: 'auto',
                                    }}
                                    onMouseDown={e => e.stopPropagation()}
                                >
                                    <button
                                        style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', fontSize: 22, color: '#2563eb', cursor: 'pointer' }}
                                        onClick={e => { e.stopPropagation(); setShowConnectionModal(false); }}
                                    >
                                        &times;
                                    </button>
                                    <ConnectionDataWidget />
                                </div>
                            </div>
                        )}

                        {/* Flowchart grid layout */}
                        {/* Row layout: left palette + flow area to avoid overlap */}
                        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', paddingTop: 8 }}>
                            <div style={{ width: 220, flex: '0 0 220', height: 520, overflowY: 'auto', padding: 8, borderRadius: 8, background: '#fafafa', border: '1px solid #e6e7eb' }}>
                                <div style={{ fontWeight: 600, padding: '6px 8px', color: '#374151' }}>Applications</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                                    {[
                                        { id: 'spiderplot', label: 'Spider Plot' },
                                        { id: 'FFTGraph', label: 'FFT' },
                                        { id: 'envelope', label: 'Envelope' },
                                        { id: 'candle', label: 'Candle' },
                                        { id: 'bandpower', label: 'Bandpower' },
                                        { id: 'filter', label: 'Filter' },
                                    ].map(item => (
                                        <div
                                            key={item.id}
                                            draggable
                                            onDragStart={(e) => { try { e.dataTransfer.setData('application/widget-type', item.id); e.dataTransfer.effectAllowed = 'copy'; } catch (err) {} }}
                                            style={{ cursor: 'grab', padding: '8px 10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', color: '#111827' }}
                                        >
                                            {item.label}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div onDragOver={(e) => { e.preventDefault(); }} onDrop={(e) => {
                                e.preventDefault();
                                const type = e.dataTransfer.getData('application/widget-type') || e.dataTransfer.getData('text/plain');
                                if (!type) return;
                                const target = e.currentTarget as HTMLElement;
                                const rect = target.getBoundingClientRect();
                                const x = e.clientX - rect.left;
                                const y = e.clientY - rect.top;
                                // Add as a flowchart item (not dashboard widget). Compute pixel left/top inside flow area.
                                handleAddFlowItemAt(type, x, y);
                            }} style={{ position: 'relative', flex: 1, minWidth: 900, height: 500, margin: 'auto', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 32px rgba(0,0,0,0.08)', overflow: 'hidden', background: '#fff', WebkitUserSelect: 'none' as any, MozUserSelect: 'none' as any, msUserSelect: 'none' as any, userSelect: 'none' as any }}>
                            {/* Live arrow while dragging connection */}
                            {drawingConnection && mousePos && (
                                <svg style={{ position: 'absolute', left: 0, top: 0, width: '1200px', height: '500px', pointerEvents: 'none', zIndex: 10000 }}>
                                    <path
                                        d={`M ${drawingConnection.startX} ${drawingConnection.startY} L ${mousePos.x} ${mousePos.y}`}
                                        stroke="#2563eb"
                                        strokeWidth={2.5}
                                        fill="none"
                                    />
                                </svg>
                            )}
                            {/* Render all manual connections as arrows */}
                            <svg id="flowchart-arrow-svg" style={{ position: 'absolute', left: 0, top: 0, width: '1200px', height: '500px', pointerEvents: 'none', zIndex: 9999 }}>
                                {connections.map(({ from, to }, idx) => {
                                    // Get exact circle centers when possible
                                    const fromCenter = getCircleCenter(from, 'output');
                                    const toCenter = getCircleCenter(to, 'input');

                                    // Fallback to modalPositions-based calculation
                                    let startX: number, startY: number, endX: number, endY: number;

                                    const fromPos = modalPositions[from];
                                    const toPos = modalPositions[to];

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
                                    // Build obstacle boxes from modalPositions for routing
                                    const obstacles: Array<{ left: number, top: number, right: number, bottom: number, id?: string }> = [];
                                    Object.keys(modalPositions).forEach(k => {
                                        const p = modalPositions[k];
                                        // approximate modal widget sizes used in layout (match earlier logic)
                                        const widgetType = k.startsWith('channel') ? 'channel' : k.startsWith('spider') ? 'spiderplot' : k.startsWith('fft') ? 'fft' : 'bandpower';
                                        const w = (widgetType === 'bandpower') ? 220 : 180;
                                        const h = 70;
                                        obstacles.push({ left: p.left, top: p.top, right: p.left + w, bottom: p.top + h, id: k });
                                    });

                                    // Anchor always to right edge of source and left edge of target when possible
                                    let path = getSmartPath(startX, startY, endX, endY);
                                    // If the cubic bezier intersects any widget boxes, fall back to obstacle-aware routing
                                    const plainObstacles = obstacles.map(o => ({ left: o.left, top: o.top, right: o.right, bottom: o.bottom }));
                                    if (bezierIntersectsObstacles(startX, startY, endX, endY, plainObstacles)) {
                                        path = computeAvoidingPath(startX, startY, endX, endY, obstacles, [from, to]);
                                    }
                                    return (
                                        <path key={idx} d={path} stroke="#2563eb" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                    );
                                })}
                                {/* arrowheads removed */}
                            </svg>
                            {/* Auto-flow arrows removed per cleanup request */}
                            {/* Flowchart nodes as boxes */}
                            {/* Combined Channels box: visually represent all channels inside one widget but keep individual channel ids for connections */}
                            {(() => {
                                // derive channel list from flowOptions so removing one channel doesn't renumber others
                                const boxPos = modalPositions['channels-box'] || { left: 60, top: 80 };
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
                                    const flowSvg = document.getElementById('flowchart-arrow-svg');
                                    if (flowSvg) {
                                        const r = flowSvg.getBoundingClientRect();
                                        containerHeight = r.height || containerHeight;
                                        containerTop = r.top || 0;
                                        containerLeft = r.left || 0;
                                    }
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
                                        const newLeft = Math.round((origLeft + dx) / 10) * 10;
                                        const newTop = Math.round((origTop + dy) / 10) * 10;
                                        setModalPositions(pos => ({ ...pos, ['channels-box']: { left: newLeft, top: newTop } }));
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
                                    const flowSvg = document.getElementById('flowchart-arrow-svg');
                                    if (flowSvg) {
                                        const r = flowSvg.getBoundingClientRect();
                                        containerWidth = r.width || containerWidth;
                                    }
                                } catch (err) {
                                    // ignore
                                }

                                // Clamp left/top to keep the box within the flowchart container bounds
                                const clampedLeft = Math.max(8, Math.min(boxPos.left, Math.max(8, Math.floor(containerWidth - boxWidth - 8))));
                                const clampedTop = Math.max(8, Math.min(boxPos.top, Math.max(8, Math.floor(containerHeight - finalBoxHeight - 8))));

                                return (
                                    <div
                                        key="channels-box"
                                        // Render as absolute inside the flowchart container so it aligns with other modal widgets
                                        style={{ position: 'absolute', left: clampedLeft, top: clampedTop, width: boxWidth, height: finalBoxHeight, border: '2px solid #222', borderRadius: 12, background: '#fff', padding: 6, display: 'flex', flexDirection: 'column', gap: 4, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', zIndex: 2, overflow: 'visible' }}
                                        onMouseDown={handleDragChannels}
                                    >
                                        {/* Header with widget name, delete and settings buttons (compact) */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <button
                                                    style={{ background: '#d1d5db', color: '#111827', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                                    onClick={e => { e.stopPropagation(); decreaseChannels(); }}
                                                    title="Decrease channels"
                                                >
                                                    −
                                                </button>
                                                <strong style={{ fontSize: 12 }}>Channels ({channelCount})</strong>
                                                <button
                                                    style={{ background: '#d1d5db', color: '#111827', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                                    onClick={e => { e.stopPropagation(); increaseChannels(); }}
                                                    title="Increase channels"
                                                >
                                                    +
                                                </button>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                <button
                                                    style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                                    onClick={e => { e.stopPropagation(); handleRemoveChannels(); }}
                                                    title="Delete Channels"
                                                >
                                                    Delete
                                                </button>
                                                <button
                                                    style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
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
                                                // single column
                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4, paddingBottom: 4, overflow: 'visible' }}>
                                                        {channelOptions.map((opt, idx) => {
                                                            const id = opt.id as string;
                                                            const m = id.match(/channel-(\d+)/i);
                                                            const n = m ? parseInt(m[1], 10) : idx + 1;
                                                            const circleR = Math.max(2, Math.floor(rowHeight * 0.16));
                                                            const svgSize = Math.max(10, Math.floor(circleR * 2 + 2));
                                                            return (
                                                                <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `3px 6px`, borderRadius: 4, height: rowHeight }}>
                                                                    <div style={{ width: svgSize, height: svgSize }} />

                                                                    <span style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 600 }}>{opt.label}</span>

                                                                    <button
                                                                        onClick={e => removeChannelAt(id, e)}
                                                                        title={`Remove ${opt.label}`}
                                                                        style={{ marginRight: 6, background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                                                    >
                                                                        ×
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
                                                                                        const svgRect = flowSvg ? flowSvg.getBoundingClientRect() : { left: 0, top: 0 } as DOMRect;
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
                                                                        <circle cx={svgSize / 2} cy={svgSize / 2} r={circleR} fill="#fff" stroke="#2563eb" strokeWidth={1} />
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
                                                                                        setConnections(prev => {
                                                                                            const exists = prev.some(c => c.from === drawingConnection.from && c.to === id);
                                                                                            if (exists) return prev;
                                                                                            return [...prev, { from: drawingConnection.from, to: id }];
                                                                                        });
                                                                                        setDrawingConnection(null);
                                                                                        setMousePos(null);
                                                                                        setTimeout(() => { inputHandledRef.current = false; }, 0);
                                                                                    }
                                                                                }}
                                                                            >
                                                                                <circle cx={svgSize / 2} cy={svgSize / 2} r={Math.max(3, circleR)} fill="#fff" stroke="#10B981" strokeWidth={1.2} />
                                                                            </svg>

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
                                                                                            // approximate start positions for left/right columns; convert viewport -> svg coords
                                                                                            try {
                                                                                                const flowSvg = document.getElementById('flowchart-arrow-svg');
                                                                                                const svgRect = flowSvg ? flowSvg.getBoundingClientRect() : { left: 0, top: 0 } as DOMRect;
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
                                                                                <circle cx={svgSize / 2} cy={svgSize / 2} r={circleR} fill="#fff" stroke="#2563eb" strokeWidth={1} />
                                                                            </svg>
                                                                                    <button
                                                                                        onClick={e => removeChannelAt(id, e)}
                                                                                        title={`Remove ${option.label}`}
                                                                                        style={{ marginRight: 6, background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                                                                    >
                                                                                        ×
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
                            })()}

                            {/* Plots aggregated box: visually mirror the Channels box but list Plot instances */}
                            {(() => {
                                const boxPos = modalPositions['plots-box'] || { left: 60, top: 260 };
                                // derive plot instances from basic flowOptions
                                const plotOptions = flowOptions.filter(o => o.type === 'basic');
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
                                    const flowSvg = document.getElementById('flowchart-arrow-svg');
                                    if (flowSvg) {
                                        const r = flowSvg.getBoundingClientRect();
                                        containerHeight = r.height || containerHeight;
                                        containerTop = r.top || 0;
                                        containerLeft = r.left || 0;
                                    }
                                } catch (err) {}
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
                                        const newLeft = Math.round((origLeft + dx) / 10) * 10;
                                        const newTop = Math.round((origTop + dy) / 10) * 10;
                                        setModalPositions(pos => ({ ...pos, ['plots-box']: { left: newLeft, top: newTop } }));
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
                                    const flowSvg = document.getElementById('flowchart-arrow-svg');
                                    if (flowSvg) {
                                        const r = flowSvg.getBoundingClientRect();
                                        containerWidth = r.width || containerWidth;
                                    }
                                } catch (err) {}

                                const clampedLeft = Math.max(8, Math.min(boxPos.left, Math.max(8, Math.floor(containerWidth - boxWidth - 8))));
                                const clampedTop = Math.max(8, Math.min(boxPos.top, Math.max(8, Math.floor(containerHeight - finalBoxHeight - 8))));

                                return (
                                    <div
                                        key="plots-box"
                                        style={{ position: 'absolute', left: clampedLeft, top: clampedTop, width: boxWidth, height: finalBoxHeight, border: '2px solid #222', borderRadius: 12, background: '#fff', padding: 6, display: 'flex', flexDirection: 'column', gap: 4, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', zIndex: 2, overflow: 'visible' }}
                                        onMouseDown={handleDragPlots}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <button
                                                    style={{ background: '#d1d5db', color: '#111827', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                                    onClick={e => { e.stopPropagation(); decreasePlots(); }}
                                                    title="Decrease plots"
                                                >
                                                    −
                                                </button>
                                                <strong style={{ fontSize: 12 }}>Plots ({plotsCount})</strong>
                                                <button
                                                    style={{ background: '#d1d5db', color: '#111827', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                                    onClick={e => { e.stopPropagation(); increasePlots(); }}
                                                    title="Increase plots"
                                                >
                                                    +
                                                </button>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                <button
                                                    style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                                    onClick={e => { e.stopPropagation(); handleRemovePlots(); }}
                                                    title="Delete Plots"
                                                >
                                                    Delete
                                                </button>
                                                <button
                                                    style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
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
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4, paddingBottom: 4, overflow: 'visible' }}>
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
                                                                                    setConnections(prev => {
                                                                                        const exists = prev.some(c => c.from === drawingConnection.from && c.to === id);
                                                                                        if (exists) return prev;
                                                                                        return [...prev, { from: drawingConnection.from, to: id }];
                                                                                    });
                                                                                    setDrawingConnection(null);
                                                                                    setMousePos(null);
                                                                                    setTimeout(() => { inputHandledRef.current = false; }, 0);
                                                                                }
                                                                            }}
                                                                        >
                                                                            <circle cx={svgSize / 2} cy={svgSize / 2} r={Math.max(3, circleR)} fill="#fff" stroke="#10B981" strokeWidth={1.2} />
                                                                        </svg>
                                                                        <span style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 600 }}>{ins.label}</span>
                                                                        <button
                                                                            onClick={e => { e.stopPropagation(); removeBasicInstance(ins.id.split('-').slice(0,2).join('-'), ins.id); }}
                                                                            title={`Remove ${ins.label}`}
                                                                            style={{ marginRight: 6, background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                                                        >
                                                                            ×
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
                                                                                    try {
                                                                                        const flowSvg = document.getElementById('flowchart-arrow-svg');
                                                                                        const svgRect = flowSvg ? flowSvg.getBoundingClientRect() : { left: 0, top: 0 } as DOMRect;
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
                                                                            <circle cx={svgSize / 2} cy={svgSize / 2} r={circleR} fill="#fff" stroke="#2563eb" strokeWidth={1} />
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
                                                                                            const svgRect = flowSvg ? flowSvg.getBoundingClientRect() : { left: 0, top: 0 } as DOMRect;
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
                                                                                onClick={e => { e.stopPropagation(); removeBasicInstance(id.split('-').slice(0,2).join('-'), id); }}
                                                                                title={`Remove ${option.label}`}
                                                                                style={{ marginRight: 6, background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                                                            >
                                                                                ×
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
                            })()}
                            {/* Inline Make Connection box removed — use the toolbar 'Make Connection' button instead */}
                            {/* Render flow options (except channel entries; those are inside the Channels box) */}
                            {flowOptions.map((opt, idx) => {
                                // Channels are rendered inside the Channels box; basic/Plot instances
                                // are rendered only inside the aggregated Plots box to avoid
                                // duplicate UI. Skip rendering individual `basic` option boxes
                                // here so the plots-box is the single source of truth.
                                if (opt.id.startsWith('channel-') || opt.type === 'basic') return null;
                                const widgetId = opt.id;
                                const defaultLeft = 200 + (idx % 3) * 220;
                                const defaultTop = 100 + Math.floor(idx / 3) * 120;
                                const widgetLeft = modalPositions[widgetId]?.left ?? defaultLeft;
                                const widgetTop = modalPositions[widgetId]?.top ?? defaultTop;
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
                                        const newLeft = Math.round((origLeft + dx) / 10) * 10;
                                        const newTop = Math.round((origTop + dy) / 10) * 10;
                                        setModalPositions(pos => ({ ...pos, [widgetId]: { left: newLeft, top: newTop } }));
                                    };
                                    const onMouseUp = () => {
                                        window.removeEventListener('mousemove', onMouseMove);
                                        window.removeEventListener('mouseup', onMouseUp);
                                    };
                                    window.addEventListener('mousemove', onMouseMove);
                                    window.addEventListener('mouseup', onMouseUp);
                                };

                                return (
                                    <div
                                        key={widgetId}
                                        style={{ position: 'absolute', left: widgetLeft, top: widgetTop, width: widgetWidth, height: widgetHeight, border: '2px solid #222', borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14, zIndex: showConnectionModal || settingsModal.show ? 0 : 2, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', transition: 'box-shadow 0.2s', gap: 8, wordBreak: 'break-word', overflowWrap: 'break-word', textAlign: 'center', cursor: showConnectionModal || settingsModal.show ? 'default' : 'move', pointerEvents: showConnectionModal || settingsModal.show ? 'none' : 'auto' }}
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
                                                        style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}
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
                                                                setConnections(prev => {
                                                                    const exists = prev.some(c => c.from === drawingConnection.from && c.to === widgetId);
                                                                    if (exists) return prev;
                                                                    return [...prev, { from: drawingConnection.from, to: widgetId }];
                                                                });
                                                                setDrawingConnection(null);
                                                                setMousePos(null);
                                                                setTimeout(() => { inputHandledRef.current = false; }, 0);
                                                            }
                                                        }}
                                                    >
                                                        <circle cx={7} cy={7} r={2.5} fill="#fff" stroke="#2563eb" strokeWidth={1.1} style={{ cursor: 'pointer' }} />
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
                                                                <div style={{ minWidth: 28, textAlign: 'center', fontSize: 12, fontWeight: 700 }}>{instancesList.length}</div>
                                                            </>
                                                        )}
                                                    </div>

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
                                                                                setConnections(prev => {
                                                                                    const exists = prev.some(c => c.from === drawingConnection.from && c.to === ins.id);
                                                                                    if (exists) return prev;
                                                                                    return [...prev, { from: drawingConnection.from, to: ins.id }];
                                                                                });
                                                                                setDrawingConnection(null);
                                                                                setMousePos(null);
                                                                                setTimeout(() => { inputHandledRef.current = false; }, 0);
                                                                            }
                                                                        }}
                                                                    >
                                                                        <circle cx={9} cy={9} r={4} fill="#fff" stroke="#10B981" strokeWidth={1.2} />
                                                                    </svg>

                                                                    <div style={{ fontSize: 12, fontWeight: 600, minWidth: 80, textAlign: 'center' }}>{ins.label}</div>

                                                                    <button
                                                                        onClick={e => { e.stopPropagation(); removeBasicInstance(opt.id, ins.id); }}
                                                                        title={`Remove ${ins.label}`}
                                                                        style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
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
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <button style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, padding: '2px 7px', cursor: showConnectionModal || settingsModal.show ? 'default' : 'pointer', fontWeight: 500, fontSize: 11, boxShadow: '0 1px 4px rgba(239,68,68,0.08)', pointerEvents: showConnectionModal || settingsModal.show ? 'none' : 'auto', height: 22 }} onClick={() => {
                                                    if (showConnectionModal || settingsModal.show) return;
                                                    handleRemoveWidget(opt.id);
                                                    setFlowOptions(prev => prev.filter(o => o.id !== opt.id));
                                                }}>Delete</button>
                                                <button
                                                    style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontWeight: 500, fontSize: 11, boxShadow: '0 1px 4px rgba(37,99,235,0.08)', pointerEvents: 'auto', zIndex: 100002, height: 22, width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Settings"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        openSettings(widgetId);
                                                    }}
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="7" stroke="white" strokeWidth="1.5" /><path d="M10 7V10L12 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                                </button>

                                                {opt.type !== 'basic' && (
                                                    <svg style={{ marginLeft: 8, marginRight: 0, zIndex: 100 }} width={14} height={14}>
                                                        <svg
                                                            data-widgetid={widgetId}
                                                            data-handle="output"
                                                            style={{ cursor: 'crosshair', marginLeft: 0, marginRight: 0, zIndex: 100 }}
                                                            width={opt.type === 'basic' ? 18 : 14}
                                                            height={opt.type === 'basic' ? 18 : 14}
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
                                                            <circle cx={(opt.type === 'basic' ? 18 : 14) / 2} cy={(opt.type === 'basic' ? 18 : 14) / 2} r={opt.type === 'basic' ? 3.5 : 2.5} fill="#fff" stroke="#2563eb" strokeWidth={1.1} />
                                                        </svg>
                                                        <div
                                                            // For Plot widgets keep the input handle inside the box, otherwise keep the existing slight overlap
                                                            style={{ position: 'absolute', left: opt.type === 'basic' ? 8 : -7, top: '50%', transform: 'translateY(-50%)', zIndex: 100, width: opt.type === 'basic' ? 18 : 14, height: opt.type === 'basic' ? 18 : 14, cursor: drawingConnection ? 'pointer' : 'default' }}
                                                            data-widgetid={widgetId}
                                                            data-handle="input"
                                                            onMouseUp={e => {
                                                                e.stopPropagation();
                                                                if (drawingConnection && drawingConnection.from !== widgetId) {
                                                                    inputHandledRef.current = true;
                                                                    setConnections(prev => {
                                                                        const exists = prev.some(c => c.from === drawingConnection.from && c.to === widgetId);
                                                                        if (exists) return prev;
                                                                        return [...prev, { from: drawingConnection.from, to: widgetId }];
                                                                    });
                                                                    setDrawingConnection(null);
                                                                    setMousePos(null);
                                                                    setTimeout(() => { inputHandledRef.current = false; }, 0);
                                                                }
                                                            }}
                                                        >
                                                            <svg width={opt.type === 'basic' ? 18 : 14} height={opt.type === 'basic' ? 18 : 14}>
                                                                <circle cx={(opt.type === 'basic' ? 18 : 14) / 2} cy={(opt.type === 'basic' ? 18 : 14) / 2} r={opt.type === 'basic' ? 3.5 : 2.5} fill="#fff" stroke="#2563eb" strokeWidth={1.1} />
                                                            </svg>
                                                        </div>
                                                    </svg>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                        <button
                            style={{ marginTop: 24, background: '#10B981', color: 'white', padding: '10px 24px', borderRadius: 8, fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 18 }}
                            onClick={() => {
                                setShowFlowModal(false);
                                // Arrange selected widgets to fill dashboard space using grid, offset by header
                                setWidgets(prev => {
                                    const typeMap: Record<string, string> = {
                                        channel: 'basic',
                                        fft: 'FFTGraph',
                                        spiderplot: 'spiderplot',
                                        candle: 'candle',
                                        bandpower: 'statistic',
                                    };
                                    // Decide which flow options to expand into dashboard widgets.
                                    // New behavior: if any Plot (opt.type === 'basic') exists in the
                                    // flow, prefer expanding Plots only (either the explicitly
                                    // selected Plot options, or all Plot options if none selected).
                                    // Channels will NOT be implicitly expanded when Plots exist.
                                    // Channels are only implicitly expanded when there are no
                                    // Plot/basic options at all (preserves channel-only setups).
                                    const explicitSelected = flowOptions.filter(opt => opt.selected);
                                    const anyPlotsExist = flowOptions.some(opt => opt.type === 'basic');
                                    let selectedWidgets: typeof flowOptions = [];
                                    if (explicitSelected.some(o => o.type === 'basic')) {
                                        // User explicitly selected Plot(s) — expand only those
                                        selectedWidgets = explicitSelected;
                                    } else if (anyPlotsExist) {
                                        // There are Plot options in the flow but none explicitly
                                        // selected — expand all Plot options (do NOT include
                                        // channels).
                                        selectedWidgets = flowOptions.filter(opt => opt.type === 'basic');
                                    } else {
                                        // No Plot options present — fall back to previous
                                        // behavior and include selected items and channels.
                                        selectedWidgets = flowOptions.filter(opt => opt.selected || (typeof opt.id === 'string' && opt.id.startsWith('channel-')));
                                    }
                                    // Get grid settings and offsets
                                    const cols = gridSettings.cols || 24;
                                    const rows = gridSettings.rows || 16;
                                    const offsetX = gridSettings.offsetX || 0;
                                    const offsetY = gridSettings.offsetY || 0;
                                    // Calculate grid arrangement
                                    // Count total instances across selected flow options so the dashboard
                                    // layout matches the number of plot instances (not just selected options)
                                    const gridRows = 3; // always use 3 rows for layout
                                    let totalInstances = 0;
                                    for (const opt of selectedWidgets) {
                                        const insts = (opt as any).instances || Array.from({ length: (opt.count || 1) }, (_, i) => ({ id: `${opt.id}-${i + 1}` }));
                                        totalInstances += insts.length;
                                    }
                                    const count = Math.max(1, totalInstances);
                                    const gridCols = Math.ceil(count / gridRows);
                                    // Calculate widget size to fill grid
                                    const widgetWidth = Math.floor(cols / gridCols);
                                    const widgetHeight = Math.floor(rows / gridRows);
                                    // Place widgets in grid, offset by header
                                    let newWidgets: Widget[] = [];
                                    // Offset widgets by 1 grid cell right and down for clear separation
                                    const offsetCells = 3;
                                    // Calculate dynamic widget size so all fit without overlap
                                    const availableCols = cols - offsetCells;
                                    const availableRows = rows - offsetCells;
                                    const dynamicWidgetWidth = Math.max(3, Math.floor(availableCols / gridCols));
                                    const dynamicWidgetHeight = Math.max(3, Math.floor(availableRows / gridRows));
                                    // Arrange selected widgets in dashboard grid order (fill 3 rows by default)
                                    // Prevent duplicate channel widgets: if a channel flow option is
                                    // explicitly connected into a plot instance, that channel will be
                                    // represented by the plot instance widget — skip creating a separate
                                    // channel widget for the same channel index.
                                    // Exclude channel flow entries from being expanded into
                                    // dashboard widgets. Channels are data sources only and
                                    // should not automatically create 'basic' Plot widgets
                                    // from the Channels box.
                                    // Exclude flow-only types (channels and filters) from being expanded
                                    // into dashboard widgets. Filters should only exist inside the
                                    // flowchart and must not create dashboard widgets.
                                    const widgetTypes = selectedWidgets.filter(opt => !(typeof opt.id === 'string' && opt.id.startsWith('channel-')) && opt.type !== 'filter');
                                    // Build a set of instance ids from all basic options so we can
                                    // detect connections that target instances.
                                    const allInstanceIds = new Set<string>();
                                    for (const opt of widgetTypes) {
                                        if (opt.type === 'basic') {
                            const insts = (opt as any).instances || Array.from({ length: (opt.count || 1) }, (_, i) => ({ id: `${opt.id}-${i}` }));
                                for (const ins of insts) allInstanceIds.add(ins.id);
                                        }
                                    }
                                    // Find channels that are already routed into instances via connections
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

                                    // Expand selected flow options into dashboard widgets.
                                    // For 'basic' flow items we support an optional `count` property which
                                    // will create multiple dashboard widgets (with zero-based channelIndex 0..count-1).
                                    let placeIndex = 0;
                                    widgetTypes.forEach((opt, optIdx) => {
                                        // If this option is a channel and it's already routed into a
                                        // plot instance, skip creating a separate channel widget to
                                        // avoid duplicate widgets for the same channel index.
                                        if (typeof opt.id === 'string' && opt.id.startsWith('channel-')) {
                                            const m = opt.id.match(/channel-(\d+)/i);
                                            const idxVal = m ? parseInt(m[1], 10) : null;
                                            if (idxVal !== null && !isNaN(idxVal) && channelsRouted.has(idxVal)) return;
                                        }
                                        const instancesArr: Array<{ id: string, label?: string }> = (opt as any).instances || Array.from({ length: (opt.count || 1) }, (_, i) => ({ id: `${opt.id}-${i}`, label: `${opt.label} ${i}` }));
                                        for (let inst = 0; inst < instancesArr.length; inst++) {
                                            const rowIdx = placeIndex % gridRows;
                                            const colIdx = Math.floor(placeIndex / gridRows);
                                            const x = offsetCells + colIdx * dynamicWidgetWidth;
                                            const y = offsetCells + rowIdx * dynamicWidgetHeight;
                                            // Prevent overflow
                                            const safeX = Math.min(x, cols - dynamicWidgetWidth);
                                            const safeY = Math.min(y, rows - dynamicWidgetHeight);
                                            // Use the instance's own id (stable) so flow connections
                                            // that target plot instance ids (e.g. `${opt.id}-1`) match
                                            // the dashboard widget id. Always prefer the instance id
                                            // generated from the flow option to avoid mismatches.
                                            const instanceId = instancesArr[inst].id;
                                            const widgetObj: Widget = {
                                                id: instanceId,
                                                x: safeX,
                                                y: safeY,
                                                // Ensure Plot widgets are at least the larger size we prefer
                                                width: opt.type === 'basic' ? Math.max(dynamicWidgetWidth, 6) : dynamicWidgetWidth,
                                                height: opt.type === 'basic' ? Math.max(dynamicWidgetHeight, 5) : dynamicWidgetHeight,
                                                minWidth: opt.type === 'basic' ? 6 : 3,
                                                minHeight: opt.type === 'basic' ? 5 : 3,
                                                type: typeMap[opt.type] || opt.type,
                                            };
                                            // If this flow option corresponds to a channel (channel-#), record the channel index
                                            if (typeof opt.id === 'string' && opt.id.startsWith('channel-')) {
                                                const m = opt.id.match(/channel-(\d+)/i);
                                                // treat parsed id as zero-based index
                                                const idxVal = m ? Math.max(0, parseInt(m[1], 10)) : 0;
                                                (widgetObj as any).channelIndex = idxVal;
                                            }
                                            // If this is a basic flow option with instances, assign channelIndex sequentially
                                            if (opt.type === 'basic') {
                                                // channelIndex is zero-based (used by DraggableWidget to map ch{index})
                                                (widgetObj as any).channelIndex = inst;
                                            }

                                            newWidgets.push(widgetObj);
                                            placeIndex++;
                                        }
                                    });
                                    return newWidgets;
                                });
                            }}
                        >Play</button>
                    </div>
                </div>
            )}
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center', boxSizing: 'border-box', minHeight: `calc(100vh - ${(gridSettings.offsetY || 64)}px)` }}>
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
                            const direct = connections.filter(c => c.to === wId).map(c => c.from);
                            const expanded: string[] = [];
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

            <Toast toast={toast} onClose={hideToast} />
            <ConfirmModal confirm={confirm} />
        </div>
    );
};

export default Widgets;