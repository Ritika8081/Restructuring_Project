'use client';

/**
 * src/components/FFTPlot.tsx
 *
 * Purpose: WebGL-based FFT visualization used for frequency-domain widgets.
 * Produces a simulated FFT stream when `enableSimulation` is true and exposes
 * a reusable React component for embedding in dashboard widgets.
 *
 * Exports: default FFTPlotRealtime component
 */
import React, { useRef, useEffect } from 'react';
import { WebglPlot, WebglLine, ColorRGBA } from 'webgl-plot';

interface FFTPlotRealtimeProps {
  color?: string;
  width?: number;
  height?: number;
  bufferSize?: number;
  showGrid?: boolean;
  backgroundColor?: string;
  enableSimulation?: boolean;
}

const FFTPlotRealtime: React.FC<FFTPlotRealtimeProps> = ({
  color = '#22D3EE',
  width = 600,
  height = 250,
  bufferSize = 256,
  showGrid = true,
  backgroundColor = 'rgba(0, 0, 0, 0.1)',
  enableSimulation = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plotRef = useRef<WebglPlot | null>(null);
  const lineRef = useRef<WebglLine | null>(null);
  const animationRef = useRef<number | null>(null);

  // Convert hex to ColorRGBA
  const hexToColorRGBA = (hex: string): ColorRGBA => {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
    const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
    const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
    return new ColorRGBA(r, g, b, 1.0);
  };

  // Generate FFT-like data
  const generateFFTData = () => {
    const data = new Array(bufferSize);
    const time = Date.now() / 1000;
    
    for (let i = 0; i < bufferSize; i++) {
      // Simulate frequency domain data
      const freq = (i / bufferSize) * 2; // Normalized frequency
      
      // Create a realistic FFT magnitude response
      let magnitude = 0;
      
      // Add some peaks at specific frequencies
      magnitude += Math.exp(-Math.pow((freq - 0.2) * 10, 2)) * 0.8; // Peak at low freq
      magnitude += Math.exp(-Math.pow((freq - 0.6) * 8, 2)) * 0.6;  // Peak at mid freq
      magnitude += Math.exp(-Math.pow((freq - 1.2) * 6, 2)) * 0.4;  // Peak at high freq
      
      // Add noise and time variation
      magnitude += Math.sin(time * 2 + freq * 10) * 0.1;
      magnitude += (Math.random() - 0.5) * 0.05;
      
      // Apply frequency rolloff (typical in FFT)
      magnitude *= Math.exp(-freq * 0.5);
      
      // Normalize to WebGL coordinate system (-1 to 1)
      data[i] = Math.max(-1, Math.min(1, magnitude * 2 - 1));
    }
    
    return data;
  };

  // Update FFT data
  const updateFFT = (fftArray: number[]) => {
    const line = lineRef.current;
    if (!line) return;
    
    for (let i = 0; i < Math.min(line.numPoints, fftArray.length); i++) {
      line.setY(i, fftArray[i]);
    }
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    try {
      const plot = new WebglPlot(canvas);
      plotRef.current = plot;

      const colorObj = hexToColorRGBA(color);
      const line = new WebglLine(colorObj, bufferSize);
      
      // Configure line for FFT display
      line.lineSpaceX(-1, 2 / bufferSize);
      line.scaleY = 0.8;
      line.offsetY = -0.2; // Offset for better FFT visualization
      
      plot.addLine(line);
      lineRef.current = line;

      // Initialize with zeros
      for (let i = 0; i < bufferSize; i++) {
        line.setY(i, -1);
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
      console.error('WebGL FFT Plot initialization failed:', error);
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

  // FFT simulation
  useEffect(() => {
    if (!enableSimulation) return;

    const interval = setInterval(() => {
      const fftData = generateFFTData();
      updateFFT(fftData);
    }, 50); // Update at 20 FPS for FFT

    return () => clearInterval(interval);
  }, [bufferSize, enableSimulation]);

  return (
    <div
      style={{
        width,
        height,
        borderRadius: '8px',
        overflow: 'hidden',
       
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          flex: 1,
          position: 'relative',
          zIndex: 1
        }}
      />

      {/* Any overlay elements should have lower z-index than header */}
      {showGrid && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
                linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 40px',
            zIndex: 5 // Lower than header controls
          }}
        />
      )}
    </div>
  );
};

export default FFTPlotRealtime;
