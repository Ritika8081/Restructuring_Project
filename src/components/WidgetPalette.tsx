import React, { useRef, useCallback, useState } from 'react';
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

const widgetTypes = [
    { type: 'basic', icon: '📈', name: 'Signal', description: 'Real-time data' },
    { type: 'spiderplot', icon: '🎯', name: 'Radar', description: 'Multi-axis view' },
    { type: 'FFTGraph', icon: '〰️', name: 'FFT', description: 'Frequency analysis' },
    { type: 'bargraph', icon: '📊', name: 'Chart', description: 'Statistics' },
];

const WidgetPalette: React.FC<WidgetPaletteProps> = ({
    onAddWidget, widgets, gridSettings, onLoadLayout, showToast, showConfirm
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isHovered, setIsHovered] = useState(false);

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
        <>
            {/* Off-canvas Sidebar - Always visible as icons, expands on hover */}
            <aside
                className={`fixed top-16 left-0 h-[calc(100vh-4rem)] z-40 bg-white border-r border-gray-200 transition-all duration-300
                    ${isHovered ? 'w-56' : 'w-16'}`}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <div className="flex flex-col items-center pt-6 space-y-2 h-full">
                    {/* Widget Types */}
                    {widgetTypes.map((type) => (
                        <button
                            key={type.type}
                            onClick={() => onAddWidget(type.type)}
                            className="group flex items-center w-full px-2 py-3 rounded-lg hover:bg-blue-50 transition-all"
                        >
                            <span className="text-2xl">{type.icon}</span>
                            <span
                                className={`ml-4 text-sm font-medium text-gray-800 transition-opacity duration-200
                                    ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                            >
                                {type.name}
                            </span>
                        </button>
                    ))}

                    {/* Divider */}
                    <div className="w-10 h-px bg-gray-200 my-2" />

                    {/* Save */}
                    <button
                        onClick={exportLayout}
                        className="group flex items-center w-full px-2 py-3 rounded-lg hover:bg-blue-50 transition-all"
                        disabled={widgets.length === 0}
                    >
                        <span className="text-xl">💾</span>
                        <span
                            className={`ml-4 text-sm font-medium text-gray-800 transition-opacity duration-200
                                ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        >
                            Save Layout
                        </span>
                    </button>

                    {/* Load */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="group flex items-center w-full px-2 py-3 rounded-lg hover:bg-green-50 transition-all"
                    >
                        <span className="text-xl">📁</span>
                        <span
                            className={`ml-4 text-sm font-medium text-gray-800 transition-opacity duration-200
                                ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        >
                            Load Layout
                        </span>
                    </button>

                    {/* Clear All */}
                    <button
                        onClick={clearAllWidgets}
                        className="group flex items-center w-full px-2 py-3 rounded-lg hover:bg-red-50 transition-all"
                        disabled={widgets.length === 0}
                    >
                        <span className="text-xl">🗑️</span>
                        <span
                            className={`ml-4 text-sm font-medium text-gray-800 transition-opacity duration-200
                                ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        >
                            Clear All
                        </span>
                    </button>

                    {/* Hidden file input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={importLayout}
                        className="hidden"
                    />

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Help Icon */}
                    <button
                        className="group flex items-center w-full px-2 py-3 rounded-lg hover:bg-gray-100 transition-all mb-6"
                        tabIndex={-1}
                    >
                        <span className="text-xl">❔</span>
                        <span
                            className={`ml-4 text-sm font-medium text-gray-800 transition-opacity duration-200
                                ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        >
                            Help & Tips
                        </span>
                    </button>
                </div>
            </aside>
        </>
    );
};

export default WidgetPalette;