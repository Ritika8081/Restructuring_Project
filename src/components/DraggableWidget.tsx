import React, { useState, useCallback, useMemo } from 'react';
import SpiderPlot from '@/components/SpiderPlot';
import StatisticGraph from '@/components/StatisticGraph';
import FFTPlotRealtime from '@/components/FFTPlot';
import BasicGraphRealtime from '@/components/BasicGraph';
import ErrorBoundary from '@/components/ErrorBoundary';
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
};

const DraggableWidget = React.memo<DraggableWidgetProps>(({ widget, widgets, onRemove, gridSettings, dragState, setDragState, onUpdateWidget, children }) => {
    // Widget-specific channel state (for basic signal widgets)
    const [widgetChannels, setWidgetChannels] = useState<any[]>([
        { id: 'ch1', name: 'CH 1', color: '#10B981', visible: true },
    ]);

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
                    onUpdateWidget(widget.id, { 
                        width: newWidth,
                        height: newHeight,
                        minWidth: Math.max(widget.minWidth || 1, minGridWidth),
                        minHeight: Math.max(widget.minHeight || 1, minGridHeight),
                        zIndex: Date.now() 
                    });
                }
            }
        }
    }, [widget, widgets, onUpdateWidget, gridSettings]);

    /**
     * Handle channel configuration changes (for signal widgets)
     */
    const handleChannelsChange = useCallback((channels: any[]) => {
        const currentChannelIds = widgetChannels.map(ch => ch.id).sort().join(',');
        const newChannelIds = channels.map(ch => ch.id).sort().join(',');
        
        if (currentChannelIds !== newChannelIds) {
            setWidgetChannels(channels);
        }
    }, [widgetChannels]);

    /**
     * Add new channel to signal widget (max 6 channels)
     */
    const addChannel = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (widgetChannels.length >= 6) return;

        const nextIndex = widgetChannels.length + 1;
        const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

        const newChannel = {
            id: `ch${nextIndex}`,
            name: `CH ${nextIndex}`,
            color: colors[(nextIndex - 1) % colors.length],
            visible: true,
        };

        const newChannels = [...widgetChannels, newChannel];
        setWidgetChannels(newChannels);
        handleChannelsChange(newChannels);
        // Request resize to fit all channels
        if (widget.type === 'basic' && onUpdateWidget) {
            // Minimum height per channel (should match BasicGraph.tsx logic)
            const minChannelHeight = 60;
            const minTotalWidth = 180;
            const requiredCanvasHeight = (newChannels.length * minChannelHeight) + Math.max(0, newChannels.length - 1);
            const requiredCanvasWidth = minTotalWidth;
            const requiredGridWidth = Math.ceil(requiredCanvasWidth / gridSettings.cellWidth);
            const requiredGridHeight = Math.ceil(requiredCanvasHeight / gridSettings.cellHeight);
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
                    onUpdateWidget(widget.id, {
                        width: newWidth,
                        height: newHeight,
                        minWidth: Math.max(widget.minWidth || 1, minGridWidth),
                        minHeight: Math.max(widget.minHeight || 1, minGridHeight),
                        zIndex: Date.now()
                    });
                }
            }
        }
    }, [widgetChannels, handleChannelsChange, widget, onUpdateWidget, gridSettings, widgets]);

    /**
     * Remove channel from signal widget (minimum 1 channel required)
     */
    const removeChannel = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (widgetChannels.length <= 1) return;

        const newChannels = widgetChannels.slice(0, -1);
        setWidgetChannels(newChannels);
        handleChannelsChange(newChannels);
        // Request resize to fit all channels
        if (widget.type === 'basic' && onUpdateWidget) {
            const minChannelHeight = 60;
            const minTotalWidth = 180;
            const requiredCanvasHeight = (newChannels.length * minChannelHeight) + Math.max(0, newChannels.length - 1);
            const requiredCanvasWidth = minTotalWidth;
            const requiredGridWidth = Math.ceil(requiredCanvasWidth / gridSettings.cellWidth);
            const requiredGridHeight = Math.ceil(requiredCanvasHeight / gridSettings.cellHeight);
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
                    onUpdateWidget(widget.id, {
                        width: newWidth,
                        height: newHeight,
                        minWidth: Math.max(widget.minWidth || 1, minGridWidth),
                        minHeight: Math.max(widget.minHeight || 1, minGridHeight),
                        zIndex: Date.now()
                    });
                }
            }
        }
    }, [widgetChannels, handleChannelsChange, widget, onUpdateWidget, gridSettings, widgets]);

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
            basic: width >= 3 ? 'Real-time Signal' : 'Signal',
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

    // Calculate available space for widget content
    const availableWidth = widget.width * gridSettings.cellWidth - 4;
    const availableHeight = widget.height * gridSettings.cellHeight - 52;

    return (
        <div
            className={`absolute bg-white rounded-lg border border-gray-200 group select-none transition-all duration-200
                ${isDragging ? ' ring-2 ring-blue-300' : ''}`}
            style={style}
        >
            {/* Widget Header */}
            <div className="flex items-center justify-between p-3 border-b border-gray-100 relative z-20">
                <div className="flex items-center gap-2 flex-1">
                    <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        {getWidgetTitle(widget.type, widget.width)}
                        <span className="text-xs text-gray-500">
                            {getChannelInfo()}
                        </span>
                    </h3>

                    {/* Channel controls for basic signal widgets */}
                    {widget.type === 'basic' && (
                        <div className="flex items-center gap-1 ml-2">
                            {widgetChannels.length < 6 && (
                                <button
                                    onClick={addChannel}
                                    className="w-5 h-5 border border-gray-400 border-dashed rounded flex items-center justify-center text-gray-400 hover:border-green-500 hover:text-green-500 hover:bg-green-50 transition-all text-xs ml-1 z-30"
                                    title={`Add channel (${widgetChannels.length}/6)`}
                                >
                                    +
                                </button>
                            )}

                            {widgetChannels.length > 1 && (
                                <button
                                    onClick={removeChannel}
                                    className="w-5 h-5 border border-gray-400 border-dashed rounded flex items-center justify-center text-gray-400 hover:border-red-500 hover:text-red-500 hover:bg-red-50 transition-all text-xs z-30"
                                    title={`Remove channel (${widgetChannels.length}/6)`}
                                >
                                    −
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1 relative z-30">
                    <span className="text-xs text-gray-400">{`${widget.width}×${widget.height}`}</span>
                    <button
                        onClick={handleRemove}
                        className="w-6 h-6 text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-60 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center rounded text-sm font-bold border border-transparent hover:border-red-200"
                        title="Remove widget"
                    >
                        ×
                    </button>
                </div>
            </div>

            {/* Widget Content Area */}
            <div
                className="cursor-move overflow-hidden relative pb-5"
                onMouseDown={(e) => handleMouseDown(e, 'move')}
                style={{
                    height: 'calc(100% - 48px)',
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
                        <SpiderPlot
                            data={[
                                { label: 'Channel1', value: 85, maxValue: 100 },
                                { label: 'Channel2', value: 92, maxValue: 100 },
                                { label: 'Channel3', value: 78, maxValue: 100 },
                                { label: 'Channel4', value: 65, maxValue: 100 },
                                { label: 'Channel5', value: 88, maxValue: 100 },
                                { label: 'Channel6', value: 45, maxValue: 100 },
                            ]}
                            width={availableWidth}
                            height={availableHeight}
                            showLabels={widget.width >= 3 && widget.height >= 3}
                            showValues={widget.width >= 4 && widget.height >= 4}
                            animated={true}
                            backgroundColor="rgba(16, 185, 129, 0.02)"
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
                            width={availableWidth}
                            height={availableHeight}
                            colors={['#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#C084FC', '#D8B4FE']}
                            showLabels={widget.width >= 3}
                            showValues={widget.width >= 3 && widget.height >= 3}
                            showGrid={widget.width >= 4}
                        />
                    ) : widget.type === 'spiderplot' ? (
                        <div className="w-full h-full">
                            <SpiderPlot width={availableWidth} height={availableHeight} />
                        </div>
                    ) : widget.type === 'FFTGraph' ? (
                        <div className="relative w-full h-full">
                            {availableWidth > 100 && availableHeight > 80 ? (
                                <FFTPlotRealtime
                                    color="#3B82F6"
                                    width={availableWidth}
                                    height={availableHeight}
                                    bufferSize={256}
                                    showGrid={widget.width >= 3}
                                    backgroundColor="rgba(59, 130, 246, 0.05)"
                                />
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
                                data={[
                                    { label: 'A', value: 10 },
                                    { label: 'B', value: 20 },
                                    { label: 'C', value: 15 },
                                    { label: 'D', value: 30 }
                                ]}
                                type="bar"
                            />
                        </div>
                    ) : widget.type === 'basic' ? (
                        <div className="w-full h-full overflow-hidden flex items-center justify-center p-0.5">
                            <BasicGraphRealtime
                                channels={widgetChannels}
                                width={availableWidth - 4}
                                height={availableHeight - 4}
                                bufferSize={512}
                                showGrid={widget.width >= 3}
                                backgroundColor="rgba(16, 185, 129, 0.02)"
                                sampleRate={60}
                                timeWindow={8}
                                onChannelsChange={handleChannelsChange}
                                onSizeRequest={handleSizeRequest}
                                showChannelControls={false}
                                showLegend={false}
                            />
                        </div>
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