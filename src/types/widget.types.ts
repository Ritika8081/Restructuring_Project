/**
 * Widget interface representing a draggable/resizable component on the grid
 * Contains position, size, and configuration data
 */
export interface Widget {
    id: string;                 // Unique identifier for the widget
    x: number;                  // Grid column position (0-based)
    y: number;                  // Grid row position (0-based)
    width: number;              // Width in grid cells
    height: number;             // Height in grid cells
    minWidth: number;           // Minimum allowed width
    minHeight: number;          // Minimum allowed height
    maxWidth?: number;          // Optional maximum width constraint
    maxHeight?: number;         // Optional maximum height constraint
    type: string;               // Widget type (basic, spiderplot, FFTGraph, bargraph, connection-data)
    zIndex?: number;            // Stacking order for overlays
    connectionType?: string;    // For connection-data widgets: 'ble', 'serial', 'wifi'
    // For widgets created from channel flow nodes: index of the channel (1-based)
    channelIndex?: number;
}

/**
 * Grid configuration settings
 * Defines the layout grid properties
 */
export interface GridSettings {
    cols: number;               // Number of grid columns
    rows: number;               // Number of grid rows
    showGridlines: boolean;     // Whether to display grid lines
    cellWidth: number;          // Width of each grid cell in pixels
    cellHeight: number;         // Height of each grid cell in pixels
    offsetX?: number;           // Sidebar offset in px
    offsetY?: number;           // Header offset in px
}

/**
 * Drag operation state tracking
 * Manages mouse interaction state during drag/resize operations
 */
export interface DragState {
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
export interface ToastState {
    show: boolean;              // Whether toast is visible
    message: string;            // Toast message text
    type: 'success' | 'error' | 'info';  // Toast type for styling
}

/**
 * Confirmation dialog state
 * Manages user confirmation prompts
 */
export interface ConfirmState {
    show: boolean;              // Whether dialog is visible
    message: string;            // Confirmation message
    onConfirm: () => void;      // Callback for confirm action
    onCancel: () => void;       // Callback for cancel action
}