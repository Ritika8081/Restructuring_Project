'use client';

import React, { useMemo } from 'react';

interface DataPoint {
    label: string;
    value: number;
    color?: string;
}

interface StatisticGraphProps {
    data?: DataPoint[];
    type?: 'bar' | 'line' | 'area' | 'pie' | 'donut';
    width?: number;
    height?: number;
    colors?: string[];
    showLabels?: boolean;
    showValues?: boolean;
    showGrid?: boolean;
    animate?: boolean;
    className?: string;
}

const StatisticGraph: React.FC<StatisticGraphProps> = ({
    data,
    type = 'bar',
    width = 300,
    height = 200,
    colors = [
        '#8B5CF6', '#A78BFA', '#C4B5FD', '#DDD6FE', 
        '#EDE9FE', '#F3F0FF', '#7C3AED', '#6D28D9'
    ],
    showLabels = true,
    showValues = true,
    showGrid = true,
    animate = true,
    className = ''
}) => {
    // Default sample data with better values for visual appeal
    const defaultData: DataPoint[] = [
        { label: 'Q1', value: 85 },
        { label: 'Q2', value: 72 },
        { label: 'Q3', value: 95 },
        { label: 'Q4', value: 68 },
        { label: 'Q5', value: 89 },
        { label: 'Q6', value: 76 },
    ];

    const chartData = useMemo(() => {
        const actualData = data && data.length > 0 ? data : defaultData;
        const maxValue = Math.max(...actualData.map(d => d.value));
        const minValue = Math.min(...actualData.map(d => d.value));
        
        return {
            data: actualData.map((item, index) => ({
                ...item,
                color: item.color || colors[index % colors.length],
                normalizedValue: maxValue > 0 ? item.value / maxValue : 0
            })),
            maxValue,
            minValue,
            range: maxValue - minValue
        };
    }, [data, colors, defaultData]);

    // Bar Chart Component with improved gradients
    const BarChart = () => {
        const padding = { top: 20, right: 20, bottom: 40, left: 40 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        const barWidth = chartWidth / chartData.data.length * 0.7;
        const barSpacing = chartWidth / chartData.data.length;

        return (
            <svg width={width} height={height} className="overflow-visible">
                <defs>
                    {chartData.data.map((item, index) => (
                        <linearGradient key={index} id={`barGradient-${index}-${width}`} x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor={item.color} stopOpacity="0.9" />
                            <stop offset="50%" stopColor={item.color} stopOpacity="0.7" />
                            <stop offset="100%" stopColor={item.color} stopOpacity="0.5" />
                        </linearGradient>
                    ))}
                    
                    {/* Glow effect for bars */}
                    <filter id={`barGlow-${width}`}>
                        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                        <feMerge> 
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>

                {/* Enhanced grid lines */}
                {showGrid && (
                    <g opacity="0.4">
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => (
                            <line
                                key={index}
                                x1={padding.left}
                                y1={padding.top + chartHeight * ratio}
                                x2={padding.left + chartWidth}
                                y2={padding.top + chartHeight * ratio}
                                stroke="rgba(255, 255, 255, 0.3)"
                                strokeWidth="1"
                                strokeDasharray="3,3"
                            />
                        ))}
                    </g>
                )}

                {/* Bars with improved styling */}
                {chartData.data.map((item, index) => {
                    const barHeight = chartHeight * item.normalizedValue;
                    const x = padding.left + index * barSpacing + (barSpacing - barWidth) / 2;
                    const y = padding.top + chartHeight - barHeight;

                    return (
                        <g key={index}>
                            {/* Bar shadow */}
                            <rect
                                x={x + 2}
                                y={y + 2}
                                width={barWidth}
                                height={barHeight}
                                fill="rgba(0, 0, 0, 0.2)"
                                rx="6"
                                className="opacity-50"
                            />
                            
                            {/* Main bar */}
                            <rect
                                x={x}
                                y={y}
                                width={barWidth}
                                height={barHeight}
                                fill={`url(#barGradient-${index}-${width})`}
                                stroke="rgba(255, 255, 255, 0.2)"
                                strokeWidth="1"
                                rx="6"
                                filter={`url(#barGlow-${width})`}
                                className={animate ? "transition-all duration-1000 ease-out" : ""}
                            />
                            
                            {/* Values on top of bars */}
                            {showValues && (
                                <text
                                    x={x + barWidth / 2}
                                    y={y - 8}
                                    textAnchor="middle"
                                    fill="rgba(255, 255, 255, 0.9)"
                                    fontSize={Math.max(8, Math.min(12, width / 25))}
                                    fontWeight="600"
                                    className="drop-shadow-sm"
                                >
                                    {item.value}
                                </text>
                            )}

                            {/* Labels */}
                            {showLabels && (
                                <text
                                    x={x + barWidth / 2}
                                    y={height - 12}
                                    textAnchor="middle"
                                    fill="rgba(255, 255, 255, 0.8)"
                                    fontSize={Math.max(8, Math.min(11, width / 30))}
                                    fontWeight="500"
                                >
                                    {item.label}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>
        );
    };

    // Line Chart Component
    const LineChart = () => {
        const padding = { top: 20, right: 20, bottom: 40, left: 40 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        const points = chartData.data.map((item, index) => ({
            x: padding.left + (index * chartWidth) / (chartData.data.length - 1),
            y: padding.top + chartHeight - (chartHeight * item.normalizedValue),
            ...item
        }));

        const pathData = points.reduce((path, point, index) => {
            const command = index === 0 ? 'M' : 'L';
            return `${path} ${command} ${point.x} ${point.y}`;
        }, '');

        return (
            <svg width={width} height={height} className="overflow-visible">
                <defs>
                    <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={colors[0]} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={colors[0]} stopOpacity="0.1" />
                    </linearGradient>
                </defs>

                {/* Grid lines */}
                {showGrid && (
                    <g opacity="0.3">
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => (
                            <line
                                key={index}
                                x1={padding.left}
                                y1={padding.top + chartHeight * ratio}
                                x2={padding.left + chartWidth}
                                y2={padding.top + chartHeight * ratio}
                                stroke="rgba(148, 163, 184, 0.5)"
                                strokeWidth="1"
                                strokeDasharray="2,2"
                            />
                        ))}
                    </g>
                )}

                {/* Area fill */}
                {type === 'area' && (
                    <path
                        d={`${pathData} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`}
                        fill="url(#lineGradient)"
                    />
                )}

                {/* Line */}
                <path
                    d={pathData}
                    fill="none"
                    stroke={colors[0]}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />

                {/* Points */}
                {points.map((point, index) => (
                    <g key={index}>
                        <circle
                            cx={point.x}
                            cy={point.y}
                            r="4"
                            fill={colors[0]}
                            stroke="white"
                            strokeWidth="2"
                        />
                        
                        {/* Values */}
                        {showValues && (
                            <text
                                x={point.x}
                                y={point.y - 10}
                                textAnchor="middle"
                                fill="rgba(255, 255, 255, 0.9)"
                                fontSize="10"
                                fontWeight="500"
                            >
                                {point.value}
                            </text>
                        )}

                        {/* Labels */}
                        {showLabels && (
                            <text
                                x={point.x}
                                y={height - 10}
                                textAnchor="middle"
                                fill="rgba(255, 255, 255, 0.7)"
                                fontSize="10"
                            >
                                {point.label}
                            </text>
                        )}
                    </g>
                ))}
            </svg>
        );
    };

    // Pie/Donut Chart Component
    const PieChart = () => {
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2 - 30;
        const innerRadius = type === 'donut' ? radius * 0.5 : 0;
        
        const total = chartData.data.reduce((sum, item) => sum + item.value, 0);
        let currentAngle = -Math.PI / 2; // Start from top

        const segments = chartData.data.map((item, index) => {
            const angle = (item.value / total) * 2 * Math.PI;
            const startAngle = currentAngle;
            const endAngle = currentAngle + angle;
            
            const x1 = centerX + radius * Math.cos(startAngle);
            const y1 = centerY + radius * Math.sin(startAngle);
            const x2 = centerX + radius * Math.cos(endAngle);
            const y2 = centerY + radius * Math.sin(endAngle);
            
            const largeArcFlag = angle > Math.PI ? 1 : 0;
            
            let pathData;
            if (innerRadius > 0) {
                // Donut chart
                const ix1 = centerX + innerRadius * Math.cos(startAngle);
                const iy1 = centerY + innerRadius * Math.sin(startAngle);
                const ix2 = centerX + innerRadius * Math.cos(endAngle);
                const iy2 = centerY + innerRadius * Math.sin(endAngle);
                
                pathData = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${ix1} ${iy1} Z`;
            } else {
                // Pie chart
                pathData = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
            }

            // Label position
            const labelAngle = startAngle + angle / 2;
            const labelRadius = radius + 15;
            const labelX = centerX + labelRadius * Math.cos(labelAngle);
            const labelY = centerY + labelRadius * Math.sin(labelAngle);

            currentAngle = endAngle;

            return {
                pathData,
                color: item.color,
                value: item.value,
                label: item.label,
                percentage: ((item.value / total) * 100).toFixed(1),
                labelX,
                labelY
            };
        });

        return (
            <svg width={width} height={height} className="overflow-visible">
                {segments.map((segment, index) => (
                    <g key={index}>
                        <path
                            d={segment.pathData}
                            fill={segment.color}
                            stroke="white"
                            strokeWidth="2"
                            className={animate ? "transition-all duration-1000 ease-out" : ""}
                        />
                        
                        {/* Labels */}
                        {showLabels && (
                            <text
                                x={segment.labelX}
                                y={segment.labelY}
                                textAnchor="middle"
                                fill="rgba(255, 255, 255, 0.9)"
                                fontSize="10"
                                fontWeight="500"
                            >
                                {segment.label}
                            </text>
                        )}
                        
                        {/* Values/Percentages */}
                        {showValues && (
                            <text
                                x={segment.labelX}
                                y={segment.labelY + 12}
                                textAnchor="middle"
                                fill="rgba(255, 255, 255, 0.7)"
                                fontSize="9"
                            >
                                {segment.percentage}%
                            </text>
                        )}
                    </g>
                ))}
                
                {/* Center text for donut */}
                {type === 'donut' && (
                    <g>
                        <text
                            x={centerX}
                            y={centerY - 5}
                            textAnchor="middle"
                            fill="rgba(255, 255, 255, 0.9)"
                            fontSize="14"
                            fontWeight="600"
                        >
                            Total
                        </text>
                        <text
                            x={centerX}
                            y={centerY + 10}
                            textAnchor="middle"
                            fill="rgba(255, 255, 255, 0.7)"
                            fontSize="12"
                        >
                            {total}
                        </text>
                    </g>
                )}
            </svg>
        );
    };

    if (chartData.data.length === 0) {
        return (
            <div className={`flex items-center justify-center ${className}`} style={{ width, height }}>
                <div className="text-white/50 text-sm">No data available</div>
            </div>
        );
    }

    return (
        <div className={`relative ${className}`}>
          {/* Card Header */}
          <div className="absolute top-2 left-2 right-2 z-20 pointer-events-none">
            <h3 className="text-white font-semibold text-sm">
              {type === 'bar' ? 'Bar Chart' : 
               type === 'line' ? 'Line Chart' : 
               type === 'area' ? 'Area Chart' : 
               type === 'pie' ? 'Pie Chart' : 
               type === 'donut' ? 'Donut Chart' : 'Statistics'}
            </h3>
          </div>
          
          <div style={{ marginTop: '24px' }}>
            {type === 'bar' && <BarChart />}
            {(type === 'line' || type === 'area') && <LineChart />}
            {(type === 'pie' || type === 'donut') && <PieChart />}
          </div>
        </div>
    );
};

export default StatisticGraph;