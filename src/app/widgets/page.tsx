'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo, Component, ReactNode } from 'react';
import SpiderPlot from '@/components/SpiderPlot';
import StatisticGraph from '@/components/StatisticGraph';
import FFTPlotRealtime from '@/components/FFTPlot';
import BasicGraphRealtime from '@/components/BasicGraph';

// ========================================
// CUSTOM ERROR BOUNDARY COMPONENT
// ========================================

/**
 * Custom ErrorBoundary component to catch and handle widget rendering errors
 * Prevents entire application crashes when individual widgets fail
 */
interface ErrorBoundaryState {
    hasError: boolean;
    error?: Error;
}

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    /**
     * Called when an error occurs during rendering
     * Updates state to show error UI
     */
    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return {
            hasError: true,
            error
        };
    }

    /**
     * Called after an error has been thrown by a descendant component
     * Logs error details for debugging
     */
    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Widget ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            // Show custom fallback UI if provided
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // Default error UI with retry functionality
            return (
                <div className="p-4 text-red-500 bg-red-50 rounded border border-red-200 m-2">
                    <div className="font-medium text-sm">⚠️ Widget Error</div>
                    <div className="text-xs mt-1 text-red-400">
                        {this.state.error?.message || 'Something went wrong'}
                    </div>
                    <button
                        onClick={() => this.setState({ hasError: false, error: undefined })}
                        className="mt-2 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                    >
                        Retry
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

// ========================================
// TYPE DEFINITIONS
// ========================================

/**
 * Widget interface representing a draggable/resizable component on the grid
 * Contains position, size, and configuration data
 */
interface Widget {
    id: string;                 // Unique identifier for the widget
    x: number;                  // Grid column position (0-based)
    y: number;                  // Grid row position (0-based)
    width: number;              // Width in grid cells
    height: number;             // Height in grid cells
    minWidth: number;           // Minimum allowed width
    minHeight: number;          // Minimum allowed height
    maxWidth?: number;          // Optional maximum width constraint
    maxHeight?: number;         // Optional maximum height constraint
    type: string;               // Widget type (basic, spiderplot, FFTGraph, bargraph)
    zIndex?: number;            // Stacking order for overlays
}

/**
 * Grid configuration settings
 * Defines the layout grid properties
 */
interface GridSettings {
    cols: number;               // Number of grid columns
    rows: number;               // Number of grid rows
    showGridlines: boolean;     // Whether to display grid lines
    cellWidth: number;          // Width of each grid cell in pixels
    cellHeight: number;         // Height of each grid cell in pixels
}

/**
 * Drag operation state tracking
 * Manages mouse interaction state during drag/resize operations
 */
interface DragState {
    isDragging: boolean;        // Whether a drag operation is active
    dragType: 'move' | 'resize' | null;  // Type of drag operation
    startX: number;             // Initial widget X position
    startY: number;             // Initial widget Y position
    startWidth: number;         // Initial widget width
    startHeight: number;        // Initial widget height
    startMouseX: number;        // Initial mouse X coordinate
    startMouseY: number;        // Initial mouse Y coordinate
    activeWidgetId: string | null;  // ID of widget being dragged
}

/**
 * Toast notification state
 * Manages temporary user feedback messages
 */
interface ToastState {
    show: boolean;              // Whether toast is visible
    message: string;            // Toast message text
    type: 'success' | 'error' | 'info';  // Toast type for styling
}

/**
 * Confirmation dialog state
 * Manages user confirmation prompts
 */
interface ConfirmState {
    show: boolean;              // Whether dialog is visible
    message: string;            // Confirmation message
    onConfirm: () => void;      // Callback for confirm action
    onCancel: () => void;       // Callback for cancel action
}

// ========================================
// COLLISION DETECTION UTILITIES
// ========================================

/**
 * Enhanced collision detection between two widgets
 * Includes small margin to prevent edge overlap due to rounding
 * 
 * @param widget1 - First widget to check
 * @param widget2 - Second widget to check
 * @returns true if widgets collide, false otherwise
 */
const hasCollision = (widget1: Widget, widget2: Widget): boolean => {
    const margin = 0.01; // Small margin to prevent 1px edge overlaps
    return !(
        widget1.x + widget1.width <= widget2.x + margin ||
        widget2.x + widget2.width <= widget1.x + margin ||
        widget1.y + widget1.height <= widget2.y + margin ||
        widget2.y + widget2.height <= widget1.y + margin
    );
};

/**
 * Check if a widget at a specific position would collide with existing widgets
 * Also validates grid boundary constraints
 * 
 * @param widgets - Array of existing widgets to check against
 * @param activeId - ID of widget being moved (excluded from collision check)
 * @param x - Target X position
 * @param y - Target Y position
 * @param width - Target width
 * @param height - Target height
 * @param gridSettings - Grid configuration for boundary checking
 * @returns true if collision or boundary violation detected
 */
const checkCollisionAtPosition = (
    widgets: Widget[],
    activeId: string,
    x: number,
    y: number,
    width: number,
    height: number,
    gridSettings: GridSettings
): boolean => {
    // Check grid boundaries first - prevent widgets from going out of bounds
    if (x < 0 || y < 0 || x + width > gridSettings.cols || y + height > gridSettings.rows) {
        return true;
    }

    // Create temporary widget for collision testing
    const testWidget = {
        id: activeId, x, y, width, height,
        minWidth: 1, minHeight: 1, type: 'test'
    };

    // Check collision with all other widgets (excluding the active one)
    return widgets.some(widget =>
        widget.id !== activeId && hasCollision(testWidget, widget)
    );
};

// ========================================
// VALIDATION UTILITIES
// ========================================

/**
 * Robust widget validation for import operations
 * Validates and sanitizes widget data from potentially untrusted sources
 * 
 * @param w - Raw widget data to validate
 * @returns Validated Widget object or null if validation fails
 */
const validateWidget = (w: any): Widget | null => {
    try {
        // Generate unique ID if not provided or invalid
        const id = String(w.id || `widget-${Date.now()}-${Math.random()}`);

        // Parse and validate numeric fields
        const x = Number(w.x);
        const y = Number(w.y);
        const width = Number(w.width);
        const height = Number(w.height);
        const minWidth = Number(w.minWidth || 1);
        const minHeight = Number(w.minHeight || 1);
        const maxWidth = w.maxWidth ? Number(w.maxWidth) : undefined;
        const maxHeight = w.maxHeight ? Number(w.maxHeight) : undefined;
        const type = String(w.type || 'basic');

        // Validate that all required numeric fields are valid numbers
        if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height) ||
            isNaN(minWidth) || isNaN(minHeight)) {
            throw new Error(`Invalid numeric values in widget ${id}`);
        }

        // Validate dimensional and positional constraints
        if (width < minWidth || height < minHeight || x < 0 || y < 0) {
            throw new Error(`Invalid dimensions or position in widget ${id}`);
        }

        // Validate maximum dimension constraints if specified
        if ((maxWidth && width > maxWidth) || (maxHeight && height > maxHeight)) {
            throw new Error(`Widget ${id} exceeds maximum dimensions`);
        }

        // Return sanitized widget with floor values to ensure integer grid positions
        return {
            id,
            x: Math.max(0, Math.floor(x)),
            y: Math.max(0, Math.floor(y)),
            width: Math.max(minWidth, Math.floor(width)),
            height: Math.max(minHeight, Math.floor(height)),
            minWidth,
            minHeight,
            maxWidth,
            maxHeight,
            type,
        };
    } catch (error) {
        console.warn('Widget validation failed:', error);
        return null;
    }
};

