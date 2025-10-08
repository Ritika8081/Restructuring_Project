import { Widget, GridSettings } from '@/types/widget.types';

/**
 * Enhanced collision detection between two widgets
 * Includes small margin to prevent edge overlap due to rounding
 * 
 * @param widget1 - First widget to check
 * @param widget2 - Second widget to check
 * @returns true if widgets collide, false otherwise
 */
export const hasCollision = (widget1: Widget, widget2: Widget): boolean => {
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
export const checkCollisionAtPosition = (
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

/**
 * Robust widget validation for import operations
 * Validates and sanitizes widget data from potentially untrusted sources
 * 
 * @param w - Raw widget data to validate
 * @returns Validated Widget object or null if validation fails
 */
export const validateWidget = (w: any): Widget | null => {
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