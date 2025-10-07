'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import SpiderPlot from '@/components/SpiderPlot';
import StatisticGraph from '@/components/StatisticGraph';
import FFTPlot from '@/components/FFTPlot';
import FFTPlotRealtime from '@/components/FFTPlot';
import BasicGraphRealtime from '@/components/BasicGraph';

// Types
interface Widget {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
    maxWidth?: number;
    maxHeight?: number;
    type: string;
}

interface GridSettings {
    cols: number;
    rows: number;
    showGridlines: boolean;
    cellWidth: number;
    cellHeight: number;
}

interface DragState {
    isDragging: boolean;
    dragType: 'move' | 'resize' | null;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startMouseX: number;
    startMouseY: number;
    activeWidgetId: string | null;
}

// Collision detection utility
const hasCollision = (widget1: Widget, widget2: Widget): boolean => {
    return !(
        widget1.x + widget1.width <= widget2.x ||
        widget2.x + widget2.width <= widget1.x ||
        widget1.y + widget1.height <= widget2.y ||
        widget2.y + widget2.height <= widget1.y
    );
};

const checkCollisionAtPosition = (
    widgets: Widget[],
    activeId: string,
    x: number,
    y: number,
    width: number,
    height: number
): boolean => {
    const testWidget = { id: activeId, x, y, width, height, minWidth: 1, minHeight: 1, type: 'test' };
    return widgets.some(widget => 
        widget.id !== activeId && hasCollision(testWidget, widget)
    );
};

// Draggable Widget Component
const DraggableWidget: React.FC<{
    widget: Widget;
    onRemove: (id: string) => void;
    gridSettings: GridSettings;
    dragState: DragState;
    setDragState: React.Dispatch<React.SetStateAction<DragState>>;
}> = ({ widget, onRemove, gridSettings, dragState, setDragState }) => {
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

    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        onRemove(widget.id);
    };

    const style = {
        left: widget.x * gridSettings.cellWidth,
        top: widget.y * gridSettings.cellHeight,
        width: widget.width * gridSettings.cellWidth,
        height: widget.height * gridSettings.cellHeight,
    };

    const isDragging = dragState.activeWidgetId === widget.id;

    const getWidgetTitle = (type: string, width: number) => {
        const titles = {
            basic: width >= 3 ? 'Real-time Signal' : 'Signal',
            spiderplot: width >= 4 ? 'Performance Radar' : 'Radar',
            FFTGraph: width >= 3 ? 'FFT Spectrum' : 'FFT',
            bargraph: width >= 3 ? 'Statistics' : 'Stats',
        };
        return titles[type as keyof typeof titles] || type;
    };

    return (
        <div
            className={`absolute bg-white rounded-lg shadow-sm border border-gray-200 group select-none transition-all duration-200
                ${isDragging ? 'shadow-lg z-50' : 'z-10 hover:shadow-md'}`}
            style={style}
        >
            {/* Widget Header */}
            <div className="flex items-center justify-between p-3 border-b border-gray-100">
                <h3 className="text-sm font-medium text-gray-700">
                    {getWidgetTitle(widget.type, widget.width)}
                </h3>
                <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400">{`${widget.width}×${widget.height}`}</span>
                    <button
                        onClick={handleRemove}
                        className="w-5 h-5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all duration-200
                                   flex items-center justify-center rounded text-xs"
                    >
                        ×
                    </button>
                </div>
            </div>

            {/* Widget Content */}
            <div
                className="p-3 cursor-move flex items-center justify-center h-[calc(100%-48px)]"
                onMouseDown={(e) => handleMouseDown(e, 'move')}
            >
                {widget.type === 'spiderplot' ? (
                    <SpiderPlot 
                        data={[
                            { label: 'Channel1', value: 85, maxValue: 100 },
                            { label: 'Channel2', value: 92, maxValue: 100 },
                            { label: 'Channel3', value: 78, maxValue: 100 },
                            { label: 'Channel4', value: 65, maxValue: 100 },
                            { label: 'Channel5', value: 88, maxValue: 100 },
                            { label: 'Channel6', value: 45, maxValue: 100 },
                        ]}
                        width={Math.min(widget.width * gridSettings.cellWidth - 40, 300)}
                        height={Math.min(widget.height * gridSettings.cellHeight - 88, 300)}
                        showLabels={widget.width >= 3 && widget.height >= 3}
                        showValues={widget.width >= 4 && widget.height >= 4}
                    />
                ) : widget.type === 'bargraph' ? (
                    <StatisticGraph 
                        data={[
                            { label: 'Q1', value: 85 },
                            { label: 'Q2', value: 72 },
                            { label: 'Q3', value: 95 },
                            { label: 'Q4', value: 68 },
                            { label: 'Q5', value: 89 },
                            { label: 'Q6', value: 76 },
                        ]}
                        type="bar"
                        width={Math.min(widget.width * gridSettings.cellWidth - 40, 300)}
                        height={Math.min(widget.height * gridSettings.cellHeight - 88, 200)}
                        colors={['#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#C084FC', '#D8B4FE']}
                        showLabels={widget.width >= 3}
                        showValues={widget.width >= 3 && widget.height >= 3}
                        showGrid={widget.width >= 4}
                    />
                ) : widget.type === 'FFTGraph' ? (
                    <FFTPlotRealtime 
                        color="#3B82F6"
                        width={Math.min(widget.width * gridSettings.cellWidth - 40, 600)}
                        height={Math.min(widget.height * gridSettings.cellHeight - 88, 250)}
                        bufferSize={256}
                        showGrid={widget.width >= 3}
                        backgroundColor="rgba(59, 130, 246, 0.05)"
                    />
                ) : widget.type === 'basic' ? (
                    <BasicGraphRealtime 
                        color="#10B981"
                        width={Math.min(widget.width * gridSettings.cellWidth - 40, 400)}
                        height={Math.min(widget.height * gridSettings.cellHeight - 88, 250)}
                        bufferSize={512}
                        showGrid={widget.width >= 3}
                        backgroundColor="rgba(16, 185, 129, 0.05)"
                    />
                ) : (
                    <div className="text-gray-500 text-center">
                        <div className="text-2xl mb-2">📊</div>
                        <div className="text-sm">{widget.type}</div>
                    </div>
                )}
            </div>

            {/* Resize Handle */}
            <div
                className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                onMouseDown={(e) => handleMouseDown(e, 'resize')}
            >
                <div className="absolute bottom-1 right-1 w-2 h-2 border-b-2 border-r-2 border-gray-400"></div>
            </div>
        </div>
    );
};

