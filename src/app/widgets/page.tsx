'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import DraggableWidget from '@/components/DraggableWidget';
import WidgetPalette from '@/components/WidgetPalette';
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
    // Modal widget positions state (for flowchart modal)
    const initialModalPositions: Record<string, {left: number, top: number}> = {};
    for (let ci = 0; ci < 3; ci++) {
        for (let cj = 0; cj < 4; cj++) {
            const id = cj === 0 ? `channel-${ci+1}` : cj === 1 ? `spider-${ci+1}` : cj === 2 ? `fft-${ci+1}` : `bandpower-${ci+1}`;
        initialModalPositions[id] = { left: 200 + cj * 220, top: 100 + ci * 120 };
        }
    }
    const [modalPositions, setModalPositions] = useState<Record<string, {left: number, top: number}>>(initialModalPositions);
    // Use FlowModalContext for modal state
    const { showFlowModal, setShowFlowModal } = require('@/context/FlowModalContext').useFlowModal();
    // List of all possible widgets in the flow (initially based on flowchart)
    const initialFlowOptions = [
        { id: 'channel-1', label: 'Channel 1', type: 'channel', selected: true },
        { id: 'spider-1', label: 'Spider Plot Ch1', type: 'spiderplot', selected: true },
        { id: 'fft-1', label: 'FFT of Ch1', type: 'fft', selected: true },
        { id: 'bandpower-1', label: 'Bandpower Graph of Channel 1', type: 'bandpower', selected: true },
        { id: 'channel-2', label: 'Channel 2', type: 'channel', selected: true },
        { id: 'spider-2', label: 'Spider Plot Ch2', type: 'spiderplot', selected: true },
        { id: 'fft-2', label: 'FFT of Ch2', type: 'fft', selected: true },
        { id: 'bandpower-2', label: 'Bandpower Graph of Channel 2', type: 'bandpower', selected: true },
        { id: 'channel-3', label: 'Channel 3', type: 'channel', selected: true },
        { id: 'spider-3', label: 'Spider Plot Ch3', type: 'spiderplot', selected: true },
        { id: 'fft-3', label: 'FFT of Ch3', type: 'fft', selected: true },
        { id: 'bandpower-3', label: 'Bandpower Graph of Channel 3', type: 'bandpower', selected: true },
    ];
    const [flowOptions, setFlowOptions] = useState(initialFlowOptions);
    // Example connections: array of {from, to} widget ids
    const [connections, setConnections] = useState<Array<{ from: string, to: string }>>([
        { from: 'make-connection', to: 'basic-channel' },
    ]);
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
            const SIDEBAR_WIDTH_COLLAPSED = 64; // w-16 (px)
            const HEADER_HEIGHT = 64; // h-16 (px)
            const sidebarWidth = SIDEBAR_WIDTH_COLLAPSED;
            const headerHeight = HEADER_HEIGHT;
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            // Calculate usable area for widgets
            const usableWidth = screenWidth - sidebarWidth;
            const usableHeight = screenHeight - headerHeight;

            // Choose desired number of columns and rows (can be made configurable)
            const targetCols = 24;
            const targetRows = 16;

            // Dynamically calculate cell size to fill available area exactly
            const cellWidth = usableWidth / targetCols;
            const cellHeight = usableHeight / targetRows;

            setGridSettings(prev => ({
                ...prev,
                cols: targetCols,
                rows: targetRows,
                cellWidth,
                cellHeight,
                offsetX: sidebarWidth,
                offsetY: headerHeight
            }));

            // Constrain existing widgets to new grid boundaries
            setWidgets(prevWidgets => 
                prevWidgets.map(widget => {
                    // Prevent widgets from overlapping header/sidebar
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
            setConnections(prev => [...prev, { from: 'make-connection', to: newWidget.id }]);
            showToast(`${type} widget added`, 'success');
        } else {
            showToast('No space available for new widget', 'error');
        }
    }, [widgets, gridSettings, showToast]);

    /**
     * Remove widget by ID
     */
    const handleRemoveWidget = useCallback((id: string) => {
    setWidgets(prev => prev.filter(widget => widget.id !== id));
    setFlowOptions(prev => prev.filter(opt => opt.id !== id));
    showToast('Widget removed', 'info');
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
                // Prevent widgets from moving over header/sidebar
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
                // Prevent widgets from moving over header/sidebar
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
            setDragState(prev => ({
                ...prev,
                isDragging: false,
                dragType: null,
                activeWidgetId: null
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
                        minWidth: 1200,
                        maxWidth: 1400,
                        width: '90vw',
                        position: 'relative',
                        overflow: 'auto',
                        margin: 'auto',
                    }}>
                        <button
                            style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', fontSize: 22, color: '#2563eb', cursor: 'pointer' }}
                            onClick={() => setShowFlowModal(false)}
                        >
                            &times;
                        </button>
                        <h2 style={{ fontWeight: 'bold', fontSize: 22, marginBottom: 16 }}>Configure Flow</h2>
                        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                            <button
                                style={{ background: '#2563eb', color: 'white', padding: '8px 18px', borderRadius: 8, fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 16 }}
                                onClick={() => {
                                    // Download flowchart layout as JSON file
                                    try {
                                        const layout = {
                                            modalPositions,
                                            flowOptions,
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
                                                    if (layout.modalPositions && layout.flowOptions) {
                                                        setModalPositions(layout.modalPositions);
                                                        setFlowOptions(layout.flowOptions);
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
                        </div>
                        {/* Flowchart grid layout */}
                        <div style={{ position: 'relative', width: 1200, height: 500, margin: 'auto', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 32px rgba(0,0,0,0.08)', overflow: 'hidden', background: '#fff' }}>
                            {/* Dynamic SVG arrows connecting widgets */}
                            <svg style={{ position: 'absolute', left: 0, top: 0, width: '1200px', height: '500px', pointerEvents: showConnectionModal ? 'none' : 'auto', zIndex: showConnectionModal ? 0 : 1 }}>
                                {/* Arrows from Make Connection to first widget in each channel */}
                                {(() => {
                                    const makeConnId = 'make-connection';
                                    const makeConnPos = { left: 10, top: 225, width: 120, height: 60 };
                                    // If you want to make Make Connection draggable, use modalPositions[makeConnId]
                                    const startX = makeConnPos.left + makeConnPos.width;
                                    const startY = makeConnPos.top + makeConnPos.height / 2;
                                    return [0,1,2].map(i => {
                                        // Find first widget in channel
                                        const j = 0;
                                        const id = j === 0 ? `channel-${i+1}` : j === 1 ? `spider-${i+1}` : j === 2 ? `fft-${i+1}` : `bandpower-${i+1}`;
                                        const opt = flowOptions.find(o => o.id === id);
                                        if (!opt) return null;
                                        const pos = modalPositions[id] || { left: 150 + j * 260, top: 100 + i * 120 };
                                        const width = 180;
                                        const height = 70;
                                        const endX = pos.left;
                                        const endY = pos.top + height / 2;
                                        // Bezier curve arch
                                        const controlX = (startX + endX) / 2;
                                        const controlY = startY - 80 + i * 80;
                                        const path = `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
                                        return (
                                            <path key={`makeconn-arrow-${i}`} d={path} stroke="#2563eb" strokeWidth={2.5} fill="none" markerEnd="url(#arrowhead)" />
                                        );
                                    });
                                })()}
                                {[0,1,2].map(i => {
                                    // Get widgets for this channel in order
                                    const widgetPositions = [0,1,2,3].map(j => {
                                        const id = j === 0 ? `channel-${i+1}` : j === 1 ? `spider-${i+1}` : j === 2 ? `fft-${i+1}` : `bandpower-${i+1}`;
                                        const opt = flowOptions.find(o => o.id === id);
                                        if (!opt) return null;
                                      const pos = modalPositions[id] || { left: 200 + j * 220, top: 100 + i * 120 };
                                        const width = j === 3 ? 220 : 180;
                                        const height = 70;
                                        return { left: pos.left, top: pos.top, width, height, idx: j, opt };
                                    }).filter(Boolean);
                                    // Draw arrows between consecutive present widgets
                                    return widgetPositions.slice(0, -1).map((from, k) => {
                                        const to = widgetPositions[k+1];
                                        if (!from || !to) return null;
                                        // Arrow from center right of 'from' to center left of 'to'
                                        const startX = from.left + from.width;
                                        const startY = from.top + from.height/2;
                                        const endX = to.left;
                                        const endY = to.top + to.height/2;
                                        // Use a cubic Bezier for a nice curve
                                        const dx = Math.abs(endX - startX);
                                        const controlOffset = Math.max(60, dx / 2);
                                        const c1x = startX + controlOffset;
                                        const c1y = startY;
                                        const c2x = endX - controlOffset;
                                        const c2y = endY;
                                        const path = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
                                        return (
                                            <path key={`arrow-${i}-${from.idx}-${to.idx}`} d={path} stroke="#2563eb" strokeWidth={2.5} fill="none" markerEnd="url(#arrowhead)" />
                                        );
                                    });
                                })}
                                <defs>
                                    <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto" markerUnits="strokeWidth">
                                        <polygon points="0 0, 6 2, 0 4" fill="#2563eb" />
                                    </marker>
                                </defs>
                            </svg>
                            {/* Flowchart nodes as boxes */}
                            {/* Connection box with connection type selection and modal logic */}
                            <div style={{ position: 'absolute', left: 10, top: 225, width: 120, height: 60, border: '2px solid #2563eb', borderRadius: 12, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 15, zIndex: 2, boxShadow: '0 2px 12px rgba(37,99,235,0.08)', letterSpacing: 0.5 }}>
                                <button  onClick={() => setShowConnectionModal(true)}>
                                    Make Connection
                                </button>
                                {showConnectionModal && (
                                    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 99999, pointerEvents: 'auto' }}>
                                        <div
                                            style={{
                                                position: 'fixed',
                                                top: 0,
                                                left: 0,
                                                width: '100vw',
                                                height: '100vh',
                                                background: 'rgba(0,0,0,0.35)',
                                                zIndex: 99999,
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
                                                background: 'white',
                                                borderRadius: 16,
                                                boxShadow: '0 12px 48px rgba(0,0,0,0.32)',
                                                border: '2px solid #2563eb',
                                                padding: 40,
                                                minWidth: 420,
                                                maxWidth: 520,
                                                zIndex: 100000,
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
                            </div>
                            {/* Channel boxes and widgets for 3 channels */}
                            {[0,1,2].map(i => (
                                <React.Fragment key={i}>
                                    {[0,1,2,3].map(j => {
                                        const typeMap = ['channel', 'spiderplot', 'fft', 'bandpower'];
                                        const opt = flowOptions.find(o => o.id === `channel-${i+1}` && j === 0
                                            || o.id === `spider-${i+1}` && j === 1
                                            || o.id === `fft-${i+1}` && j === 2
                                            || o.id === `bandpower-${i+1}` && j === 3);
                                        if (!opt) return null;
                                        const widgetId = opt.id;
                                        const widgetLeft = modalPositions[widgetId]?.left ?? (200 + j * 220);
                                        const widgetTop = modalPositions[widgetId]?.top ?? (100 + i * 120);
                                        const widgetWidth = j === 3 ? 220 : 180;
                                        const widgetHeight = 70;
                                        // Drag logic
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
                                                // Snap to grid (10px)
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
                                                key={j}
                                                style={{ position: 'absolute', left: widgetLeft, top: widgetTop, width: widgetWidth, height: widgetHeight, border: '2px solid #222', borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14, zIndex: showConnectionModal ? 0 : 2, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', transition: 'box-shadow 0.2s', gap: 8, padding: '0 10px', wordBreak: 'break-word', overflowWrap: 'break-word', textAlign: 'center', cursor: showConnectionModal ? 'default' : 'move', pointerEvents: showConnectionModal ? 'none' : 'auto' }}
                                                onMouseDown={handleDrag}
                                            >
                                                <span style={{ marginLeft: 8, flex: 1, wordBreak: 'break-word', overflowWrap: 'break-word', textAlign: 'center' }}>{opt.label}</span>
                                                <button style={{ marginLeft: 8, background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, padding: '4px 12px', cursor: showConnectionModal ? 'default' : 'pointer', fontWeight: 500, fontSize: 13, boxShadow: '0 1px 4px rgba(239,68,68,0.08)', pointerEvents: showConnectionModal ? 'none' : 'auto' }} onClick={() => {
                                                    if (showConnectionModal) return;
                                                    setFlowOptions(flowOptions.filter(o => o.id !== opt.id));
                                                    setWidgets(prev => prev.filter(widget => widget.id !== opt.id));
                                                }}>Delete</button>
                                            </div>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </div>
                        <button
                            style={{ marginTop: 24, background: '#10B981', color: 'white', padding: '10px 24px', borderRadius: 8, fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 18 }}
                            onClick={() => {
                                setShowFlowModal(false);
                                // Only show selected widgets in dashboard
                                setWidgets(prev => {
                                    // Map flowOptions to widget type and order
                                    const typeMap: Record<string, string> = {
                                        channel: 'basic',
                                        fft: 'FFTGraph',
                                        spiderplot: 'spiderplot',
                                        bandpower: 'statistic',
                                    };
                                    // Strictly follow flowchart grid: 3 rows (channels), 4 columns (widget types)
                                    const channelIds = [1, 2, 3];
                                    const widgetTypes = ['channel', 'spiderplot', 'fft', 'bandpower'];
                                    let newWidgets: Widget[] = [];
                                    // Count selected widgets per type for compact arrangement
                                    const selectedWidgets = flowOptions.filter(opt => opt.selected);
                                    let colMap: Record<string, number> = {};
                                    let row = 2;
                                    let col = 2;
                                    selectedWidgets.forEach((opt, idx) => {
                                        // Assign columns by widget type, rows by channel
                                        if (colMap[opt.type] === undefined) colMap[opt.type] = Object.keys(colMap).length;
                                        const colIdx = colMap[opt.type];
                                        // Extract channel number from id (e.g., 'spider-2' -> 2)
                                        const chMatch = opt.id.match(/-(\d+)$/);
                                        const rowIdx = chMatch ? parseInt(chMatch[1], 10) - 1 : idx;
                                        newWidgets.push({
                                            id: opt.id,
                                            x: 2 + colIdx * 5,
                                            y: 2 + rowIdx * 4,
                                            width: 5,
                                            height: 4,
                                            minWidth: 3,
                                            minHeight: 3,
                                            type: typeMap[opt.type] || opt.type,
                                        });
                                    });
                                    return newWidgets;
                                });
                            }}
                        >Play</button>
                    </div>
                </div>
            )}
            <div
                className="flex flex-wrap items-stretch justify-center w-full h-full p-6 gap-6"
                style={{ minHeight: `calc(100vh - ${(gridSettings.offsetY || 64)}px)` }}
            >
                {GridLines}
                {/* Dynamic arrows between widgets */}
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
                        // Control points for cubic Bezier curve
                        const dx = Math.abs(endX - startX);
                        const controlOffset = Math.max(60, dx / 2);
                        const c1x = startX + controlOffset;
                        const c1y = startY;
                        const c2x = endX - controlOffset;
                        const c2y = endY;
                        const path = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
                        return (
                            <g key={idx}>
                                <path d={path} stroke="#90cdf4" strokeWidth={1.5} fill="none" markerEnd="url(#arrowhead)" />
                            </g>
                        );
                    })}
                    <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto" markerUnits="strokeWidth">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#90cdf4" />
                        </marker>
                    </defs>
                </svg>
                {/* Render all widgets in the grid, including new ones from sidebar */}
                {widgets.map(widget => (
                    <div
                        key={widget.id}
                        style={{ flex: '1 1 320px', minWidth: 280, maxWidth: 480, display: 'flex', alignItems: 'stretch', justifyContent: 'center' }}
                    >
                        <DraggableWidget
                            widget={widget}
                            widgets={widgets}
                            onRemove={handleRemoveWidget}
                            gridSettings={gridSettings}
                            dragState={dragState}
                            setDragState={setDragState}
                            onUpdateWidget={handleUpdateWidget}
                        />
                    </div>
                ))}
                {/* Popover rendered outside the widget, anchored near the Make Connection widget */}
            </div>

            <WidgetPalette 
                onAddWidget={handleAddWidget}
                widgets={widgets}
                gridSettings={gridSettings}
                onLoadLayout={handleLoadLayout}
                showToast={showToast}
                showConfirm={showConfirm}
            />

            <Toast toast={toast} onClose={hideToast} />
            <ConfirmModal confirm={confirm} />
        </div>
    );
};

export default Widgets;