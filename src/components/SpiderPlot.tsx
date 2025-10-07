'use client';

import React, { useEffect, useRef, useState } from 'react';
import { WebglPlot, WebglLine, ColorRGBA } from 'webgl-plot';

interface SpiderPlotData {
    label: string;
    value: number;
    maxValue?: number;
}

interface SpiderPlotProps {
    data?: SpiderPlotData[];
    width?: number;
    height?: number;
    colors?: {
        web: string;
        fill: string;
        stroke: string;
        points: string;
        labels: string;
    };
    showLabels?: boolean;
    showValues?: boolean;
    className?: string;
    backgroundColor?: string;
    webLevels?: number;
    animated?: boolean;
}

const SpiderPlot: React.FC<SpiderPlotProps> = ({
    data,
    width = 300,
    height = 300,
    colors = {
        web: '#94A3B8',
        fill: '#10B981',
        stroke: '#10B981',
        points: '#10B981',
        labels: '#374151'
    },
    showLabels = true,
    showValues = true,
    className = '',
    backgroundColor = 'rgba(0, 0, 0, 0.02)',
    webLevels = 5,
    animated = true
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const plotRef = useRef<WebglPlot | null>(null);
    const animationRef = useRef<number | null>(null);
    const dataUpdateRef = useRef<NodeJS.Timeout | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [animatedData, setAnimatedData] = useState<SpiderPlotData[]>([]);

    // Generate random animated data
    const generateRandomData = (): SpiderPlotData[] => {
        const labels = ['Speed', 'Power', 'Accuracy', 'Defense', 'Agility', 'Intelligence'];
        return labels.map((label, index) => ({
            label,
            value: Math.round(30 + Math.random() * 70), // Random values between 30-100
            maxValue: 100
        }));
    };

    // Initialize data
    useEffect(() => {
        if (data && data.length > 0) {
            setAnimatedData(data);
        } else {
            setAnimatedData(generateRandomData());
        }
    }, [data]);

    // Update data periodically for animation
    useEffect(() => {
        if (!animated) return;

        const updateData = () => {
            setAnimatedData(prev => prev.map(item => ({
                ...item,
                value: Math.max(10, Math.min(100, 
                    item.value + (Math.random() - 0.5) * 10 // Smooth random changes
                ))
            })));
        };

        dataUpdateRef.current = setInterval(updateData, 2000); // Update every 2 seconds

        return () => {
            if (dataUpdateRef.current) {
                clearInterval(dataUpdateRef.current);
            }
        };
    }, [animated]);

    const plotData = animatedData.length > 0 ? animatedData : generateRandomData();

    // Convert hex color to ColorRGBA
    const hexToColorRGBA = (hex: string, alpha: number = 1.0): ColorRGBA => {
        const cleanHex = hex.replace('#', '');
        const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
        const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
        const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
        return new ColorRGBA(r, g, b, alpha);
    };

    // Calculate spider plot coordinates
    const calculateSpiderPoints = () => {
        const center = { x: 0, y: 0 }; // WebGL coordinates (-1 to 1)
        const radius = 0.6; // 60% of the canvas for better fit
        const angleStep = (2 * Math.PI) / plotData.length;

        return plotData.map((item, index) => {
            const angle = index * angleStep - Math.PI / 2; // Start from top
            const maxVal = item.maxValue || 100;
            const normalizedValue = Math.min(item.value / maxVal, 1);
            const pointRadius = radius * normalizedValue;
            
            return {
                x: center.x + pointRadius * Math.cos(angle),
                y: center.y + pointRadius * Math.sin(angle),
                labelX: center.x + (radius + 0.25) * Math.cos(angle),
                labelY: center.y + (radius + 0.25) * Math.sin(angle),
                angle,
                value: Math.round(item.value),
                label: item.label,
                normalizedValue,
                axisEndX: center.x + radius * Math.cos(angle),
                axisEndY: center.y + radius * Math.sin(angle)
            };
        });
    };

    useEffect(() => {
        if (!canvasRef.current || plotData.length === 0) return;

        const canvas = canvasRef.current;
        const devicePixelRatio = window.devicePixelRatio || 1;

        // Set canvas size
        canvas.width = width * devicePixelRatio;
        canvas.height = height * devicePixelRatio;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        try {
            const plot = new WebglPlot(canvas);
            plotRef.current = plot;

            const spiderPoints = calculateSpiderPoints();
            const webColor = hexToColorRGBA(colors.web, 0.4);
            const dataColor = hexToColorRGBA(colors.stroke, 1.0);
            const fillColor = hexToColorRGBA(colors.fill, 0.25);

            // Clear any existing lines
            plot.removeAllLines();

            // 1. Draw web grid (concentric polygons)
            for (let level = 1; level <= webLevels; level++) {
                const levelRadius = 0.6 * (level / webLevels);
                const webLine = new WebglLine(webColor, plotData.length + 1);
                
                plotData.forEach((_, index) => {
                    const angle = index * (2 * Math.PI / plotData.length) - Math.PI / 2;
                    const x = levelRadius * Math.cos(angle);
                    const y = levelRadius * Math.sin(angle);
                    webLine.setY(index, y);
                    webLine.setX(index, x);
                });
                
                // Close the polygon
                const firstAngle = -Math.PI / 2;
                webLine.setY(plotData.length, levelRadius * Math.sin(firstAngle));
                webLine.setX(plotData.length, levelRadius * Math.cos(firstAngle));
                
                plot.addLine(webLine);
            }

            // 2. Draw axis lines
            spiderPoints.forEach((point) => {
                const axisLine = new WebglLine(webColor, 2);
                axisLine.setY(0, 0); // Center
                axisLine.setX(0, 0);
                axisLine.setY(1, point.axisEndY);
                axisLine.setX(1, point.axisEndX);
                plot.addLine(axisLine);
            });

            // 3. Draw filled area using triangles from center
            const centerColor = hexToColorRGBA(colors.fill, 0.15);
            for (let i = 0; i < spiderPoints.length; i++) {
                const nextIndex = (i + 1) % spiderPoints.length;
                const triangleFill = new WebglLine(centerColor, 3);
                
                // Triangle: center -> current point -> next point
                triangleFill.setY(0, 0); // Center
                triangleFill.setX(0, 0);
                triangleFill.setY(1, spiderPoints[i].y);
                triangleFill.setX(1, spiderPoints[i].x);
                triangleFill.setY(2, spiderPoints[nextIndex].y);
                triangleFill.setX(2, spiderPoints[nextIndex].x);
                
                plot.addLine(triangleFill);
            }

            // 4. Draw data polygon outline
            const dataOutline = new WebglLine(dataColor, spiderPoints.length + 1);
            dataOutline.lineSpaceX(-1, 2 / spiderPoints.length);
            
            spiderPoints.forEach((point, index) => {
                dataOutline.setY(index, point.y);
                dataOutline.setX(index, point.x);
            });
            // Close the polygon
            dataOutline.setY(spiderPoints.length, spiderPoints[0].y);
            dataOutline.setX(spiderPoints.length, spiderPoints[0].x);
            plot.addLine(dataOutline);

            // 5. Draw data points
            const pointColor = hexToColorRGBA(colors.points, 1.0);
            spiderPoints.forEach((point) => {
                // Create a square point (simpler than circle)
                const pointLine = new WebglLine(pointColor, 5);
                const pointSize = 0.025;
                
                // Square points
                pointLine.setY(0, point.y - pointSize);
                pointLine.setX(0, point.x - pointSize);
                pointLine.setY(1, point.y + pointSize);
                pointLine.setX(1, point.x - pointSize);
                pointLine.setY(2, point.y + pointSize);
                pointLine.setX(2, point.x + pointSize);
                pointLine.setY(3, point.y - pointSize);
                pointLine.setX(3, point.x + pointSize);
                pointLine.setY(4, point.y - pointSize);
                pointLine.setX(4, point.x - pointSize);
                
                plot.addLine(pointLine);
            });

            setIsInitialized(true);

            // Animation loop
            const render = () => {
                if (plotRef.current) {
                    plotRef.current.clear();
                    plotRef.current.update();
                    plotRef.current.draw();
                }
                animationRef.current = requestAnimationFrame(render);
            };

            render();

        } catch (error) {
            console.error('WebGL Spider Plot initialization failed:', error);
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            if (plotRef.current) {
                plotRef.current.removeAllLines();
            }
        };
    }, [width, height, plotData, colors, webLevels]);

    // Calculate label positions for HTML overlay
    const getLabelPositions = () => {
        if (!isInitialized) return [];
        
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.32; // Adjusted for better positioning
        const angleStep = (2 * Math.PI) / plotData.length;

        return plotData.map((item, index) => {
            const angle = index * angleStep - Math.PI / 2;
            const labelRadius = radius + 25;
            
            return {
                x: centerX + labelRadius * Math.cos(angle),
                y: centerY + labelRadius * Math.sin(angle),
                value: Math.round(item.value),
                label: item.label
            };
        });
    };

    const labelPositions = getLabelPositions();

    return (
        <div 
            className={`relative ${className}`} 
            style={{ width, height, backgroundColor, borderRadius: '8px', overflow: 'hidden' }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'transparent'
                }}
            />
            
            {/* HTML Labels Overlay */}
            {showLabels && isInitialized && (
                <div className="absolute inset-0 pointer-events-none">
                    {labelPositions.map((pos, index) => (
                        <div
                            key={`label-${index}`}
                            className="absolute transform -translate-x-1/2 -translate-y-1/2 text-center"
                            style={{ 
                                left: pos.x, 
                                top: pos.y,
                                color: colors.labels,
                                fontSize: Math.max(10, Math.min(14, width / 20)),
                                fontWeight: '600'
                            }}
                        >
                            <div>{pos.label}</div>
                            {showValues && (
                                <div 
                                    className="text-xs opacity-80 font-bold"
                                    style={{ 
                                        fontSize: Math.max(8, Math.min(12, width / 25)),
                                        color: colors.points
                                    }}
                                >
                                    {pos.value}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Animation indicator */}
            {animated && (
                <div className="absolute top-2 right-2 w-2 h-2 bg-green-400 rounded-full animate-pulse opacity-70" />
            )}
        </div>
    );
};

// Example component for testing
export const SpiderPlotExample: React.FC = () => {
    return (
        <div className="p-8 bg-slate-100 rounded-lg">
            <h3 className="text-gray-800 font-semibold mb-4">Animated WebGL Spider Plot</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Static version */}
                <div>
                    <h4 className="text-sm text-gray-600 mb-2">Static Version</h4>
                    <SpiderPlot 
                        width={300}
                        height={300}
                        showLabels={true}
                        showValues={true}
                        backgroundColor="rgba(255, 255, 255, 0.8)"
                        animated={false}
                        data={[
                            { label: 'Speed', value: 85, maxValue: 100 },
                            { label: 'Power', value: 92, maxValue: 100 },
                            { label: 'Accuracy', value: 78, maxValue: 100 },
                            { label: 'Defense', value: 65, maxValue: 100 },
                            { label: 'Agility', value: 88, maxValue: 100 },
                            { label: 'Intelligence', value: 73, maxValue: 100 },
                        ]}
                    />
                </div>

                {/* Animated version */}
                <div>
                    <h4 className="text-sm text-gray-600 mb-2">Animated Version (Random Values)</h4>
                    <SpiderPlot 
                        width={300}
                        height={300}
                        showLabels={true}
                        showValues={true}
                        backgroundColor="rgba(59, 130, 246, 0.05)"
                        animated={true}
                        colors={{
                            web: '#E5E7EB',
                            fill: '#3B82F6',
                            stroke: '#1D4ED8',
                            points: '#1E40AF',
                            labels: '#374151'
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default SpiderPlot;