// Widget Palette Component
const WidgetPalette: React.FC<{
    onAddWidget: (type: string) => void;
    widgets: Widget[];
    gridSettings: GridSettings;
    onLoadLayout: (widgets: Widget[], gridSettings?: GridSettings) => void;
}> = ({ onAddWidget, widgets, gridSettings, onLoadLayout }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const widgetTypes = [
        { type: 'basic', icon: '📈', name: 'Signal', description: 'Real-time data' },
        { type: 'spiderplot', icon: '🎯', name: 'Radar', description: 'Multi-axis view' },
        { type: 'FFTGraph', icon: '〰️', name: 'FFT', description: 'Frequency analysis' },
        { type: 'bargraph', icon: '📊', name: 'Chart', description: 'Statistics' },
    ];

    // 📥 EXPORT FUNCTION - Creates and downloads JSON file
    const exportLayout = useCallback(() => {
        // Create a structured object with all your layout data
        const layoutData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            totalWidgets: widgets.length,
            gridSettings: {
                cols: gridSettings.cols,
                rows: gridSettings.rows,
                showGridlines: gridSettings.showGridlines,
                cellWidth: gridSettings.cellWidth,
                cellHeight: gridSettings.cellHeight
            },
            widgets: widgets.map(widget => ({
                id: widget.id,
                type: widget.type,
                x: widget.x,
                y: widget.y,
                width: widget.width,
                height: widget.height,
                minWidth: widget.minWidth,
                minHeight: widget.minHeight,
                maxWidth: widget.maxWidth,
                maxHeight: widget.maxHeight
            }))
        };
        
        // Convert to JSON string with nice formatting
        const jsonString = JSON.stringify(layoutData, null, 2);
        
        // Create a downloadable file
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Create filename with current date
        const fileName = `widget-layout-${new Date().toISOString().split('T')[0]}.json`;
        
        // Trigger download
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        // Show success message
        alert(`✅ Layout exported successfully!\nFile: ${fileName}\nWidgets: ${widgets.length}`);
    }, [widgets, gridSettings]);

    // 📤 IMPORT FUNCTION - Reads and loads JSON file
    const importLayout = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        
        // Check if it's a JSON file
        if (!file.name.endsWith('.json')) {
            alert('❌ Please select a JSON file');
            return;
        }
        
        // Read the file
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                // Parse the JSON
                const layoutData = JSON.parse(e.target?.result as string);
                
                // Check if it has the required structure
                if (!layoutData.widgets || !Array.isArray(layoutData.widgets)) {
                    throw new Error('Invalid layout file: missing widgets');
                }
                
                // Convert the data back to your Widget format
                const importedWidgets: Widget[] = layoutData.widgets.map((w: any, index: number) => ({
                    id: w.id || `imported-${Date.now()}-${index}`,
                    x: w.x || 0,
                    y: w.y || 0,
                    width: w.width || 2,
                    height: w.height || 2,
                    minWidth: w.minWidth || 1,
                    minHeight: w.minHeight || 1,
                    maxWidth: w.maxWidth,
                    maxHeight: w.maxHeight,
                    type: w.type || 'basic'
                }));
                
                // Import grid settings if available
                let importedGridSettings = undefined;
                if (layoutData.gridSettings) {
                    importedGridSettings = {
                        cols: layoutData.gridSettings.cols || gridSettings.cols,
                        rows: layoutData.gridSettings.rows || gridSettings.rows,
                        showGridlines: layoutData.gridSettings.showGridlines ?? gridSettings.showGridlines,
                        cellWidth: layoutData.gridSettings.cellWidth || gridSettings.cellWidth,
                        cellHeight: layoutData.gridSettings.cellHeight || gridSettings.cellHeight
                    };
                }
                
                // Load the layout
                onLoadLayout(importedWidgets, importedGridSettings);
                
                // Show success message
                alert(`✅ Layout imported successfully!\nWidgets loaded: ${importedWidgets.length}\nFrom: ${layoutData.exportDate ? new Date(layoutData.exportDate).toLocaleDateString() : 'Unknown date'}`);
                
            } catch (error) {
                console.error('Import error:', error);
                alert(`❌ Failed to import layout: ${error instanceof Error ? error.message : 'Invalid file format'}`);
            }
        };
        
        reader.onerror = () => {
            alert('❌ Error reading file');
        };
        
        reader.readAsText(file);
        
        // Clear the input so you can import the same file again if needed
        event.target.value = '';
    }, [onLoadLayout, gridSettings]);

    // 🗑️ CLEAR ALL FUNCTION
    const clearAllWidgets = useCallback(() => {
        if (widgets.length === 0) {
            alert('No widgets to clear');
            return;
        }
        
        if (confirm(`Are you sure you want to remove all ${widgets.length} widgets?`)) {
            onLoadLayout([]);
        }
    }, [widgets.length, onLoadLayout]);

    return (
        <div className="absolute top-4 right-4 z-50">
            {/* Toggle Button */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-12 h-12 bg-white rounded-lg shadow-md border border-gray-200 mb-3 
                           flex items-center justify-center text-gray-600 hover:text-gray-800 hover:shadow-lg transition-all duration-200"
                title={isCollapsed ? "Open Widget Library" : "Close Widget Library"}
            >
                {isCollapsed ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                )}
            </button>

            {/* Palette Container */}
            <div className={`w-72 bg-white rounded-lg shadow-lg border border-gray-200 p-4 transition-all duration-300 transform
                           ${isCollapsed ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
                
                {/* Header with Save/Load buttons */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">Widgets</h3>
                    <div className="flex items-center gap-1">
                        {/* Export Button */}
                        <button
                            onClick={exportLayout}
                            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                            title="Export layout to JSON file"
                            disabled={widgets.length === 0}
                        >
                            💾 Save
                        </button>
                        {/* Import Button */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                            title="Import layout from JSON file"
                        >
                            📁 Load
                        </button>
                        <button
                            onClick={() => setIsCollapsed(true)}
                            className="w-6 h-6 text-gray-400 hover:text-gray-600 flex items-center justify-center"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Widget Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    {widgetTypes.map((type) => (
                        <button
                            key={type.type}
                            onClick={() => onAddWidget(type.type)}
                            className="group p-4 bg-gray-50 hover:bg-blue-50 rounded-lg border border-gray-200 hover:border-blue-200
                                     transition-all duration-200 text-left"
                        >
                            <div className="text-2xl mb-2">{type.icon}</div>
                            <div className="text-sm font-medium text-gray-800 mb-1">{type.name}</div>
                            <div className="text-xs text-gray-500">{type.description}</div>
                        </button>
                    ))}
                </div>

                {/* Management Section */}
                <div className="border-t pt-3 mb-4">
                    <button
                        onClick={clearAllWidgets}
                        className="w-full px-3 py-2 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 border border-red-200"
                        disabled={widgets.length === 0}
                    >
                        🗑️ Clear All ({widgets.length})
                    </button>
                </div>
                
                {/* Instructions */}
                <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-600 leading-relaxed">
                        <strong>How to use:</strong><br/>
                        • Click <strong>Save</strong> to download your layout as JSON<br/>
                        • Click <strong>Load</strong> to restore a saved layout<br/>
                    </p>
                </div>

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={importLayout}
                    className="hidden"
                />
            </div>
        </div>
    );
};

// Main Widgets Component
const Widgets: React.FC = () => {
    const [widgets, setWidgets] = useState<Widget[]>([
        {
            id: '2',
            x: 5,
            y: 1,
            width: 4,
            height: 3,
            minWidth: 2,
            minHeight: 2,
            type: 'spiderplot',
        },
    ]);

    const [gridSettings, setGridSettings] = useState<GridSettings>({
        cols: 20,
        rows: 15,
        showGridlines: true,
        cellWidth: 60,
        cellHeight: 60,
    });

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

    // Enhanced responsive grid settings
    const updateGridSettings = useCallback(() => {
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        let cellWidth, cellHeight, cols, rows;

        if (screenWidth < 640) {
            cellWidth = Math.max(Math.floor(screenWidth / 8), 40);
            cellHeight = Math.max(Math.floor(screenHeight / 12), 40);
        } else if (screenWidth < 1024) {
            cellWidth = Math.max(Math.floor(screenWidth / 16), 50);
            cellHeight = Math.max(Math.floor(screenHeight / 14), 50);
        } else {
            cellWidth = Math.max(Math.floor(screenWidth / 24), 60);
            cellHeight = Math.max(Math.floor(screenHeight / 16), 60);
        }
        
        cols = Math.floor(screenWidth / cellWidth);
        rows = Math.floor(screenHeight / cellHeight);

        setGridSettings(prev => ({
            ...prev,
            cols,
            rows,
            cellWidth,
            cellHeight,
        }));
    }, []);

    useEffect(() => {
        updateGridSettings();
        
        const handleResize = () => updateGridSettings();
        window.addEventListener('resize', handleResize);
        
        return () => window.removeEventListener('resize', handleResize);
    }, [updateGridSettings]);

    // Handle mouse move for dragging
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragState.isDragging || !dragState.activeWidgetId) return;

            const widget = widgets.find(w => w.id === dragState.activeWidgetId);
            if (!widget) return;

            const deltaX = e.clientX - dragState.startMouseX;
            const deltaY = e.clientY - dragState.startMouseY;

            if (dragState.dragType === 'move') {
                const cellDeltaX = Math.round(deltaX / gridSettings.cellWidth);
                const cellDeltaY = Math.round(deltaY / gridSettings.cellHeight);

                const newX = Math.max(0, Math.min(
                    dragState.startX + cellDeltaX,
                    gridSettings.cols - widget.width
                ));
                const newY = Math.max(0, Math.min(
                    dragState.startY + cellDeltaY,
                    gridSettings.rows - widget.height
                ));

                if (!checkCollisionAtPosition(widgets, dragState.activeWidgetId, newX, newY, widget.width, widget.height)) {
                    setWidgets(prev =>
                        prev.map(w => w.id === dragState.activeWidgetId ? { ...w, x: newX, y: newY } : w)
                    );
                }
            } else if (dragState.dragType === 'resize') {
                const resizeThreshold = gridSettings.cellWidth * 0.6;
                
                const cellDeltaX = Math.floor(deltaX / resizeThreshold);
                const cellDeltaY = Math.floor(deltaY / resizeThreshold);

                let newWidth = Math.max(
                    widget.minWidth,
                    dragState.startWidth + cellDeltaX
                );
                let newHeight = Math.max(
                    widget.minHeight,
                    dragState.startHeight + cellDeltaY
                );

                newWidth = Math.min(newWidth, gridSettings.cols - widget.x);
                newHeight = Math.min(newHeight, gridSettings.rows - widget.y);

                if (widget.maxWidth) {
                    newWidth = Math.min(newWidth, widget.maxWidth);
                }
                if (widget.maxHeight) {
                    newHeight = Math.min(newHeight, widget.maxHeight);
                }

                let maxAllowedWidth = newWidth;
                let maxAllowedHeight = newHeight;

                for (let testWidth = widget.width; testWidth <= newWidth; testWidth++) {
                    if (checkCollisionAtPosition(widgets, dragState.activeWidgetId, widget.x, widget.y, testWidth, widget.height)) {
                        maxAllowedWidth = testWidth - 1;
                        break;
                    } else {
                        maxAllowedWidth = testWidth;
                    }
                }

                for (let testHeight = widget.height; testHeight <= newHeight; testHeight++) {
                    if (checkCollisionAtPosition(widgets, dragState.activeWidgetId, widget.x, widget.y, widget.width, testHeight)) {
                        maxAllowedHeight = testHeight - 1;
                        break;
                    } else {
                        maxAllowedHeight = testHeight;
                    }
                }

                const finalWidth = Math.max(widget.minWidth, maxAllowedWidth);
                const finalHeight = Math.max(widget.minHeight, maxAllowedHeight);

                if ((finalWidth !== widget.width || finalHeight !== widget.height) &&
                    !checkCollisionAtPosition(widgets, dragState.activeWidgetId, widget.x, widget.y, finalWidth, finalHeight)) {
                    setWidgets(prev =>
                        prev.map(w => w.id === dragState.activeWidgetId ? { ...w, width: finalWidth, height: finalHeight } : w)
                    );
                }
            }
        };

        const handleMouseUp = () => {
            if (dragState.isDragging) {
                setDragState(prev => ({
                    ...prev,
                    isDragging: false,
                    dragType: null,
                    activeWidgetId: null,
                }));
            }
        };

        if (dragState.isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = dragState.dragType === 'move' ? 'grabbing' : 'se-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [dragState, widgets, gridSettings]);

    const handleAddWidget = useCallback((type: string) => {
        let x = 0, y = 0;
        let found = false;
        const defaultWidth = 2;
        const defaultHeight = 2;

        for (let row = 0; row < gridSettings.rows - defaultHeight + 1 && !found; row++) {
            for (let col = 0; col < gridSettings.cols - defaultWidth + 1 && !found; col++) {
                if (!checkCollisionAtPosition(widgets, 'temp', col, row, defaultWidth, defaultHeight)) {
                    x = col;
                    y = row;
                    found = true;
                }
            }
        }

        if (found) {
            const newWidget: Widget = {
                id: Date.now().toString(),
                x,
                y,
                width: defaultWidth,
                height: defaultHeight,
                minWidth: 1,
                minHeight: 1,
                type,
            };
            setWidgets(prev => [...prev, newWidget]);
        }
    }, [widgets, gridSettings]);

    const handleRemoveWidget = useCallback((id: string) => {
        setWidgets(prev => prev.filter(w => w.id !== id));
    }, []);

    const handleLoadLayout = useCallback((newWidgets: Widget[], newGridSettings?: GridSettings) => {
        setWidgets(newWidgets);
        if (newGridSettings) {
            setGridSettings(newGridSettings);
        }
    }, []);

    return (
        <div className="h-screen bg-gray-100 overflow-hidden relative">
            {/* Grid Info */}
            <div className="absolute bottom-4 left-4 bg-white p-3 rounded-lg shadow-sm border border-gray-200 z-50">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-700">Grid Status</span>
                </div>
                <div className="space-y-1 text-xs text-gray-500">
                    <div>Size: {gridSettings.cols} × {gridSettings.rows}</div>
                    <div>Widgets: {widgets.length}</div>
                </div>
            </div>

            {/* Full Page Grid Container */}
            <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: '100vw', height: '100vh' }}
            >
                {/* Grid Lines */}
                {gridSettings.showGridlines && (
                    <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
                        <defs>
                            <pattern id="grid" width={gridSettings.cellWidth} height={gridSettings.cellHeight} patternUnits="userSpaceOnUse">
                                <path 
                                    d={`M ${gridSettings.cellWidth} 0 L 0 0 0 ${gridSettings.cellHeight}`} 
                                    fill="none" 
                                    stroke="#E5E7EB" 
                                    strokeWidth="1"
                                />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid)" />
                    </svg>
                )}

                {/* Widgets */}
                {widgets.map((widget) => (
                    <DraggableWidget
                        key={widget.id}
                        widget={widget}
                        onRemove={handleRemoveWidget}
                        gridSettings={gridSettings}
                        dragState={dragState}
                        setDragState={setDragState}
                    />
                ))}
            </div>

            {/* Widget Palette */}
            <WidgetPalette 
                onAddWidget={handleAddWidget}
                widgets={widgets}
                gridSettings={gridSettings}
                onLoadLayout={handleLoadLayout}
            />
        </div>
    );
};

export default Widgets;