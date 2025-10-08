'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import DraggableWidget from '@/components/DraggableWidget';
import WidgetPalette from '@/components/WidgetPalette';
import Toast from '@/components/ui/Toast';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { Widget, GridSettings, DragState, ToastState, ConfirmState } from '@/types/widget.types';
import { checkCollisionAtPosition } from '@/utils/widget.utils';

/**
 * Main Widgets component - Orchestrates the entire widget dashboard
 * Manages widget state, grid settings, drag operations, and user interactions
 */
const Widgets: React.FC = () => {
    // Widget collection state with default basic widget (4x4 minimum)
    const [widgets, setWidgets] = useState<Widget[]>([
        {
            id: 'default-basic',
            x: 1,
            y: 1,
            width: 4,
            height: 4,
            minWidth: 4,
            minHeight: 4,
            type: 'basic',
        },
    ]);

    // Grid configuration state
    const [gridSettings, setGridSettings] = useState<GridSettings>({
        cols: 20,
        rows: 15,
        showGridlines: true,
        cellWidth: 60,
        cellHeight: 60,
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
     * Add widget to the grid with collision detection
     */
    const handleAddWidget = useCallback((type: string) => {
        let x = 0, y = 0;
        let found = false;
        
        // Set default dimensions based on widget type
        let defaultWidth = 2;
        let defaultHeight = 2;
        let minWidth = 1;
        let minHeight = 1;
        
        // Special sizing for basic signal widgets (4x4 minimum)
        if (type === 'basic') {
            defaultWidth = 4;
            defaultHeight = 4;
            minWidth = 4;
            minHeight = 4;
        }

        // Find first available space
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
        <div className="h-screen bg-gray-100 overflow-hidden relative">
            {/* System Status Panel */}
            <div className="absolute bottom-4 left-4 bg-white p-3 rounded-lg shadow-sm border border-gray-200 z-50">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium text-gray-700">System Status</span>
                </div>
                <div className="space-y-1 text-xs text-gray-500">
                    <div>Grid: {gridSettings.cols} × {gridSettings.rows}</div>
                    <div>Widgets: {widgets.length}</div>
                    <div>Cell: {gridSettings.cellWidth}×{gridSettings.cellHeight}px</div>
                </div>
            </div>

            {/* Main Grid Container */}
            <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: '100vw', height: '100vh' }}
            >
                {/* Grid Lines */}
                {GridLines}

                {/* Widget Collection */}
                {widgets.map((widget) => (
                    <DraggableWidget
                        key={widget.id}
                        widget={widget}
                        widgets={widgets}
                        onRemove={handleRemoveWidget}
                        gridSettings={gridSettings}
                        dragState={dragState}
                        setDragState={setDragState}
                        onUpdateWidget={handleUpdateWidget}
                    />
                ))}
            </div>

            {/* Widget Management Palette */}
            <WidgetPalette 
                onAddWidget={handleAddWidget}
                widgets={widgets}
                gridSettings={gridSettings}
                onLoadLayout={handleLoadLayout}
                showToast={showToast}
                showConfirm={showConfirm}
            />

            {/* User Feedback Components */}
            <Toast toast={toast} onClose={hideToast} />
            <ConfirmModal confirm={confirm} />
        </div>
    );
};

export default Widgets;