import React, { useState, useCallback, useMemo, useEffect } from 'react';
import SpiderPlot from '@/components/SpiderPlot';
import CandleChart from '@/components/Candle';
import StatisticGraph from '@/components/StatisticGraph';
import FFTPlotRealtime from '@/components/FFTPlot';
import BasicGraphRealtime from '@/components/BasicGraph';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useChannelData } from '@/lib/channelDataContext';
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
    incomingConnections?: string[];
};

const DraggableWidget = React.memo<DraggableWidgetProps>(({ widget, widgets, onRemove, gridSettings, dragState, setDragState, onUpdateWidget, children, incomingConnections = [] }) => {
    // Widget-specific channel state (for basic signal widgets)
    // Prefer explicit `widget.channelIndex` (set by the arranger) and fall back to parsing widget.id
    const [widgetChannels, setWidgetChannels] = useState<any[]>(() => {
        try {
            if (widget && widget.type === 'basic') {
                // Prefer explicit channelIndex property when present
                const propIndex = (widget as any).channelIndex;
                const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
                if (typeof propIndex === 'number' && propIndex >= 1) {
                    const idx = Math.max(1, Math.floor(propIndex));
                    const color = colors[(idx - 1) % colors.length];
                    // channel data keys are zero-based (ch0, ch1, ...). Use ch{idx-1} as id.
                    return [{ id: `ch${idx - 1}`, name: `CH ${idx}`, color, visible: true }];
                }
                // Fallback to parsing id (legacy behavior)
                if (typeof widget.id === 'string' && widget.id.startsWith('channel-')) {
                    const m = widget.id.match(/channel-(\d+)/i);
                    const idx = m ? Math.max(1, parseInt(m[1], 10)) : 1;
                    const color = colors[(idx - 1) % colors.length];
                    return [{ id: `ch${idx - 1}`, name: `CH ${idx}`, color, visible: true }];
                }
            }
        } catch (err) {
            // fallthrough
        }
        return [{ id: 'ch1', name: 'CH 1', color: '#10B981', visible: true }];
    });

    // If the widget prop changes (for example arranger sets widget.channelIndex), update
    // the internal widgetChannels so the displayed data follows the assigned channel.
    useEffect(() => {
        try {
            if (widget && widget.type === 'basic') {
                const propIndex = (widget as any).channelIndex;
                const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
                if (typeof propIndex === 'number' && propIndex >= 1) {
                    const idx = Math.max(1, Math.floor(propIndex));
                    const color = colors[(idx - 1) % colors.length];
                    setWidgetChannels([{ id: `ch${idx}`, name: `CH ${idx}`, color, visible: true }]);
                    return;
                }
                // Fallback to parse id
                if (typeof widget.id === 'string' && widget.id.startsWith('channel-')) {
                    const m = widget.id.match(/channel-(\d+)/i);
                    const idx = m ? Math.max(1, parseInt(m[1], 10)) : 1;
                    const color = colors[(idx - 1) % colors.length];
                    setWidgetChannels([{ id: `ch${idx}`, name: `CH ${idx}`, color, visible: true }]);
                    return;
                }
            }
        } catch (err) {
            // ignore
        }
        // Default fallback keep existing value
    }, [widget.id, (widget as any).channelIndex]);

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

    // Note: in-widget channel add/remove controls were removed intentionally so channel
    // assignment is controlled exclusively from the Flow modal (channelCount / flow options).

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

                    {/* Channel controls removed: channel configuration is managed from Flow modal only */}
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
                        (() => {
                            // Compute SpiderPlot axis values from live channel samples when available
                            const { samples } = useChannelData();
                            const axisData = incomingConnections.length > 0 ? incomingConnections.map((id, idx) => {
                                // parse channel index from ids like 'channel-1' -> 0
                                const m = String(id).match(/channel-(\d+)/i);
                                const chIndex = m ? Math.max(0, parseInt(m[1], 10) - 1) : idx;
                                const key = `ch${chIndex}`;
                                const N = 128;
                                const recent = samples.slice(-N);
                                const values = recent.map(s => (s as any)[key] ?? 0);
                                const rms = values.length > 0 ? Math.sqrt(values.reduce((acc, v) => acc + (v * v), 0) / values.length) : 0;
                                // Scale RMS to 0-100 range for visualization (adjustable)
                                const value = Math.min(100, rms * 100);
                                return { label: id, value, maxValue: 100 };
                            }) : undefined;

                            return (
                                <SpiderPlot
                                    width={availableWidth}
                                    height={availableHeight}
                                    showLabels={widget.width >= 3 && widget.height >= 3}
                                    showValues={widget.width >= 4 && widget.height >= 4}
                                    animated={true}
                                    backgroundColor="rgba(16, 185, 129, 0.02)"
                                    data={axisData}
                                />
                            );
                        })()
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
                    ) : widget.type === 'candle' ? (
                        <div className="w-full h-full overflow-hidden flex items-center justify-center p-0.5">
                            <CandleChart width={availableWidth - 4} height={availableHeight - 4} />
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