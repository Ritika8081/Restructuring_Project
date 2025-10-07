'use client';

import React, { useMemo } from 'react';

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
}

const SpiderPlot: React.FC<SpiderPlotProps> = ({
    data,
    width = 300,
    height = 300,
    colors = {
        web: 'rgba(148, 163, 184, 0.7)', // Increased opacity from 0.3 to 0.7
        fill: 'rgba(16, 185, 129, 0.2)',
        stroke: 'rgba(16, 185, 129, 0.8)',
        points: 'rgba(16, 185, 129, 1)',
        labels: 'rgba(255, 255, 255, 0.9)'
    },
    showLabels = true,
    showValues = true,
    className = ''
}) => {
    // Use fixed sample data if no data is provided
    const defaultData: SpiderPlotData[] = [
        { label: 'Speed', value: 85, maxValue: 100 },
        { label: 'Power', value: 92, maxValue: 100 },
        { label: 'Skill', value: 78, maxValue: 100 },
        { label: 'Defense', value: 65, maxValue: 100 },
        { label: 'Health', value: 88, maxValue: 100 },
        { label: 'Magic', value: 45, maxValue: 100 },
    ];

    const plotData = useMemo(() => {
        const actualData = data && data.length > 0 ? data : defaultData;
        
        if (!actualData || actualData.length === 0) return null;

        const center = { x: width / 2, y: height / 2 };
        const radius = Math.min(width, height) / 2 - (showLabels ? 40 : 20); // Adjust for labels
        const angleStep = (2 * Math.PI) / actualData.length;

        // Calculate points for the data polygon
        const dataPoints = actualData.map((item, index) => {
            const angle = index * angleStep - Math.PI / 2; // Start from top
            const maxVal = item.maxValue || 100;
            const normalizedValue = Math.min(item.value / maxVal, 1);
            const pointRadius = radius * normalizedValue;
            
            return {
                x: center.x + pointRadius * Math.cos(angle),
                y: center.y + pointRadius * Math.sin(angle),
                labelX: center.x + (radius + 25) * Math.cos(angle),
                labelY: center.y + (radius + 25) * Math.sin(angle),
                angle,
                value: item.value,
                label: item.label,
                normalizedValue
            };
        });

        // Create web grid points (concentric polygons) - Increased to 5 levels for better visibility
        const webLevels = 5;
        const webPolygons = Array.from({ length: webLevels }, (_, level) => {
            const levelRadius = radius * ((level + 1) / webLevels);
            return actualData.map((_, index) => {
                const angle = index * angleStep - Math.PI / 2;
                return {
                    x: center.x + levelRadius * Math.cos(angle),
                    y: center.y + levelRadius * Math.sin(angle)
                };
            });
        });

        // Create axis lines
        const axisLines = actualData.map((_, index) => {
            const angle = index * angleStep - Math.PI / 2;
            return {
                x1: center.x,
                y1: center.y,
                x2: center.x + radius * Math.cos(angle),
                y2: center.y + radius * Math.sin(angle)
            };
        });

        return {
            center,
            radius,
            dataPoints,
            webPolygons,
            axisLines,
            data: actualData
        };
    }, [data, width, height, showLabels]);

    if (!plotData) {
        return (
            <div className={`flex items-center justify-center ${className}`} style={{ width, height }}>
                <div className="text-white/50 text-sm">No data available</div>
            </div>
        );
    }

    const { dataPoints, webPolygons, axisLines } = plotData;

    // Create SVG path for the data polygon
    const dataPolygonPath = dataPoints.reduce((path, point, index) => {
        const command = index === 0 ? 'M' : 'L';
        return `${path} ${command} ${point.x} ${point.y}`;
    }, '') + ' Z';

    // Determine font sizes based on plot size
    const labelFontSize = Math.max(8, Math.min(12, width / 25));
    const valueFontSize = Math.max(6, Math.min(10, width / 30));

    return (
        <div className={`relative ${className}`}>
            <svg width={width} height={height} className="overflow-visible">
                <defs>
                    {/* Gradient for the data area */}
                    <radialGradient id={`spiderGradient-${width}-${height}`} cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor={colors.fill} stopOpacity="0.6" />
                        <stop offset="100%" stopColor={colors.fill} stopOpacity="0.1" />
                    </radialGradient>
                    
                    {/* Glow effect for data points */}
                    <filter id={`pointGlow-${width}-${height}`}>
                        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                        <feMerge> 
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>

                {/* Draw web grid - Enhanced visibility */}
                {webPolygons.map((polygon, level) => (
                    <polygon
                        key={`web-${level}`}
                        points={polygon.map(p => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke={colors.web}
                        strokeWidth="1.5" // Increased from 1 to 1.5
                        opacity={1.0 - (level * 0.12)} // Adjusted opacity range for better visibility
                        strokeDasharray={level === 0 ? "none" : level % 2 === 0 ? "4,2" : "none"} // Add dashed lines for variety
                    />
                ))}

                {/* Draw axis lines - Enhanced visibility */}
                {axisLines.map((line, index) => (
                    <line
                        key={`axis-${index}`}
                        x1={line.x1}
                        y1={line.y1}
                        x2={line.x2}
                        y2={line.y2}
                        stroke={colors.web}
                        strokeWidth="1.5" // Increased from 1 to 1.5
                        opacity="0.8" // Increased from 0.6 to 0.8
                    />
                ))}

                {/* Draw data polygon */}
                <path
                    d={dataPolygonPath}
                    fill={`url(#spiderGradient-${width}-${height})`}
                    stroke={colors.stroke}
                    strokeWidth="2.5" // Slightly increased for better visibility
                    strokeLinejoin="round"
                />

                {/* Draw data points */}
                {dataPoints.map((point, index) => (
                    <circle
                        key={`point-${index}`}
                        cx={point.x}
                        cy={point.y}
                        r={Math.max(3, Math.min(5, width / 50))} // Slightly larger points
                        fill={colors.points}
                        stroke="white"
                        strokeWidth="2" // Increased stroke width
                        filter={`url(#pointGlow-${width}-${height})`}
                        className="drop-shadow-md" // Enhanced shadow
                    />
                ))}

                {/* Draw labels */}
                {showLabels && dataPoints.map((point, index) => (
                    <g key={`label-${index}`}>
                        <text
                            x={point.labelX}
                            y={point.labelY}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill={colors.labels}
                            fontSize={labelFontSize}
                            fontWeight="600" // Increased from 500 for better readability
                            className="select-none"
                        >
                            {point.label}
                        </text>
                        {showValues && (
                            <text
                                x={point.labelX}
                                y={point.labelY + labelFontSize + 2}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill={colors.labels}
                                fontSize={valueFontSize}
                                opacity="0.9" // Increased from 0.8
                                className="select-none"
                            >
                                {point.value}
                            </text>
                        )}
                    </g>
                ))}
            </svg>
        </div>
    );
};

// Updated example with better demonstration
export const SpiderPlotExample: React.FC = () => {
    return (
        <div className="p-4 bg-slate-800 rounded-lg">
            <h3 className="text-white font-semibold mb-4">Performance Metrics</h3>
            <SpiderPlot 
                width={300}
                height={300}
                showLabels={true}
                showValues={true}
            />
        </div>
    );
};

export default SpiderPlot;