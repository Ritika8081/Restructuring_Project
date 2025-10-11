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
            {/* Grid container starts just below header */}
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