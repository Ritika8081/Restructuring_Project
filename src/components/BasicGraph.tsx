'use client';
import React, { useEffect, useRef } from 'react';
import { WebglPlot, WebglLine, ColorRGBA } from 'webgl-plot';

interface BasicGraphRealtimeProps {
  color?: string;
  bufferSize?: number;
  width?: number;
  height?: number;
  showGrid?: boolean;
  backgroundColor?: string;
}

const BasicGraphRealtime: React.FC<BasicGraphRealtimeProps> = ({
  color = '#6366F1', 
  bufferSize = 512,
  width = 400,
  height = 200,
  showGrid = true,
  backgroundColor = 'rgba(0, 0, 0, 0.1)',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plotRef = useRef<WebglPlot | null>(null);
  const lineRef = useRef<WebglLine | null>(null);
  const animationRef = useRef<number | null>(null);

  // Fixed hex color to ColorRGBA conversion
  const hexToColorRGBA = (hex: string): ColorRGBA => {
    // Remove # if present and handle 8-digit hex (with alpha)
    const cleanHex = hex.replace('#', '');

    let r, g, b, a = 1.0;

    if (cleanHex.length === 6) {
      // Standard 6-digit hex
      r = parseInt(cleanHex.substring(0, 2), 16) / 255;
      g = parseInt(cleanHex.substring(2, 4), 16) / 255;
      b = parseInt(cleanHex.substring(4, 6), 16) / 255;
    } else if (cleanHex.length === 8) {
      // 8-digit hex with alpha
      r = parseInt(cleanHex.substring(0, 2), 16) / 255;
      g = parseInt(cleanHex.substring(2, 4), 16) / 255;
      b = parseInt(cleanHex.substring(4, 6), 16) / 255;
      a = parseInt(cleanHex.substring(6, 8), 16) / 255;
    } else {
      // Fallback to blue
      r = 0.39; // #6366F1
      g = 0.4;
      b = 0.945;
    }

    return new ColorRGBA(r, g, b, a);
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const devicePixelRatio = window.devicePixelRatio || 1;

    // Proper canvas sizing
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    try {
      const plot = new WebglPlot(canvas);
      plotRef.current = plot;

      const colorObj = hexToColorRGBA(color);
      const line = new WebglLine(colorObj, bufferSize);

      // Set line properties for better visibility
      line.lineSpaceX(-1, 2 / bufferSize);
      line.scaleY = 0.8; // Scale down to fit better in view
      line.offsetY = 0; // Center the line

      plot.addLine(line);
      lineRef.current = line;

      // Initialize with zeros
      for (let i = 0; i < bufferSize; i++) {
        line.setY(i, 0);
      }

      const render = () => {
        if (!plotRef.current) return;

        animationRef.current = requestAnimationFrame(render);
        plot.clear();
        plot.update();
        plot.draw();
      };

      render();
    } catch (error) {
      console.error('WebGL initialization failed:', error);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (plotRef.current) {
        plotRef.current.removeAllLines();
      }
    };
  }, [color, bufferSize, width, height]);

  // Update function for new samples
  const pushData = (newValue: number) => {
    const line = lineRef.current;
    if (!line) return;

    // Shift all points left
    for (let i = 0; i < line.numPoints - 1; i++) {
      line.setY(i, line.getY(i + 1));
    }
    // Add new point at the end
    line.setY(line.numPoints - 1, newValue);
  };

  // Simulated data stream 
  useEffect(() => {
    const interval = setInterval(() => {
      // Create a more visible signal with larger amplitude
      const time = Date.now() / 1000;
      const signal = Math.sin(time * 2) * 0.7 + Math.sin(time * 5) * 0.3 + Math.random() * 0.1;
      pushData(signal);
    }, 16); // ~60 FPS

    return () => clearInterval(interval);
  }, []);

  // WebGL plot handles its own rendering

  return (
    <div
      style={{
        width,
        height,
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: backgroundColor,
        position: 'relative'
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          backgroundColor: 'transparent'
        }}
      />

      {/* Optional grid overlay using CSS */}
      {showGrid && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 40px'
          }}
        />
      )}
    </div>
  );
};

export default BasicGraphRealtime;
