import React, { useState, useRef, useCallback } from 'react';
import { Widget, GridSettings } from '@/types/widget.types';
import { validateWidget } from '@/utils/widget.utils';

interface WidgetPaletteProps {
    onAddWidget: (type: string) => void;
    widgets: Widget[];
    gridSettings: GridSettings;
    onLoadLayout: (widgets: Widget[], gridSettings?: GridSettings) => void;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
    showConfirm: (message: string, onConfirm: () => void) => void;
}

const WidgetPalette: React.FC<WidgetPaletteProps> = ({ 
    onAddWidget, widgets, gridSettings, onLoadLayout, showToast, showConfirm 
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Available widget types with metadata
    const widgetTypes = [
        { type: 'basic', icon: '📈', name: 'Signal', description: 'Real-time data' },
        { type: 'spiderplot', icon: '🎯', name: 'Radar', description: 'Multi-axis view' },
        { type: 'FFTGraph', icon: '〰️', name: 'FFT', description: 'Frequency analysis' },
        { type: 'bargraph', icon: '📊', name: 'Chart', description: 'Statistics' },
    ];

    const exportLayout = useCallback(() => {
        try {
            const layoutData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                totalWidgets: widgets.length,
                gridSettings,
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

                const validatedWidgets: Widget[] = [];
                const errors: string[] = [];

                layoutData.widgets.forEach((w: any, index: number) => {
                    const validated = validateWidget(w);
                    if (validated) {
                        const uniqueId = `${validated.id}-${Date.now()}-${index}`;
                        validatedWidgets.push({ ...validated, id: uniqueId });
                    } else {
                        errors.push(`Widget ${index + 1} has invalid data`);
                    }
                });

                if (validatedWidgets.length === 0) {
                    throw new Error('No valid widgets found in layout file');
                }

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
        event.target.value = '';
    }, [onLoadLayout, showToast]);

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
            {/* Toggle Button */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-12 h-12 bg-white rounded-lg shadow-md border border-gray-200 mb-3 flex items-center justify-center text-gray-600 hover:text-gray-800 hover:shadow-lg transition-all duration-200"
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

            {/* Main Panel */}
            <div className={`w-72 bg-white rounded-lg shadow-lg border border-gray-200 p-4 transition-all duration-300 transform
                           ${isCollapsed ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>

                {/* Header */}
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

                {/* Widget Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    {widgetTypes.map((type) => (
                        <button
                            key={type.type}
                            onClick={() => onAddWidget(type.type)}
                            className="group p-4 bg-gray-50 hover:bg-blue-50 rounded-lg border border-gray-200 hover:border-blue-200 transition-all duration-200 text-left"
                        >
                            <div className="text-2xl mb-2">{type.icon}</div>
                            <div className="text-sm font-medium text-gray-800 mb-1">{type.name}</div>
                            <div className="text-xs text-gray-500">{type.description}</div>
                        </button>
                    ))}
                </div>

                {/* Clear All Button */}
                <div className="border-t pt-3 mb-4">
                    <button
                        onClick={clearAllWidgets}
                        className="w-full px-3 py-2 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 border border-red-200 disabled:bg-gray-100 disabled:text-gray-400"
                        disabled={widgets.length === 0}
                    >
                        🗑️ Clear All ({widgets.length})
                    </button>
                </div>

                {/* Help Section */}
                <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-600 leading-relaxed">
                        <strong>Pro Tips:</strong><br />
                        • Drag widgets to move them around<br />
                        • Use bottom-right corner to resize<br />
                        • Save layouts to preserve your work<br />
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

export default WidgetPalette;