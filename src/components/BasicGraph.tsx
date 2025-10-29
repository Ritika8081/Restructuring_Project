'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useChannelData } from '@/lib/channelDataContext';
import { WebglPlot, WebglLine, ColorRGBA } from 'webgl-plot';

interface Channel {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  scale?: number;
  offset?: number;
}

interface BasicGraphRealtimeProps {
  channels?: Channel[];
  bufferSize?: number;
  width?: number;
  height?: number; // Change this to total height instead of channelHeight
  showGrid?: boolean;
  backgroundColor?: string;
  showLegend?: boolean;
  sampleRate?: number;
  timeWindow?: number;
  onChannelsChange?: (channels: Channel[]) => void;
  showChannelControls?: boolean;
  onSizeRequest?: (minWidth: number, minHeight: number) => void;
}

const DEFAULT_COLORS = [
  '#10B981', '#3B82F6', '#F59E0B', '#EF4444', 
  '#8B5CF6', '#06B6D4', '#F97316', '#84CC16',
  '#EC4899', '#6366F1', '#14B8A6', '#F43F5E'
];

const BasicGraphRealtime: React.FC<BasicGraphRealtimeProps> = (props) => {
  const { samples } = useChannelData();
  const {
    channels: initialChannels = [
      { id: 'ch1', name: 'CH 1', color: '#10B981', visible: true },
    ],
  bufferSize = 1000,
    width = 400,
    height = 200,
    showGrid = true,
    backgroundColor = 'rgba(0, 0, 0, 0.1)',
    showLegend = false,
    sampleRate = 60,
    timeWindow = 8,
    onChannelsChange,
    showChannelControls = false,
    onSizeRequest,
  } = props;
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const plotRefs = useRef<Map<string, WebglPlot>>(new Map());
  const linesRef = useRef<Map<string, WebglLine>>(new Map());
  const animationRef = useRef<number | null>(null);
  const dataBuffers = useRef<Map<string, number[]>>(new Map());
  
  // Update internal channels when external channels change
  useEffect(() => {
    setChannels(initialChannels);
  }, [initialChannels]);

  // Calculate dynamic channel height
  const visibleChannels = channels.filter(ch => ch.visible);
  const channelCount = Math.max(1, visibleChannels.length);
  const borderSpace = Math.max(0, channelCount - 1);
  const availableHeightForChannels = Math.max(0, height - borderSpace);
  const dynamicChannelHeight = Math.floor(availableHeightForChannels / channelCount);

  // Calculate minimum required dimensions
  const minChannelHeight = 60;
  const minTotalWidth = 180;
  const requiredCanvasHeight = (channelCount * minChannelHeight) + borderSpace;
  const requiredCanvasWidth = minTotalWidth;
  
  // Request resize if current dimensions are too small
  useEffect(() => {
    if (onSizeRequest && (width < requiredCanvasWidth || height < requiredCanvasHeight)) {
      onSizeRequest(requiredCanvasWidth, requiredCanvasHeight);
    }
  }, [width, height, requiredCanvasWidth, requiredCanvasHeight, onSizeRequest]);

  // Update parent when channels change
  const channelsStringRef = useRef<string>('');
  useEffect(() => {
    const channelsString = JSON.stringify(channels.map(ch => ({ id: ch.id, visible: ch.visible })));
    if (onChannelsChange && channelsString !== channelsStringRef.current) {
      channelsStringRef.current = channelsString;
      onChannelsChange(channels);
    }
  }, [channels, onChannelsChange]);

  // Fixed hex color to ColorRGBA conversion
  const hexToColorRGBA = (hex: string): ColorRGBA => {
    const cleanHex = hex.replace('#', '');
    let r, g, b, a = 1.0;

    if (cleanHex.length === 6) {
      r = parseInt(cleanHex.substring(0, 2), 16) / 255;
      g = parseInt(cleanHex.substring(2, 4), 16) / 255;
      b = parseInt(cleanHex.substring(4, 6), 16) / 255;
    } else if (cleanHex.length === 8) {
      r = parseInt(cleanHex.substring(0, 2), 16) / 255;
      g = parseInt(cleanHex.substring(2, 4), 16) / 255;
      b = parseInt(cleanHex.substring(4, 6), 16) / 255;
      a = parseInt(cleanHex.substring(6, 8), 16) / 255;
    } else {
      r = 0.39; g = 0.4; b = 0.945;
    }

    return new ColorRGBA(r, g, b, a);
  };

  // Initialize canvases and plots for visible channels - responds to height changes
  useEffect(() => {
    // Clean up removed channels
    const currentChannelIds = new Set(visibleChannels.map(ch => ch.id));
    
    // Remove old canvases and plots
    for (const [channelId, plot] of plotRefs.current) {
      if (!currentChannelIds.has(channelId)) {
        plot.removeAllLines();
        plotRefs.current.delete(channelId);
        linesRef.current.delete(channelId);
        dataBuffers.current.delete(channelId);
        canvasRefs.current.delete(channelId);
      }
    }

    // Initialize/update all visible channels with new dimensions
    visibleChannels.forEach((channel) => {
      const canvas = canvasRefs.current.get(channel.id);
      if (!canvas) return;

      const devicePixelRatio = window.devicePixelRatio || 1;
      
      // Update canvas size with dynamic height
      const canvasWidth = Math.max(0, (width || 400));
      const canvasHeight = Math.max(0, dynamicChannelHeight);
      canvas.width = canvasWidth * devicePixelRatio;
      canvas.height = canvasHeight * devicePixelRatio;
      canvas.style.width = `100%`;
      canvas.style.height = `100%`;

      try {
        // Clean up existing plot
        const existingPlot = plotRefs.current.get(channel.id);
        if (existingPlot) {
          existingPlot.removeAllLines();
        }

        const plot = new WebglPlot(canvas);
        plotRefs.current.set(channel.id, plot);

        const colorObj = hexToColorRGBA(channel.color);
        const line = new WebglLine(colorObj, bufferSize);

        // Set line properties for individual canvas
        line.lineSpaceX(-1, 2 / bufferSize);
        line.scaleY = 0.4;
        line.offsetY = 0;

        // Initialize with zeros or restore existing data
        const existingBuffer = dataBuffers.current.get(channel.id);
        if (existingBuffer) {
          for (let i = 0; i < Math.min(bufferSize, existingBuffer.length); i++) {
            line.setY(i, existingBuffer[i] || 0);
          }
        } else {
          for (let i = 0; i < bufferSize; i++) {
            line.setY(i, 0);
          }
          dataBuffers.current.set(channel.id, new Array(bufferSize).fill(0));
        }

        plot.addLine(line);
        linesRef.current.set(channel.id, line);

      } catch (error) {
        console.error(`WebGL initialization failed for channel ${channel.id}:`, error);
      }
    });

    // Start animation loop
    const render = () => {
      animationRef.current = requestAnimationFrame(render);
      
      // Render each visible channel's plot
      visibleChannels.forEach((channel) => {
        const plot = plotRefs.current.get(channel.id);
        if (plot) {
          plot.clear();
          plot.update();
          plot.draw();
        }
      });
    };

    if (visibleChannels.length > 0) {
      render();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [channels, visibleChannels, bufferSize, width, height, dynamicChannelHeight]); // Added height dependency

  // Update function for new samples
  const pushData = (channelId: string, newValue: number) => {
    const line = linesRef.current.get(channelId);
    const buffer = dataBuffers.current.get(channelId);
    
    if (!line || !buffer) return;

    // Shift buffer
    buffer.shift();
    buffer.push(newValue);

    // Update line
    for (let i = 0; i < line.numPoints; i++) {
      line.setY(i, buffer[i]);
    }
  };

  // Simulated multi-channel data stream 
  // Live device data stream from context
  useEffect(() => {
    if (!samples || samples.length === 0) return;
    // Filter and normalize device data before plotting
    const normalize = (value: number) => {
      if (value === undefined || value === null) return 0;
      return Math.max(-1, Math.min(1, value));
    };
    samples.slice(-bufferSize).forEach(sample => {
      if (channels.length > 0) {
        // Using raw samples (no EXG/Notch filtering)
        if (channels[0] && channels[0].visible && sample.ch0 !== undefined) {
          pushData(channels[0].id, normalize(sample.ch0));
        }

        if (channels[1] && channels[1].visible && sample.ch1 !== undefined) {
          pushData(channels[1].id, normalize(sample.ch1));
        }

        if (channels[2] && channels[2].visible && sample.ch2 !== undefined) {
          pushData(channels[2].id, normalize(sample.ch2));
        }
      }
    });
  }, [samples, channels, bufferSize]);

  return (
    <div
      style={{
        width: width || 400,
        height: height,
        borderRadius: '4px',
        overflow: 'hidden',
        backgroundColor: backgroundColor,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}
      className="overflow-hidden"
    >
      {/* Channel Canvases */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {visibleChannels.map((channel, index) => (
          <div key={channel.id} className="relative overflow-hidden flex items-center justify-center" style={{ 
            height: dynamicChannelHeight,
            flex: 'none'
          }}>
            {/* Channel Label */}
            <div className="absolute top-1 left-2 z-10 text-xs font-medium px-2 py-1 bg-white bg-opacity-90 rounded "
                 style={{ color: channel.color }}>
              {channel.name}
            </div>
            
            {/* Channel Canvas */}
            <canvas
              ref={(el) => {
                if (el) {
                  canvasRefs.current.set(channel.id, el);
                } else {
                  canvasRefs.current.delete(channel.id);
                }
              }}
              style={{
                display: 'block',
                backgroundColor: 'transparent',
                width: '100%',
                height: '100%',
                borderBottom: index < visibleChannels.length - 1 ? '1px solid rgba(0,0,0,0.1)' : 'none'
              }}
            />

            {/* Grid overlay for each channel */}
            {showGrid && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: `
                    linear-gradient(rgba(0, 0, 0, 0.05) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(0, 0, 0, 0.05) 1px, transparent 1px)
                  `,
                  backgroundSize: `50px ${Math.max(20, dynamicChannelHeight / 4)}px`
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BasicGraphRealtime;