// ========================================
// UI COMPONENTS
// ========================================

/**
 * Toast notification component for user feedback
 * Auto-dismisses after 4 seconds with smooth animations
 */
const Toast: React.FC<{ toast: ToastState; onClose: () => void }> = ({ toast, onClose }) => {
    // Auto-dismiss timer
    useEffect(() => {
        if (toast.show) {
            const timer = setTimeout(onClose, 4000);
            return () => clearTimeout(timer);
        }
    }, [toast.show, onClose]);

    if (!toast.show) return null;

    // Dynamic styling based on toast type
    const bgColor = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500'
    }[toast.type];

    return (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[200] ${bgColor} text-white px-4 py-2 rounded-lg shadow-lg transition-all duration-300`}>
            <div className="flex items-center gap-2">
                <span className="text-sm">{toast.message}</span>
                <button onClick={onClose} className="text-white hover:text-gray-200">×</button>
            </div>
        </div>
    );
};

/**
 * Confirmation modal for destructive actions
 * Replaces native browser alerts with custom styled modal
 */
const ConfirmModal: React.FC<{ confirm: ConfirmState }> = ({ confirm }) => {
    if (!confirm.show) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[300]">
            <div className="bg-white rounded-lg p-6 max-w-md mx-4">
                <p className="text-gray-800 mb-4">{confirm.message}</p>
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={confirm.onCancel}
                        className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={confirm.onConfirm}
                        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
};

// ========================================
// DRAGGABLE WIDGET COMPONENT
// ========================================

/**
 * Memoized DraggableWidget component for optimal performance
 * Handles widget rendering, drag/resize interactions, and content display
 */
const DraggableWidget = React.memo<{
    widget: Widget;
    onRemove: (id: string) => void;
    gridSettings: GridSettings;
    dragState: DragState;
    setDragState: React.Dispatch<React.SetStateAction<DragState>>;
    onUpdateWidget?: (id: string, updates: Partial<Widget>) => void;
}>(({ widget, onRemove, gridSettings, dragState, setDragState, onUpdateWidget }) => {
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
     * Handle channel configuration changes (for signal widgets)
     * Updates z-index to bring widget to front on interaction
     */
    const handleChannelsChange = useCallback((channels: any[]) => {
        setWidgetChannels(channels);
        onUpdateWidget?.(widget.id, { zIndex: Date.now() });
    }, [widget.id, onUpdateWidget]);

    /**
     * Add new channel to signal widget (max 12 channels)
     */
    const addChannel = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (widgetChannels.length >= 12) return;

        const nextIndex = widgetChannels.length + 1;
        const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#84CC16', '#EC4899', '#6366F1', '#14B8A6', '#F43F5E'];

        const newChannel = {
            id: `ch${nextIndex}`,
            name: `CH ${nextIndex}`,
            color: colors[(nextIndex - 1) % colors.length],
            visible: true,
        };

        setWidgetChannels(prev => [...prev, newChannel]);
    }, [widgetChannels.length]);

    /**
     * Remove channel from signal widget (minimum 1 channel required)
     */
    const removeChannel = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (widgetChannels.length <= 1) return;

        setWidgetChannels(prev => prev.slice(0, -1));
    }, [widgetChannels.length]);

    /**
     * Memoized style calculation for widget positioning and sizing
     * Includes dynamic z-index for proper stacking during drag operations
     */
    const style = useMemo(() => ({
        left: widget.x * gridSettings.cellWidth,
        top: widget.y * gridSettings.cellHeight,
        width: widget.width * gridSettings.cellWidth,
        height: widget.height * gridSettings.cellHeight,
        // Dynamic z-index: active widgets get higher priority
        zIndex: dragState.activeWidgetId === widget.id ? 100 : (widget.zIndex || 10),
    }), [widget, gridSettings, dragState.activeWidgetId]);

    const isDragging = dragState.activeWidgetId === widget.id;

    /**
     * Generate appropriate widget title based on type and size
     * Shorter titles for smaller widgets to prevent overflow
     */
    const getWidgetTitle = useCallback((type: string, width: number) => {
        const titles = {
            basic: width >= 3 ? 'Real-time Signal' : 'Signal',
            spiderplot: width >= 4 ? 'Performance Radar' : 'Radar',
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

    // Calculate available space for widget content (excluding header)
    const availableWidth = widget.width * gridSettings.cellWidth;
    const availableHeight = widget.height * gridSettings.cellHeight - 48;

    return (
        <div
            className={`absolute bg-white rounded-lg shadow-sm border border-gray-200 group select-none transition-all duration-200
                ${isDragging ? 'shadow-lg ring-2 ring-blue-300' : 'hover:shadow-md'}`}
            style={style}
        >
            {/* Widget Header - Contains title, controls, and remove button */}
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
                            {/* Add channel button (max 12) */}
                            {widgetChannels.length < 12 && (
                                <button
                                    onClick={addChannel}
                                    className="w-5 h-5 border border-gray-400 border-dashed rounded flex items-center justify-center text-gray-400 hover:border-green-500 hover:text-green-500 hover:bg-green-50 transition-all text-xs ml-1 z-30"
                                    title={`Add channel (${widgetChannels.length}/12)`}
                                >
                                    +
                                </button>
                            )}

                            {/* Remove channel button (min 1) */}
                            {widgetChannels.length > 1 && (
                                <button
                                    onClick={removeChannel}
                                    className="w-5 h-5 border border-gray-400 border-dashed rounded flex items-center justify-center text-gray-400 hover:border-red-500 hover:text-red-500 hover:bg-red-50 transition-all text-xs z-30"
                                    title={`Remove channel (${widgetChannels.length}/12)`}
                                >
                                    −
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Widget info and remove button */}
                <div className="flex items-center gap-1 relative z-30">
                    <span className="text-xs text-gray-400">{`${widget.width}×${widget.height}`}</span>
                    <button
                        onClick={handleRemove}
                        className="w-6 h-6 text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-60 group-hover:opacity-100 transition-all duration-200
                                   flex items-center justify-center rounded text-sm font-bold border border-transparent hover:border-red-200"
                        title="Remove widget"
                    >
                        ×
                    </button>
                </div>
            </div>

            {/* Widget Content Area - Handles move drag interactions */}
            <div
                className="cursor-move overflow-hidden relative"
                onMouseDown={(e) => handleMouseDown(e, 'move')}
                style={{
                    height: 'calc(100% - 48px)',
                    width: '100%'
                }}
            >
                {/* Widget Content with Error Boundary Protection */}
                <ErrorBoundary
                    fallback={
                        <div className="p-4 text-red-500 bg-red-50 rounded border border-red-200 m-2">
                            <div className="text-sm">⚠️ Widget Loading Error</div>
                            <div className="text-xs mt-1">Failed to render {widget.type} widget</div>
                        </div>
                    }
                >
                    {/* Conditional widget content rendering based on type */}
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
                    ) : widget.type === 'FFTGraph' ? (
                        <div className="relative w-full h-full">
                            <FFTPlotRealtime
                                color="#3B82F6"
                                width={availableWidth}
                                height={availableHeight}
                                bufferSize={256}
                                showGrid={widget.width >= 3}
                                backgroundColor="rgba(59, 130, 246, 0.05)"
                            />
                        </div>
                    ) : widget.type === 'basic' ? (
                        <BasicGraphRealtime
                            channels={widgetChannels}
                            width={availableWidth}
                            height={availableHeight}
                            bufferSize={512}
                            showGrid={widget.width >= 3}
                            backgroundColor="rgba(16, 185, 129, 0.02)"
                            sampleRate={60}
                            timeWindow={8}
                            onChannelsChange={handleChannelsChange}
                            showChannelControls={false}
                            showLegend={false}
                        />
                    ) : (
                        // Fallback content for unknown widget types
                        <div className="text-gray-500 text-center flex items-center justify-center h-full">
                            <div>
                                <div className="text-2xl mb-2">📊</div>
                                <div className="text-sm">{widget.type}</div>
                            </div>
                        </div>
                    )}
                </ErrorBoundary>
            </div>

            {/* Resize Handle - Bottom-right corner drag handle */}
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

// ========================================
// WIDGET PALETTE COMPONENT
// ========================================

/**
 * Widget palette component for adding, importing, and managing widget layouts
 * Provides collapsible interface with widget library and layout management tools
 */
const WidgetPalette: React.FC<{
    onAddWidget: (type: string) => void;
    widgets: Widget[];
    gridSettings: GridSettings;
    onLoadLayout: (widgets: Widget[], gridSettings?: GridSettings) => void;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
    showConfirm: (message: string, onConfirm: () => void) => void;
}> = ({ onAddWidget, widgets, gridSettings, onLoadLayout, showToast, showConfirm }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Available widget types with metadata
    const widgetTypes = [
        { type: 'basic', icon: '📈', name: 'Signal', description: 'Real-time data' },
        { type: 'spiderplot', icon: '🎯', name: 'Radar', description: 'Multi-axis view' },
        { type: 'FFTGraph', icon: '〰️', name: 'FFT', description: 'Frequency analysis' },
        { type: 'bargraph', icon: '📊', name: 'Chart', description: 'Statistics' },
    ];

    /**
     * Export current layout to JSON file
     * Creates downloadable file with complete layout and grid configuration
     */
    const exportLayout = useCallback(() => {
        try {
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

            // Create and trigger download
            const jsonString = JSON.stringify(layoutData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const fileName = `widget-layout-${new Date().toISOString().split('T')[0]}.json`;

            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showToast(`Layout exported successfully! (${widgets.length} widgets)`, 'success');
        } catch (error) {
            showToast('Failed to export layout', 'error');
        }
    }, [widgets, gridSettings, showToast]);

    /**
     * Import layout from JSON file with robust validation
     * Validates all widget data and provides detailed error reporting
     */
    const importLayout = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            showToast('Please select a JSON file', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const layoutData = JSON.parse(e.target?.result as string);

                if (!layoutData.widgets || !Array.isArray(layoutData.widgets)) {
                    throw new Error('Invalid layout file: missing widgets array');
                }

                // Validate and sanitize each widget with error tracking
                const validatedWidgets: Widget[] = [];
                const errors: string[] = [];

                layoutData.widgets.forEach((w: any, index: number) => {
                    const validated = validateWidget(w);
                    if (validated) {
                        // Ensure unique IDs to prevent React key conflicts
                        const uniqueId = `${validated.id}-${Date.now()}-${index}`;
                        validatedWidgets.push({ ...validated, id: uniqueId });
                    } else {
                        errors.push(`Widget ${index + 1} has invalid data`);
                    }
                });

                if (validatedWidgets.length === 0) {
                    throw new Error('No valid widgets found in layout file');
                }

                // Validate and import grid settings if present
                let importedGridSettings = undefined;
                if (layoutData.gridSettings) {
                    const gs = layoutData.gridSettings;
                    const cols = Number(gs.cols);
                    const rows = Number(gs.rows);
                    const cellWidth = Number(gs.cellWidth);
                    const cellHeight = Number(gs.cellHeight);

                    if (!isNaN(cols) && !isNaN(rows) && !isNaN(cellWidth) && !isNaN(cellHeight) &&
                        cols > 0 && rows > 0 && cellWidth > 0 && cellHeight > 0) {
                        importedGridSettings = {
                            cols,
                            rows,
                            showGridlines: Boolean(gs.showGridlines),
                            cellWidth,
                            cellHeight
                        };
                    }
                }

                onLoadLayout(validatedWidgets, importedGridSettings);

                // Provide detailed feedback about import results
                let message = `Layout imported successfully! (${validatedWidgets.length} widgets)`;
                if (errors.length > 0) {
                    message += ` - ${errors.length} widgets had errors and were skipped`;
                }
                showToast(message, validatedWidgets.length > 0 ? 'success' : 'error');

            } catch (error) {
                console.error('Import error:', error);
                showToast(`Failed to import layout: ${error instanceof Error ? error.message : 'Invalid file format'}`, 'error');
            }
        };

        reader.onerror = () => {
            showToast('Error reading file', 'error');
        };

        reader.readAsText(file);
        event.target.value = ''; // Clear input for repeated imports
    }, [onLoadLayout, showToast]);

    /**
     * Clear all widgets with confirmation
     * Uses custom confirm dialog instead of native browser alert
     */
    const clearAllWidgets = useCallback(() => {
        if (widgets.length === 0) {
            showToast('No widgets to clear', 'info');
            return;
        }

        showConfirm(
            `Are you sure you want to remove all ${widgets.length} widgets?`,
            () => {
                onLoadLayout([]);
                showToast('All widgets cleared', 'success');
            }
        );
    }, [widgets.length, onLoadLayout, showToast, showConfirm]);

    return (
        <div className="absolute top-4 right-4 z-50">
            {/* Collapse/Expand Toggle Button */}
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

            {/* Main Palette Panel */}
            <div className={`w-72 bg-white rounded-lg shadow-lg border border-gray-200 p-4 transition-all duration-300 transform
                           ${isCollapsed ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>

                {/* Header with layout management buttons */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">Widgets</h3>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={exportLayout}
                            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:bg-gray-400"
                            title="Export layout to JSON file"
                            disabled={widgets.length === 0}
                        >
                            💾 Save
                        </button>
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

                {/* Widget Type Grid */}
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

                {/* Clear All Widgets Button */}
                <div className="border-t pt-3 mb-4">
                    <button
                        onClick={clearAllWidgets}
                        className="w-full px-3 py-2 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 border border-red-200 disabled:bg-gray-100 disabled:text-gray-400"
                        disabled={widgets.length === 0}
                    >
                        🗑️ Clear All ({widgets.length})
                    </button>
                </div>

                {/* Help/Tips Section */}
                <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-600 leading-relaxed">
                        <strong>Pro Tips:</strong><br />
                        • Drag widgets to move them around<br />
                        • Use bottom-right corner to resize<br />
                        • Save layouts to preserve your work<br />
                    </p>
                </div>

                {/* Hidden file input for layout import */}
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

// ========================================
// MAIN WIDGETS COMPONENT
// ========================================

/**
 * Main Widgets component - Orchestrates the entire widget dashboard
 * Manages widget state, grid settings, drag operations, and user interactions
 */
const Widgets: React.FC = () => {
    // ========================================
    // STATE MANAGEMENT
    // ========================================

    // Widget collection state
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

    // ========================================
    // REFS FOR PERFORMANCE AND CLEANUP
    // ========================================

    // Refs to avoid stale closures in event handlers
    const widgetsRef = useRef<Widget[]>(widgets);
    const gridSettingsRef = useRef<GridSettings>(gridSettings);

    // Animation frame refs for throttling drag operations
    const moveFrameRef = useRef<number | null>(null);
    const resizeFrameRef = useRef<number | null>(null);

    // Event handler refs for safe cleanup
    const handlersRef = useRef({
        handleMouseMove: null as ((e: MouseEvent) => void) | null,
        handleMouseUp: null as ((e: MouseEvent) => void) | null,
    });

    // ========================================
    // REF SYNCHRONIZATION
    // ========================================

    // Keep refs synchronized with state for event handlers
    useEffect(() => {
        widgetsRef.current = widgets;
    }, [widgets]);

    useEffect(() => {
        gridSettingsRef.current = gridSettings;
    }, [gridSettings]);

    // ========================================
    // UI HELPER FUNCTIONS
    // ========================================

    /**
     * Show toast notification with auto-dismiss
     */
    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        setToast({ show: true, message, type });
    }, []);

    /**
     * Hide current toast notification
     */
    const hideToast = useCallback(() => {
        setToast(prev => ({ ...prev, show: false }));
    }, []);

    /**
     * Show confirmation dialog for destructive actions
     */
    const showConfirm = useCallback((message: string, onConfirm: () => void) => {
        setConfirm({
            show: true,
            message,
            onConfirm: () => {
                onConfirm();
                setConfirm(prev => ({ ...prev, show: false }));
            },
            onCancel: () => setConfirm(prev => ({ ...prev, show: false }))
        });
    }, []);

    // ========================================
    // RESPONSIVE GRID MANAGEMENT
    // ========================================

    /**
     * Update grid settings based on screen size
     * Automatically adjusts cell size and grid dimensions for different devices
     * Repositions widgets that would be out of bounds after resize
     */
    const updateGridSettings = useCallback(() => {
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        let cellWidth, cellHeight, cols, rows;

        // Responsive breakpoints for different screen sizes
        if (screenWidth < 640) { // Mobile
            cellWidth = Math.max(Math.floor(screenWidth / 8), 40);
            cellHeight = Math.max(Math.floor(screenHeight / 12), 40);
        } else if (screenWidth < 1024) { // Tablet
            cellWidth = Math.max(Math.floor(screenWidth / 16), 50);
            cellHeight = Math.max(Math.floor(screenHeight / 14), 50);
        } else { // Desktop
            cellWidth = Math.max(Math.floor(screenWidth / 24), 60);
            cellHeight = Math.max(Math.floor(screenHeight / 16), 60);
        }

        // Calculate grid dimensions
        cols = Math.floor(screenWidth / cellWidth);
        rows = Math.floor(screenHeight / cellHeight);

        // Ensure even numbers for better alignment
        cols = Math.floor(cols / 2) * 2;
        rows = Math.floor(rows / 2) * 2;

        // Set minimum grid size
        cols = Math.max(cols, 8);
        rows = Math.max(rows, 6);

        // Update grid settings
        setGridSettings(prev => ({
            ...prev,
            cols,
            rows,
            cellWidth,
            cellHeight,
        }));

        // Reposition widgets that would be out of bounds
        setWidgets(prev =>
            prev.map(w => ({
                ...w,
                x: Math.min(w.x, cols - w.width),
                y: Math.min(w.y, rows - w.height),
            })).filter(w => w.x >= 0 && w.y >= 0) // Remove widgets that can't fit
        );
    }, []);

    // Initialize grid and set up resize listener
    useEffect(() => {
        updateGridSettings();

        const handleResize = () => updateGridSettings();
        window.addEventListener('resize', handleResize);

        return () => window.removeEventListener('resize', handleResize);
    }, [updateGridSettings]);

    // ========================================
    // DRAG AND RESIZE HANDLING
    // ========================================

    /**
     * Enhanced mouse event handling with RequestAnimationFrame throttling
     * Prevents flicker and improves performance during drag operations
     */
    useEffect(() => {
        /**
         * Handle mouse movement during drag operations
         * Uses RAF throttling to prevent excessive state updates
         */
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragState.isDragging || !dragState.activeWidgetId) return;

            const currentWidgets = widgetsRef.current;
            const currentGridSettings = gridSettingsRef.current;

            const widget = currentWidgets.find(w => w.id === dragState.activeWidgetId);
            if (!widget) return;

            const deltaX = e.clientX - dragState.startMouseX;
            const deltaY = e.clientY - dragState.startMouseY;

            if (dragState.dragType === 'move') {
                // Throttle move operations with RAF
                if (moveFrameRef.current) {
                    cancelAnimationFrame(moveFrameRef.current);
                }

                moveFrameRef.current = requestAnimationFrame(() => {
                    const cellDeltaX = Math.round(deltaX / currentGridSettings.cellWidth);
                    const cellDeltaY = Math.round(deltaY / currentGridSettings.cellHeight);

                    const newX = Math.max(0, Math.min(
                        dragState.startX + cellDeltaX,
                        currentGridSettings.cols - widget.width
                    ));
                    const newY = Math.max(0, Math.min(
                        dragState.startY + cellDeltaY,
                        currentGridSettings.rows - widget.height
                    ));

                    // Only update if no collision detected
                    if (!checkCollisionAtPosition(currentWidgets, dragState.activeWidgetId!, newX, newY, widget.width, widget.height, currentGridSettings)) {
                        setWidgets(prev =>
                            prev.map(w => w.id === dragState.activeWidgetId ? { ...w, x: newX, y: newY } : w)
                        );
                    }
                });

            } else if (dragState.dragType === 'resize') {
                // Throttle resize operations with RAF
                if (resizeFrameRef.current) {
                    cancelAnimationFrame(resizeFrameRef.current);
                }

                resizeFrameRef.current = requestAnimationFrame(() => {
                    const resizeThreshold = currentGridSettings.cellWidth * 0.6;

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

                    // Constrain to grid boundaries
                    newWidth = Math.min(newWidth, currentGridSettings.cols - widget.x);
                    newHeight = Math.min(newHeight, currentGridSettings.rows - widget.y);

                    // Apply maximum size constraints if specified
                    if (widget.maxWidth) {
                        newWidth = Math.min(newWidth, widget.maxWidth);
                    }
                    if (widget.maxHeight) {
                        newHeight = Math.min(newHeight, widget.maxHeight);
                    }

                    // Only update if no collision detected
                    if (!checkCollisionAtPosition(currentWidgets, dragState.activeWidgetId!, widget.x, widget.y, newWidth, newHeight, currentGridSettings)) {
                        setWidgets(prev =>
                            prev.map(w => w.id === dragState.activeWidgetId ? { ...w, width: newWidth, height: newHeight } : w)
                        );
                    }
                });
            }
        };

        /**
         * Handle mouse up to end drag operations
         * Cleans up animation frames and resets cursor
         */
        const handleMouseUp = () => {
            if (dragState.isDragging) {
                // Clean up any pending animation frames
                if (moveFrameRef.current) {
                    cancelAnimationFrame(moveFrameRef.current);
                    moveFrameRef.current = null;
                }
                if (resizeFrameRef.current) {
                    cancelAnimationFrame(resizeFrameRef.current);
                    resizeFrameRef.current = null;
                }

                // Reset drag state
                setDragState(prev => ({
                    ...prev,
                    isDragging: false,
                    dragType: null,
                    activeWidgetId: null,
                }));
            }
        };

        // Store handlers in ref for cleanup reference
        handlersRef.current.handleMouseMove = handleMouseMove;
        handlersRef.current.handleMouseUp = handleMouseUp;

        // Add event listeners during active drag operations
        if (dragState.isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = dragState.dragType === 'move' ? 'grabbing' : 'se-resize';
            document.body.style.userSelect = 'none';
        }

        // Cleanup function
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // Clean up any pending animation frames
            if (moveFrameRef.current) {
                cancelAnimationFrame(moveFrameRef.current);
            }
            if (resizeFrameRef.current) {
                cancelAnimationFrame(resizeFrameRef.current);
            }
        };
    }, [dragState]);

    // ========================================
    // WIDGET MANAGEMENT FUNCTIONS
    // ========================================

    /**
     * Add new widget to the grid
     * Finds optimal placement and generates unique ID
     */
    const handleAddWidget = useCallback((type: string) => {
        let x = 0, y = 0;
        let found = false;
        const defaultWidth = 2;
        const defaultHeight = 2;

        const currentWidgets = widgetsRef.current;
        const currentGridSettings = gridSettingsRef.current;

        // Find first available space using grid scan
        for (let row = 0; row < currentGridSettings.rows - defaultHeight + 1 && !found; row++) {
            for (let col = 0; col < currentGridSettings.cols - defaultWidth + 1 && !found; col++) {
                if (!checkCollisionAtPosition(currentWidgets, 'temp', col, row, defaultWidth, defaultHeight, currentGridSettings)) {
                    x = col;
                    y = row;
                    found = true;
                }
            }
        }

        if (found) {
            // Create new widget with unique ID to prevent conflicts
            const newWidget: Widget = {
                id: `widget-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                x,
                y,
                width: defaultWidth,
                height: defaultHeight,
                minWidth: 1,
                minHeight: 1,
                type,
            };
            setWidgets(prev => [...prev, newWidget]);
            showToast(`${type} widget added`, 'success');
        } else {
            showToast('No space available for new widget', 'error');
        }
    }, [showToast]);

    /**
     * Remove widget from grid
     */
    const handleRemoveWidget = useCallback((id: string) => {
        setWidgets(prev => prev.filter(w => w.id !== id));
        showToast('Widget removed', 'info');
    }, [showToast]);

    /**
     * Load complete layout from imported data
     */
    const handleLoadLayout = useCallback((newWidgets: Widget[], newGridSettings?: GridSettings) => {
        setWidgets(newWidgets);
        if (newGridSettings) {
            setGridSettings(newGridSettings);
        }
    }, []);

    /**
     * Update specific widget properties
     */
    const handleUpdateWidget = useCallback((id: string, updates: Partial<Widget>) => {
        setWidgets(prev =>
            prev.map(widget =>
                widget.id === id ? { ...widget, ...updates } : widget
            )
        );
    }, []);

    // ========================================
    // PERFORMANCE OPTIMIZATIONS
    // ========================================

    /**
     * Memoized grid lines SVG for performance
     * Only re-renders when grid settings change
     */
    const GridLines = useMemo(() => {
        if (!gridSettings.showGridlines) return null;

        return (
            <svg
                className="absolute inset-0 pointer-events-none"
                width="100%"
                height="100%"
                style={{ pointerEvents: 'none' }} // Ensure no mouse interference
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

    // ========================================
    // RENDER
    // ========================================

    return (
        <div className="h-screen bg-gray-100 overflow-hidden relative">
            {/* System Status Panel - Shows grid info and widget count */}
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

            {/* Main Grid Container - Full viewport coverage */}
            <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: '100vw', height: '100vh' }}
            >
                {/* Grid Lines - Memoized for performance */}
                {GridLines}

                {/* Widget Collection - Rendered with memoized components */}
                {widgets.map((widget) => (
                    <DraggableWidget
                        key={widget.id}
                        widget={widget}
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