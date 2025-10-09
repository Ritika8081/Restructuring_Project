'use client';

import React, { useEffect, useRef } from 'react';

interface StatisticData {
  label: string;
  value: number;
}

interface StatisticGraphProps {
  data: StatisticData[];
  type: 'bar' | 'line';
  width?: number;
  height?: number;
  colors?: string[];
  showLabels?: boolean;
  showValues?: boolean;
  showGrid?: boolean;
  backgroundColor?: string;
}

const StatisticGraph: React.FC<StatisticGraphProps> = ({
  data = [],
  type = 'bar',
  width = 400,
  height = 300,
  colors = ['#3b82f6', '#ef4444', '#10b981', '#f97316', '#8b5cf6', '#ec4899'],
  showLabels = true,
  showValues = true,
  showGrid = true,
  backgroundColor = '#ffffff'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size with device pixel ratio for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Calculate dimensions
    const padding = 60;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    const maxValue = Math.max(...data.map(d => d.value));
    const minValue = Math.min(...data.map(d => d.value));
    const valueRange = maxValue - minValue || 1;

    // Draw grid if enabled
    if (showGrid) {
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 0.5;
      
      // Horizontal grid lines
      for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight * i) / 5;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(padding + chartWidth, y);
        ctx.stroke();
      }
      
      // Vertical grid lines for bar chart
      if (type === 'bar') {
        for (let i = 0; i <= data.length; i++) {
          const x = padding + (chartWidth * i) / data.length;
          ctx.beginPath();
          ctx.moveTo(x, padding);
          ctx.lineTo(x, padding + chartHeight);
          ctx.stroke();
        }
      }
    }

    if (type === 'bar') {
      // Draw bars
      const barWidth = (chartWidth / data.length) * 0.7;
      const barSpacing = (chartWidth / data.length) * 0.3;

      data.forEach((item, index) => {
        const normalizedValue = Math.max(0, (item.value - minValue) / valueRange);
        const barHeight = normalizedValue * chartHeight;
        const x = padding + (index * chartWidth) / data.length + barSpacing / 2;
        const y = padding + chartHeight - barHeight;

        // Draw bar with gradient
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        const color = colors[index % colors.length];
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, color + '80');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);

        // Draw border
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, barWidth, barHeight);

        // Draw value label if enabled
        if (showValues) {
          ctx.fillStyle = '#374151';
          ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.textAlign = 'center';
          const valueText = typeof item.value === 'number' 
            ? item.value.toFixed(1) 
            : String(item.value);
          ctx.fillText(valueText, x + barWidth / 2, y - 8);
        }

        // Draw label if enabled
        if (showLabels) {
          ctx.fillStyle = '#6b7280';
          ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.textAlign = 'center';
          
          const labelY = padding + chartHeight + 20;
          const labelX = x + barWidth / 2;
          
          // Rotate labels if they're long
          if (item.label.length > 8) {
            ctx.save();
            ctx.translate(labelX, labelY);
            ctx.rotate(-Math.PI / 6);
            ctx.fillText(item.label, 0, 0);
            ctx.restore();
          } else {
            ctx.fillText(item.label, labelX, labelY);
          }
        }
      });
    } else if (type === 'line') {
      // Draw line chart
      if (data.length > 1) {
        // Use the first color for the main line
        ctx.strokeStyle = colors[0];
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        // Create smooth curve
        data.forEach((item, index) => {
          const x = padding + (index * chartWidth) / (data.length - 1);
          const normalizedValue = (item.value - minValue) / valueRange;
          const y = padding + chartHeight - (normalizedValue * chartHeight);

          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });

        ctx.stroke();

        // Draw data points with individual colors
        data.forEach((item, index) => {
          const x = padding + (index * chartWidth) / (data.length - 1);
          const normalizedValue = (item.value - minValue) / valueRange;
          const y = padding + chartHeight - (normalizedValue * chartHeight);

          // Get color for this data point
          const pointColor = colors[index % colors.length];

          // Draw outer ring with border for better visibility
          ctx.strokeStyle = pointColor;
          ctx.lineWidth = 2;
          ctx.fillStyle = pointColor;
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Inner dot (white center)
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();

          // Draw value label if enabled
          if (showValues) {
            ctx.fillStyle = '#374151';
            ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'center';
            const valueText = typeof item.value === 'number' 
              ? item.value.toFixed(1) 
              : String(item.value);
            ctx.fillText(valueText, x, y - 12);
          }
        });

        // Draw labels if enabled
        if (showLabels) {
          data.forEach((item, index) => {
            const x = padding + (index * chartWidth) / (data.length - 1);
            ctx.fillStyle = '#6b7280';
            ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'center';
            
            const labelY = padding + chartHeight + 20;
            
            if (item.label.length > 8) {
              ctx.save();
              ctx.translate(x, labelY);
              ctx.rotate(-Math.PI / 6);
              ctx.fillText(item.label, 0, 0);
              ctx.restore();
            } else {
              ctx.fillText(item.label, x, labelY);
            }
          });
        }
      }
    }

    // Draw axes
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Y-axis
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + chartHeight);
    // X-axis
    ctx.lineTo(padding + chartWidth, padding + chartHeight);
    ctx.stroke();

    // Draw Y-axis labels
    if (showGrid) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      
      for (let i = 0; i <= 5; i++) {
        const value = minValue + (valueRange * (5 - i)) / 5;
        const y = padding + (chartHeight * i) / 5;
        const valueText = typeof value === 'number' 
          ? value.toFixed(1) 
          : String(value);
        ctx.fillText(valueText, padding - 8, y);
      }
    }

  }, [data, type, width, height, colors, showLabels, showValues, showGrid, backgroundColor]);

  if (data.length === 0) {
    return (
      <div 
        style={{ 
          width: `${width}px`, 
          height: `${height}px`,
          backgroundColor: backgroundColor
        }}
        className="flex items-center justify-center border border-gray-200 rounded-lg"
      >
        <p className="text-gray-500 text-sm">No data available</p>
      </div>
    );
  }

  return (
    <div 
      style={{ 
        width: `${width}px`, 
        height: `${height}px`,
        backgroundColor: backgroundColor
      }}
      className="border border-gray-200 rounded-lg overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        className="block"
      />
    </div>
  );
};

export default StatisticGraph;
