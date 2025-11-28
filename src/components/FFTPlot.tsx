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
  // Optional incoming FFT/magnitude data from upstream widgets (normalized or raw magnitudes)
  inputData?: number[];
}

const FFTPlotRealtime: React.FC<FFTPlotRealtimeProps> = ({
  color = '#22D3EE',
  width = 600,
  height = 250,
  bufferSize = 256,
  showGrid = true,
  backgroundColor = 'rgba(0, 0, 0, 0.1)',
  // Disable built-in simulation by default to avoid showing random data when the
  // component isn't connected to an upstream data source. Set to true explicitly
  // for demos.
  enableSimulation = false,
  inputData,
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
      // Deterministic time variation only — removed all random noise
      magnitude += Math.sin(time * 2 + freq * 10) * 0.1;
      // small deterministic micro-variation (no Math.random)
      magnitude += Math.sin(time * 3 + freq * 7) * 0.01;
      
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

  // Render from either upstream inputData (if provided) or the local simulation
  useEffect(() => {
    let interval: number | undefined;

    const pushInputData = (arr: number[]) => {
      // Ensure array length matches line.numPoints; pad or truncate as necessary
      const targetLen = lineRef.current?.numPoints ?? bufferSize;
      const out = new Array(targetLen).fill(-1);

      if (!arr || arr.length === 0) {
        updateFFT(out);
        return;
      }

      // If incoming data length differs, resample/truncate/pad
      if (arr.length === targetLen) {
        for (let i = 0; i < targetLen; i++) {
          // Normalize to -1..1 if values look like magnitudes
          const v = arr[i] ?? 0;
          out[i] = normalizeToWebGL(v, arr);
        }
      } else {
        // Simple resampling: pick by index mapping
        for (let i = 0; i < targetLen; i++) {
          const srcIdx = Math.floor((i / targetLen) * arr.length);
          out[i] = normalizeToWebGL(arr[srcIdx] ?? 0, arr);
        }
      }

      updateFFT(out);
    };

    if (inputData && inputData.length > 0) {
    
      // If upstream provides data, render it at animation frame rate
      pushInputData(inputData);
      interval = window.setInterval(() => pushInputData(inputData), 50);
    } else if (enableSimulation) {
      interval = window.setInterval(() => {
        const fftData = generateFFTData();
        updateFFT(fftData);
      }, 50);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [bufferSize, enableSimulation, inputData]);

  // Simple UI indicator when there is no input data and simulation is off
  const showNoInput = !inputData || inputData.length === 0;

  // Normalize an incoming value (v) to -1..1 based on the array's max (if >0)
  const normalizeToWebGL = (v: number, arr: number[]) => {
    if (!arr || arr.length === 0) return -1;
    const max = Math.max(...arr.map((x) => Math.abs(x || 0)), 1e-6);
    const norm = (v || 0) / max; // 0..1 (or more)
    // Map to -1..1 range expected by WebGL plot
    return Math.max(-1, Math.min(1, norm * 2 - 1));
  };

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

      {showNoInput && !enableSimulation && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 10 }}>
          <div style={{ background: 'rgba(0,0,0,0.45)', color: 'white', padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>No FFT input data</div>
        </div>
      )}

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
