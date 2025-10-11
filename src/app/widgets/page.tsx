'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import DraggableWidget from '@/components/DraggableWidget';
import WidgetPalette from '@/components/WidgetPalette';
import Toast from '@/components/ui/Toast';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { Widget, GridSettings, DragState, ToastState, ConfirmState } from '@/types/widget.types';
import { checkCollisionAtPosition } from '@/utils/widget.utils';
import ConnectionSelectorWidget from '@/components/ConnectionSelectorWidget';
import ConnectionDataWidget from '@/components/ConnectionDataWidget';
import { v4 as uuidv4 } from 'uuid';

/**
 * Main Widgets component - Orchestrates the entire widget dashboard
 * Manages widget state, grid settings, drag operations, and user interactions
 */
const Widgets: React.FC = () => {
    // Modal state for flow configuration
    const [showFlowModal, setShowFlowModal] = useState(false);
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
    // Widget collection state with default basic widget (positioned for testing movement)
    const [widgets, setWidgets] = useState<Widget[]>([
        {
            id: 'make-connection',
            x: 2,
            y: 6,
            width: 6,
            height: 4,
            minWidth: 4,
            minHeight: 3,
            type: 'make-connection',
        },
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
        <div className="min-h-screen w-screen bg-gray-100 relative overflow-hidden">
            {/* Configure Flow Button */}
            <button
                style={{ position: 'fixed', top: 24, right: 32, zIndex: 10000, background: '#2563eb', color: 'white', padding: '10px 20px', borderRadius: 8, fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                onClick={() => setShowFlowModal(true)}
            >
                Configure Flow
            </button>
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
                    }}>
                        <button
                            style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', fontSize: 22, color: '#2563eb', cursor: 'pointer' }}
                            onClick={() => setShowFlowModal(false)}
                        >
                            &times;
                        </button>
                        <h2 style={{ fontWeight: 'bold', fontSize: 22, marginBottom: 16 }}>Configure Flow</h2>
                        {/* Flowchart grid layout */}
                        <div style={{ position: 'relative', width: 1200, height: 500, margin: '0 auto', background: 'linear-gradient(90deg,#f3f4f6 1px,transparent 1px),linear-gradient(#f3f4f6 1px,transparent 1px)', backgroundSize: '100px 100px', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 32px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                            {/* SVG arrows: connect Make Connection (center) to each channel's first widget */}
                            <svg style={{ position: 'absolute', left: 0, top: 0, width: '1200px', height: '500px', pointerEvents: 'none', zIndex: 1 }}>
                                {/* Calculate vertical center for Make Connection */}
                                {(() => {
                                    const makeConnLeft = 70;
                                    const makeConnTop = 225; // vertical center for 500px height, box height 60px
                                    const makeConnCenterY = makeConnTop + 30;
                                    const channelStarts = [80, 180, 280];
                                    return channelStarts.map((chY, i) => {
                                        // Only draw arrow if the first widget in channel exists
                                        if (!flowOptions[i*4]) return null;
                                        return <path key={`conn-arrow-${i}`} d={`M ${makeConnLeft+60} ${makeConnCenterY} Q 140 ${chY} 210 ${chY}`} stroke="#2563eb" strokeWidth="2.5" fill="none" markerEnd="url(#arrowhead)" />;
                                    });
                                })()}
                                {/* Channel flows: arrows between widgets in each channel, skipping deleted widgets */}
                                {[0,1,2].map(i => {
                                    // Positions for boxes: lefts = [200, 400, 600, 800], tops = 80 + i*100
                                    const lefts = [200, 400, 600, 800];
                                    const top = 80 + i*100;
                                    // Get widgets for this channel in order
                                    const channelIds = [
                                        `channel-${i+1}`,
                                        `spider-${i+1}`,
                                        `fft-${i+1}`,
                                        `bandpower-${i+1}`
                                    ];
                                    const widgetsInRow = channelIds.map(id => flowOptions.find(o => o.id === id));
                                    // Find indices of present widgets
                                    const present = widgetsInRow.map((w, idx) => w ? idx : null).filter(idx => idx !== null);
                                    // Draw arrows between consecutive present widgets
                                    return present.slice(0, -1).map((fromIdx, k) => {
                                        const toIdx = present[k+1];
                                        if (fromIdx == null || toIdx == null) return null;
                                        return <path key={`ch${i}-arrow-${fromIdx}-${toIdx}`} d={`M ${lefts[fromIdx]+(fromIdx===3?220:180)} ${top} Q ${(lefts[fromIdx]+lefts[toIdx])/2} ${top} ${lefts[toIdx]} ${top}`} stroke="#90cdf4" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />;
                                    });
                                })}
                                <defs>
                                    <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto" markerUnits="strokeWidth">
                                        <polygon points="0 0, 6 2, 0 4" fill="#2563eb" />
                                    </marker>
                                </defs>
                            </svg>
                            {/* Flowchart nodes as boxes */}
                            {/* Connection box */}
                            <div style={{ position: 'absolute', left: 10, top: 225, width: 120, height: 60, border: '2px solid #2563eb', borderRadius: 12, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 15, zIndex: 2, boxShadow: '0 2px 12px rgba(37,99,235,0.08)', letterSpacing: 0.5 }}>
                                Make Connection
                            </div>
                            {/* Channel boxes and widgets for 3 channels */}
                            {[0,1,2].map(i => (
                                <React.Fragment key={i}>
                                    {[0,1,2,3].map(j => {
                                        // Find the widget for channel i and type j
                                        // Types: 0=channel, 1=spiderplot, 2=fft, 3=bandpower
                                        const typeMap = ['channel', 'spiderplot', 'fft', 'bandpower'];
                                        const opt = flowOptions.find(o => o.id === `channel-${i+1}` && j === 0
                                            || o.id === `spider-${i+1}` && j === 1
                                            || o.id === `fft-${i+1}` && j === 2
                                            || o.id === `bandpower-${i+1}` && j === 3);
                                        return (
                                            <div key={j} style={{ position: 'absolute', left: 200 + j*200, top: 60 + i*100, width: j === 3 ? 220 : 180, height: 70, border: opt ? '2px solid #222' : 'none', borderRadius: 12, background: opt ? '#fff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14, zIndex: 2, boxShadow: opt ? '0 2px 12px rgba(0,0,0,0.07)' : 'none', transition: 'box-shadow 0.2s', gap: 8, padding: '0 10px', wordBreak: 'break-word', overflowWrap: 'break-word', textAlign: 'center', visibility: opt ? 'visible' : 'hidden' }}>
                                                {opt && (
                                                    <>
                                                        <input type="checkbox" checked={!!opt.selected} onChange={e => {
                                                            const idx = flowOptions.findIndex(o => o.id === opt.id);
                                                            if (idx === -1) return;
                                                            const updated = [...flowOptions];
                                                            updated[idx].selected = e.target.checked;
                                                            setFlowOptions(updated);
                                                        }} style={{ accentColor: '#2563eb', width: 18, height: 18 }} />
                                                        <span style={{ marginLeft: 8, flex: 1, wordBreak: 'break-word', overflowWrap: 'break-word', textAlign: 'center' }}>{opt.label}</span>
                                                        <button style={{ marginLeft: 8, background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontWeight: 500, fontSize: 13, boxShadow: '0 1px 4px rgba(239,68,68,0.08)' }} onClick={() => {
                                                            setFlowOptions(flowOptions.filter(o => o.id !== opt.id));
                                                            setWidgets(prev => prev.filter(widget => widget.id !== opt.id));
                                                        }}>Delete</button>
                                                    </>
                                                )}
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
                                    // Keep make-connection widget
                                    const baseWidgets = prev.filter(w => w.type === 'make-connection');
                                    // Add selected widgets from flowOptions
                                    const newWidgets = flowOptions.filter(opt => opt.selected).map(opt => ({
                                        id: opt.id,
                                        x: 10, // Default position, can be improved
                                        y: 2 + flowOptions.findIndex(o => o.id === opt.id),
                                        width: 5,
                                        height: 4,
                                        minWidth: 3,
                                        minHeight: 3,
                                        type: opt.type,
                                    }));
                                    return [...baseWidgets, ...newWidgets];
                                });
                            }}
                        >Save</button>
                    </div>
                </div>
            )}
            <div
                className="absolute"
                style={{
                    left: gridSettings.offsetX || 64,
                    width: `calc(100vw - ${(gridSettings.offsetX || 64)}px)`,
                    height: `calc(100vh - ${(gridSettings.offsetY || 64)}px)`
                }}
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
                    <DraggableWidget
                        key={widget.id}
                        widget={widget}
                        widgets={widgets}
                        onRemove={handleRemoveWidget}
                        gridSettings={gridSettings}
                        dragState={dragState}
                        setDragState={setDragState}
                        onUpdateWidget={handleUpdateWidget}
                    >
                        {widget.type === 'make-connection' ? (
                            <div
                                style={{
                                    width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 'bold', fontSize: 20, background: '#f3f4f6', borderRadius: 8, color: '#2563eb', border: '2px dashed #2563eb', position: 'relative'
                                }}
                                onMouseDown={e => e.stopPropagation()}
                            >
                                <span
                                    tabIndex={0}
                                    role="button"
                                    aria-label="Make Connection"
                                    onClick={e => { e.stopPropagation(); setShowConnectionModal(true); }}
                                    style={{ outline: 'none' }}
                                >
                                    Make Connection
                                </span>
                                {showConnectionModal && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            marginTop: 12,
                                            background: 'white',
                                            borderRadius: 12,
                                            boxShadow: '0 2px 16px rgba(0,0,0,0.15)',
                                            padding: 32,
                                            minWidth: 400,
                                            maxWidth: 480,
                                            zIndex: 9999,
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
                                )}
                            </div>
                        ) : null}
            {/* Modal for connection UI */}
                    </DraggableWidget>
                ))}
                {/* Popover rendered outside the widget, anchored near the Make Connection widget */}
                {showConnectionModal && (() => {
                    const makeConnectionWidget = widgets.find(w => w.type === 'make-connection');
                    if (!makeConnectionWidget) return null;
                    const left = (makeConnectionWidget.x + makeConnectionWidget.width) * gridSettings.cellWidth;
                    const top = makeConnectionWidget.y * gridSettings.cellHeight;
                    return (
                        <div
                            style={{
                                position: 'absolute',
                                left,
                                top,
                                background: 'white',
                                borderRadius: 12,
                                boxShadow: '0 2px 16px rgba(0,0,0,0.15)',
                                padding: 32,
                                minWidth: 400,
                                maxWidth: 480,
                                zIndex: 9999,
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
                    );
                })()}
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