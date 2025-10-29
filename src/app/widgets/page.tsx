'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import DraggableWidget from '@/components/DraggableWidget';
import Toast from '@/components/ui/Toast';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { Widget, GridSettings, DragState, ToastState, ConfirmState } from '@/types/widget.types';
import { checkCollisionAtPosition } from '@/utils/widget.utils';
import ConnectionDataWidget from '@/components/ConnectionDataWidget';

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

    // Settings modal content (random for now, special for spiderplot)
    const renderSettingsModal = () => {
        if (!settingsModal.show || !settingsModal.widgetId) return null;
        const opt = flowOptions.find(o => o.id === settingsModal.widgetId);
        if (!opt) return null;
        const isSpiderPlot = opt.type === 'spiderplot';
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
                    maxWidth: 420,
                    position: 'relative',
                }}>
                    <button
                        style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', fontSize: 22, color: '#2563eb', cursor: 'pointer' }}
                        onClick={() => setSettingsModal({ show: false, widgetId: null })}
                    >
                        &times;
                    </button>
                    <h3 style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 16 }}>Settings for {opt.label}</h3>
                    {isSpiderPlot ? (
                        <div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontWeight: 500 }}>Apply Filter:</label>
                                <select style={{ marginLeft: 8 }}>
                                    <option value="">Select Filter</option>
                                    <option value="lowpass">Lowpass</option>
                                    <option value="highpass">Highpass</option>
                                    <option value="bandpass">Bandpass</option>
                                </select>
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontWeight: 500 }}>Remove Filter:</label>
                                <button style={{ marginLeft: 8, background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Remove</button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontWeight: 500 }}>Random Setting 1:</label>
                                <input type="text" placeholder="Value" style={{ marginLeft: 8, border: '1px solid #ccc', borderRadius: 6, padding: '4px 8px' }} />
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ fontWeight: 500 }}>Random Setting 2:</label>
                                <input type="number" placeholder="Number" style={{ marginLeft: 8, border: '1px solid #ccc', borderRadius: 6, padding: '4px 8px' }} />
                            </div>
                        </div>
                    )}
                    <button style={{ marginTop: 18, background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 'bold', cursor: 'pointer' }} onClick={() => setSettingsModal({ show: false, widgetId: null })}>Save</button>
                </div>
            </div>
        );
    };
    // Modal widget positions state (for flowchart modal)
    const initialModalPositions: Record<string, { left: number, top: number }> = {};
    // Place a combined Channels container (holds individual channel handles visually)
    initialModalPositions['channels-box'] = { left: 60, top: 80 };
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
    // Use FlowModalContext for modal state
    const { showFlowModal, setShowFlowModal } = require('@/context/FlowModalContext').useFlowModal();
    // List of all possible widgets in the flow (initially based on flowchart)
    // Channel configuration: default show 3 channels, up to MAX_CHANNELS
    const MAX_CHANNELS = 16;
    const DEFAULT_CHANNEL_COUNT = 1;
    const [channelCount, setChannelCount] = useState<number>(DEFAULT_CHANNEL_COUNT);

    // Generate initial flow options with default channelCount
    const initialFlowOptions: Array<{ id: string, label: string, type: string, selected: boolean }> = [];
    for (let ch = 1; ch <= DEFAULT_CHANNEL_COUNT; ch++) {
        initialFlowOptions.push({ id: `channel-${ch}`, label: `Channel ${ch}`, type: 'channel', selected: true });
    }
    // By default we only include the configured channels in the flowchart.
    // Other applications (spiderplot, FFT, Bandpower, etc.) can be added by the user
    // using the drag-and-drop Applications palette into the flow modal.
    const [flowOptions, setFlowOptions] = useState(initialFlowOptions);

    // Handlers to increase/decrease visible channels in the combined widget
    const increaseChannels = useCallback(() => {
        setChannelCount(prev => {
            const next = Math.min(MAX_CHANNELS, prev + 1);
            if (next > prev) {
                setFlowOptions(prevOpts => {
                    const others = prevOpts.filter(o => !o.id.startsWith('channel-'));
                    const channels = Array.from({ length: next }).map((_, i) => ({ id: `channel-${i + 1}`, label: `Channel ${i + 1}`, type: 'channel', selected: true }));
                    return [...channels, ...others];
                });
            }
            return next;
        });
    }, [MAX_CHANNELS]);

    const decreaseChannels = useCallback(() => {
        setChannelCount(prev => {
            const next = Math.max(1, prev - 1);
            if (next < prev) {
                // Remove channels > next from flowOptions and connections
                setFlowOptions(prevOpts => prevOpts.filter(o => {
                    if (!o.id.startsWith('channel-')) return true;
                    const idx = Number(o.id.split('-')[1]);
                    return idx <= next;
                }));
                setConnections(prevConn => prevConn.filter(c => {
                    const fromIdx = c.from.startsWith('channel-') ? Number(c.from.split('-')[1]) : -1;
                    const toIdx = c.to.startsWith('channel-') ? Number(c.to.split('-')[1]) : -1;
                    if (fromIdx > next || toIdx > next) return false;
                    return true;
                }));
            }
            return next;
        });
    }, []);
    // Connections between widgets (user-created)
    const [connections, setConnections] = useState<Array<{ from: string, to: string }>>([]);
    // Widget collection state with default basic widget (no make-connection widget)
    const [widgets, setWidgets] = useState<Widget[]>([
        {
            id: 'basic-channel',
            x: 10,
            y: 7,
            width: 5,
            height: 4,
            minWidth: 5,
            minHeight: 4,
            type: 'basic',
        },
    ]);
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
            defaultWidth = 5;
            defaultHeight = 4;
            minWidth = 5;
            minHeight = 4;
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
     * Add widget at a specific grid column/row (if possible).
     * If the requested cell is occupied, falls back to auto-placement.
     */
    const handleAddWidgetAt = useCallback((type: string, col: number, row: number) => {
        // Determine default sizes (mirror handleAddWidget logic)
        let defaultWidth = 2;
        let defaultHeight = 2;
        let minWidth = 1;
        let minHeight = 1;
        if (type === 'basic') {
            defaultWidth = 5; defaultHeight = 4; minWidth = 5; minHeight = 4;
        } else if (type === 'spiderplot') {
            defaultWidth = 6; defaultHeight = 6; minWidth = 4; minHeight = 4;
        } else if (type === 'FFTGraph') {
            defaultWidth = 6; defaultHeight = 5; minWidth = 4; minHeight = 3;
        } else if (type === 'channel') {
            defaultWidth = 4; defaultHeight = 3; minWidth = 3; minHeight = 2;
        } else if (type === 'bandpower') {
            defaultWidth = 5; defaultHeight = 4; minWidth = 4; minHeight = 3;
        } else if (type === 'candle') {
            defaultWidth = 4; defaultHeight = 4; minWidth = 3; minHeight = 3;
        } else if (type === 'game') {
            defaultWidth = 6; defaultHeight = 4; minWidth = 4; minHeight = 3;
        } else if (type === 'bargraph' || type === 'statistic') {
            defaultWidth = 5; defaultHeight = 4; minWidth = 3; minHeight = 3;
        }

        // Clamp to grid bounds
        const clampedCol = Math.max(0, Math.min(col, (gridSettings.cols || 24) - defaultWidth));
        const clampedRow = Math.max(0, Math.min(row, (gridSettings.rows || 16) - defaultHeight));

        // If space available at requested spot, place it there
        if (!checkCollisionAtPosition(widgets, 'temp', clampedCol, clampedRow, defaultWidth, defaultHeight, gridSettings)) {
            const newWidget: Widget = {
                id: `widget-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                x: clampedCol,
                y: clampedRow,
                width: defaultWidth,
                height: defaultHeight,
                minWidth,
                minHeight,
                type,
            };
            setWidgets(prev => [...prev, newWidget]);
            showToast(`${type} widget added`, 'success');
            return;
        }

        // Fallback: use automatic placement if requested cell is busy
        handleAddWidget(type);
    }, [widgets, gridSettings, showToast, handleAddWidget]);

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
            candle: 'Candle',
            game: 'Game',
            bandpower: 'Bandpower',
            basic: 'Real-time Signal'
        };
        const label = labelMap[canonical] || type;

        // Create a unique id for every dropped instance so multiple copies are allowed
        const id = `${canonical}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

        // Add to flowOptions so it's rendered in the flow modal
        setFlowOptions(prev => [...prev, { id, label, type: canonical, selected: true }]);

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
                                        { id: 'channel', label: 'Channel' },
                                        { id: 'candle', label: 'Candle' },
                                        { id: 'game', label: 'Game' },
                                        { id: 'bandpower', label: 'Bandpower' },
                                        { id: 'basic', label: 'Real-time Signal' },
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
                                        markerEnd="url(#arrowhead)"
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

                                    const path = computeAvoidingPath(startX, startY, endX, endY, obstacles, [from, to]);
                                    return (
                                        <path key={idx} d={path} stroke="#2563eb" strokeWidth={2.5} fill="none" markerEnd="url(#arrowhead)" strokeLinecap="round" strokeLinejoin="round" />
                                    );
                                })}
                                <defs>
                                    <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto" markerUnits="strokeWidth">
                                        <polygon points="0 0, 6 2, 0 4" fill="#2563eb" />
                                    </marker>
                                </defs>
                            </svg>
                            {/* Auto-flow arrows removed per cleanup request */}
                            {/* Flowchart nodes as boxes */}
                            {/* Combined Channels box: visually represent all channels inside one widget but keep individual channel ids for connections */}
                            {(() => {
                                // use `channelCount` state to determine how many channels to display
                                const boxPos = modalPositions['channels-box'] || { left: 60, top: 80 };
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
                                const desiredHeight = headerHeight + channelCount * rowHeight + 12;
                                if (desiredHeight > maxAllowedHeight) {
                                    // Reduce rowHeight to fit, but don't go below a reasonable minimum
                                    rowHeight = Math.max(10, Math.floor((maxAllowedHeight - headerHeight - 12) / channelCount));
                                }
                                const boxHeight = headerHeight + channelCount * rowHeight + 12;
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
                                                    onClick={e => { e.stopPropagation(); setSettingsModal({ show: true, widgetId: 'channels-box' }); }}
                                                    title="Settings"
                                                >
                                                    ⚙
                                                </button>
                                            </div>
                                        </div>

                                        {/* Channels list: switch to 2-column compact layout when vertical space is tight */}
                                        {(() => {
                                            const minSingleColHeight = headerHeight + channelCount * 12 + 12; // if below this, prefer multi-column
                                            const useTwoColumns = boxHeight < minSingleColHeight || rowHeight < 12;
                                            if (!useTwoColumns) {
                                                // single column
                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4, paddingBottom: 4, overflow: 'visible' }}>
                                                        {Array.from({ length: channelCount }).map((_, idx) => {
                                                            const n = idx + 1;
                                                            const circleR = Math.max(2, Math.floor(rowHeight * 0.16));
                                                            const svgSize = Math.max(10, Math.floor(circleR * 2 + 2));
                                                            return (
                                                                <div key={n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `3px 6px`, borderRadius: 4, height: rowHeight }}>
                                                                    <svg
                                                                        data-widgetid={`channel-${n}`}
                                                                        data-handle="input"
                                                                        width={svgSize}
                                                                        height={svgSize}
                                                                        style={{ cursor: drawingConnection ? 'pointer' : 'default' }}
                                                                        onMouseUp={e => {
                                                                            e.stopPropagation();
                                                                            if (drawingConnection && drawingConnection.from !== `channel-${n}`) {
                                                                                inputHandledRef.current = true;
                                                                                setConnections(prev => {
                                                                                    const exists = prev.some(c => c.from === drawingConnection.from && c.to === `channel-${n}`);
                                                                                    if (exists) return prev;
                                                                                    return [...prev, { from: drawingConnection.from, to: `channel-${n}` }];
                                                                                });
                                                                                setDrawingConnection(null);
                                                                                setMousePos(null);
                                                                                setTimeout(() => { inputHandledRef.current = false; }, 0);
                                                                            }
                                                                        }}
                                                                    >
                                                                        <circle cx={svgSize / 2} cy={svgSize / 2} r={circleR} fill="#fff" stroke="#2563eb" strokeWidth={1} />
                                                                    </svg>

                                                                    <span style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 600 }}>Channel {n}</span>

                                                                    <svg
                                                                        data-widgetid={`channel-${n}`}
                                                                        data-handle="output"
                                                                        width={svgSize}
                                                                        height={svgSize}
                                                                        style={{ cursor: 'crosshair' }}
                                                                            onMouseDown={e => {
                                                                                e.stopPropagation();
                                                                                const center = getCircleCenter(`channel-${n}`, 'output');
                                                                                if (center) {
                                                                                    setDrawingConnection({ from: `channel-${n}`, startX: center.x, startY: center.y });
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
                                                                                        setDrawingConnection({ from: `channel-${n}`, startX, startY });
                                                                                        setMousePos({ x: startX, y: startY });
                                                                                    } catch (err) {
                                                                                        const startX = boxPos.left + boxWidth;
                                                                                        const startY = effectiveTop + headerHeight + idx * rowHeight + Math.floor(rowHeight / 2);
                                                                                        setDrawingConnection({ from: `channel-${n}`, startX, startY });
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
                                            const rowsLayout = Math.ceil(channelCount / colsLayout);
                                            return (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4, paddingBottom: 4 }}>
                                                    {Array.from({ length: rowsLayout }).map((_, rowIdx) => {
                                                        const leftIndex = rowIdx * colsLayout + 1;
                                                        const rightIndex = leftIndex + 1;
                                                        return (
                                                            <div key={rowIdx} style={{ display: 'flex', gap: 6, alignItems: 'center', height: rowHeight }}>
                                                                {[leftIndex, rightIndex].map((n, posIdx) => {
                                                                    if (n > channelCount) return <div key={posIdx} style={{ flex: 1 }} />;
                                                                    const circleR = Math.max(2, Math.floor(rowHeight * 0.16));
                                                                    const svgSize = Math.max(10, Math.floor(circleR * 2 + 2));
                                                                    return (
                                                                        <div key={n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 6px', borderRadius: 4, flex: 1 }}>
                                                                            <svg
                                                                                data-widgetid={`channel-${n}`}
                                                                                data-handle="input"
                                                                                width={svgSize}
                                                                                height={svgSize}
                                                                                style={{ cursor: drawingConnection ? 'pointer' : 'default' }}
                                                                                onMouseUp={e => {
                                                                                    e.stopPropagation();
                                                                                    if (drawingConnection && drawingConnection.from !== `channel-${n}`) {
                                                                                        inputHandledRef.current = true;
                                                                                        setConnections(prev => {
                                                                                            const exists = prev.some(c => c.from === drawingConnection.from && c.to === `channel-${n}`);
                                                                                            if (exists) return prev;
                                                                                            return [...prev, { from: drawingConnection.from, to: `channel-${n}` }];
                                                                                        });
                                                                                        setDrawingConnection(null);
                                                                                        setMousePos(null);
                                                                                        setTimeout(() => { inputHandledRef.current = false; }, 0);
                                                                                    }
                                                                                }}
                                                                            >
                                                                                <circle cx={svgSize / 2} cy={svgSize / 2} r={circleR} fill="#fff" stroke="#2563eb" strokeWidth={1} />
                                                                            </svg>

                                                                            <span style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 600 }}>Ch {n}</span>

                                                                            <svg
                                                                                data-widgetid={`channel-${n}`}
                                                                                data-handle="output"
                                                                                width={svgSize}
                                                                                height={svgSize}
                                                                                style={{ cursor: 'crosshair' }}
                                                                                onMouseDown={e => {
                                                                                    e.stopPropagation();
                                                                                    const center = getCircleCenter(`channel-${n}`, 'output');
                                                                                    if (center) {
                                                                                        setDrawingConnection({ from: `channel-${n}`, startX: center.x, startY: center.y });
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
                                                                                                setDrawingConnection({ from: `channel-${n}`, startX, startY });
                                                                                                setMousePos({ x: startX, y: startY });
                                                                                            } catch (err) {
                                                                                                const colOffset = posIdx === 0 ? 0 : boxWidth / 2;
                                                                                                const startX = boxPos.left + colOffset + Math.floor(boxWidth / 2);
                                                                                                const startY = effectiveTop + headerHeight + rowIdx * rowHeight + Math.floor(rowHeight / 2);
                                                                                                setDrawingConnection({ from: `channel-${n}`, startX, startY });
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
                                if (opt.id.startsWith('channel-')) return null;
                                const widgetId = opt.id;
                                const defaultLeft = 200 + (idx % 3) * 220;
                                const defaultTop = 100 + Math.floor(idx / 3) * 120;
                                const widgetLeft = modalPositions[widgetId]?.left ?? defaultLeft;
                                const widgetTop = modalPositions[widgetId]?.top ?? defaultTop;
                                const widgetWidth = opt.type === 'bandpower' ? 220 : 180;
                                const widgetHeight = 70;

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
                                            <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
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
                                            </div>
                                            <span style={{ flex: 1, wordBreak: 'break-word', overflowWrap: 'break-word', textAlign: 'center', fontWeight: 600 }}>{opt.label}</span>
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
                                                        setSettingsModal({ show: true, widgetId });
                                                    }}
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="7" stroke="white" strokeWidth="1.5" /><path d="M10 7V10L12 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                                </button>
                                                <svg style={{ marginLeft: 8, marginRight: 0, zIndex: 100 }} width={14} height={14}>
                                                    <svg
                                                        data-widgetid={widgetId}
                                                        data-handle="output"
                                                        style={{ cursor: 'crosshair', marginLeft: 8, marginRight: 0, zIndex: 100 }}
                                                        width={14}
                                                        height={14}
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
                                                        <circle cx={7} cy={7} r={2.5} fill="#fff" stroke="#2563eb" strokeWidth={1.1} />
                                                    </svg>
                                                    <div
                                                        style={{ position: 'absolute', left: -7, top: '50%', transform: 'translateY(-50%)', zIndex: 100, width: 14, height: 14, cursor: drawingConnection ? 'pointer' : 'default' }}
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
                                                        <svg width={14} height={14}>
                                                            <circle cx={7} cy={7} r={2.5} fill="#fff" stroke="#2563eb" strokeWidth={1.1} />
                                                        </svg>
                                                    </div>
                                                </svg>
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
                                        bandpower: 'statistic',
                                    };
                                    const selectedWidgets = flowOptions.filter(opt => opt.selected);
                                    // Get grid settings and offsets
                                    const cols = gridSettings.cols || 24;
                                    const rows = gridSettings.rows || 16;
                                    const offsetX = gridSettings.offsetX || 0;
                                    const offsetY = gridSettings.offsetY || 0;
                                    // Calculate grid arrangement
                                    const count = selectedWidgets.length;
                                    // Always use 3 rows to match flowchart channels
                                    const gridRows = 3;
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
                                    // Arrange widgets in dashboard in the same order and grid as flowchart
                                    const widgetTypes = ['channel', 'spiderplot', 'fft', 'bandpower'];
                                    const channels = [1, 2, 3];
                                    channels.forEach((ch, rowIdx) => {
                                        widgetTypes.forEach((type, colIdx) => {
                                                    const widgetId = type === 'channel' ? `channel-${ch}`
                                                        : type === 'spiderplot' ? `spiderplot`
                                                            : type === 'fft' ? `fft`
                                                                : `bandpower`;
                                            const opt = selectedWidgets.find(o => o.id === widgetId);
                                            if (!opt) return;
                                                    // Avoid adding singleton flow items more than once
                                                    if ((widgetId === 'spiderplot' || widgetId === 'fft' || widgetId === 'bandpower') && newWidgets.some(w => w.id === widgetId)) return;
                                            const x = offsetCells + colIdx * dynamicWidgetWidth;
                                            const y = offsetCells + rowIdx * dynamicWidgetHeight;
                                            // Prevent overflow
                                            const safeX = Math.min(x, cols - dynamicWidgetWidth);
                                            const safeY = Math.min(y, rows - dynamicWidgetHeight);
                                            newWidgets.push({
                                                id: opt.id,
                                                x: safeX,
                                                y: safeY,
                                                width: dynamicWidgetWidth,
                                                height: dynamicWidgetHeight,
                                                minWidth: 3,
                                                minHeight: 3,
                                                type: typeMap[opt.type] || opt.type,
                                            });
                                        });
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

                    {/* Dynamic arrows between widgets (coordinates are in grid pixels) */}
                    <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 50 }}>
                        {connections.map(({ from, to }, idx) => {
                            const fromWidget = widgets.find(w => w.id === from);
                            const toWidget = widgets.find(w => w.id === to);
                            if (!fromWidget || !toWidget) return null;
                            // Arrow starts at center right of fromWidget, ends at center left of toWidget
                            const startX = (fromWidget.x + fromWidget.width) * gridSettings.cellWidth;
                            const startY = (fromWidget.y + fromWidget.height / 2) * gridSettings.cellHeight;
                            const endX = toWidget.x * gridSettings.cellWidth;
                            const endY = (toWidget.y + toWidget.height / 2) * gridSettings.cellHeight;
                            // Build obstacle boxes from widgets for routing
                            const obstacles = widgets.map(w => ({ left: w.x * gridSettings.cellWidth, top: w.y * gridSettings.cellHeight, right: (w.x + w.width) * gridSettings.cellWidth, bottom: (w.y + w.height) * gridSettings.cellHeight, id: w.id }));
                            const path = computeAvoidingPath(startX, startY, endX, endY, obstacles, [from, to]);
                            return (
                                <g key={idx}>
                                    <path d={path} stroke="#90cdf4" strokeWidth={1.5} fill="none" markerEnd="url(#arrowhead)" strokeLinecap="round" strokeLinejoin="round" />
                                </g>
                            );
                        })}
                        <defs>
                            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto" markerUnits="strokeWidth">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#90cdf4" />
                            </marker>
                        </defs>
                    </svg>

                    {/* Render all widgets positioned by grid pixels inside the sized container */}
                    {widgets.map(widget => (
                        <DraggableWidget
                            key={widget.id}
                            widget={widget}
                            widgets={widgets}
                            onRemove={handleRemoveWidget}
                            gridSettings={gridSettings}
                            dragState={dragState}
                            setDragState={setDragState}
                            onUpdateWidget={handleUpdateWidget}
                            incomingConnections={connections.filter(c => c.to === widget.id).map(c => c.from)}
                        />
                    ))}

                    {/* Popover rendered outside the widget, anchored near the connection controls */}
                </div>
            </div>

            <Toast toast={toast} onClose={hideToast} />
            <ConfirmModal confirm={confirm} />
        </div>
    );
};

export default Widgets;