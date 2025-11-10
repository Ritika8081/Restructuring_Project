"use client";

/**
 * src/components/SpiderPlot.tsx
 *
 * Purpose: Radial/spider plot visualization that aggregates multiple
 * channel-derived values (e.g. brainwave band powers) into a single
 * radar-like view. Integrates with a bandpower worker for live data.
 *
 * Exports: default SpiderPlot React component
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { WebglPlot, WebglLine, ColorRGBA } from 'webgl-plot';
import { useChannelData } from '@/lib/channelDataContext';

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
        web: '#7d838dff',
        fill: '#10B981',
        stroke: '#10B981',
        points: '#10B981',
        labels: '#8b929dff'
    },
    showLabels = true,
    showValues = true,
    className = '',
    backgroundColor = 'rgba(131, 128, 128, 0.02)',
    webLevels = 5,
    animated = true
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const plotRef = useRef<WebglPlot | null>(null);
    const animationRef = useRef<number | null>(null);
    const dataUpdateRef = useRef<NodeJS.Timeout | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [animatedData, setAnimatedData] = useState<SpiderPlotData[]>([]);

    // --- live data worker integration -------------------------------------------------
    // Configuration: choose channel index (0 = ch0) and FFT parameters
    const CHANNEL_INDEX = 0; // change to 1 or 2 to select other channel
    const FFT_SIZE = 256;
    const SAMPLE_RATE = 500;
    const SMOOTHER_WINDOW = 64; // worker-side smoother window
    const POST_RATE_MS = 200; // post to worker at ~5Hz

    const workerRef = useRef<Worker | null>(null);
    const lastPostRef = useRef<number>(0);
    const { samples } = useChannelData();
    const hasLiveData = !!(samples && samples.length >= FFT_SIZE);
    // -------------------------------------------------------------------------------

    // Constants
    const BRAINWAVE_LABELS = ['Alpha', 'Beta', 'Gamma', 'Theta', 'Delta'];
    const WEB_RADIUS = 0.7;
    const LABEL_OFFSET = 0.15;

    // Generate default pentagon data with brainwave labels (zeroed when no live data)
    const generateDefaultData = useCallback((): SpiderPlotData[] => {
        return BRAINWAVE_LABELS.map((label) => ({
            label,
            value: 0,
            maxValue: 100
        }));
    }, []);

    // Initialize data with brainwave labels (always override any incoming labels)
    useEffect(() => {
        // Merge incoming data onto a default zeroed brainwave template.
        // This avoids introducing random values when the provided data is
        // incomplete — missing entries will be zeroed instead.
        const defaultData = generateDefaultData();

        if (data && data.length > 0) {
            const merged = defaultData.map((d, idx) => {
                const src = data[idx];
                return {
                    label: BRAINWAVE_LABELS[idx] || d.label,
                    value: typeof src?.value === 'number' ? src.value : d.value,
                    maxValue: src?.maxValue ?? d.maxValue
                } as SpiderPlotData;
            });

            setAnimatedData(merged);
        } else {
            // No incoming data: keep labels but zero values so the plot remains empty
            setAnimatedData(defaultData);
        }
    }, [data, generateDefaultData]);
    
    // Demo animation removed: SpiderPlot will only show live/worker-driven data.

    // Create worker and wire messages -> update spider data
    useEffect(() => {
        try {
            workerRef.current = new Worker(new URL('@/workers/bandpower.worker.ts', import.meta.url), { type: 'module' });
        } catch (err) {
            // If bundler doesn't support new URL, developer should copy worker to public and use new Worker('/workers/bandpower.worker.js')
            console.error('Failed to create bandpower worker via URL import:', err);
            workerRef.current = null;
            return;
        }

        const w = workerRef.current as Worker;
        const handleMessage = (ev: MessageEvent<any>) => {
            if (!ev?.data) return;
            const smooth: Record<string, number> = ev.data.smooth || ev.data.relative || {};
            const order = ['alpha', 'beta', 'gamma', 'theta', 'delta'];
            const labels = ['Alpha', 'Beta', 'Gamma', 'Theta', 'Delta'];
            const newData = order.map((band, idx) => ({
                label: labels[idx],
                value: Math.round((smooth[band] ?? 0) * 100),
                maxValue: 100
            }));
            setAnimatedData(newData);
        };

        w.addEventListener('message', handleMessage);
        return () => {
            w.removeEventListener('message', handleMessage);
            try { w.terminate(); } catch (e) { /* ignore */ }
            workerRef.current = null;
        };
    }, []);

    // Post recent samples buffer to worker at a throttled rate
    useEffect(() => {
        if (!workerRef.current) return;
        if (!samples || samples.length < FFT_SIZE) return;

        const now = Date.now();
        if (now - lastPostRef.current < POST_RATE_MS) return;

        const start = Math.max(0, samples.length - FFT_SIZE);
        const slice = samples.slice(start, start + FFT_SIZE);
        const eeg = slice.map(s => {
            const val = (CHANNEL_INDEX === 0 ? s.ch0 : (CHANNEL_INDEX === 1 ? s.ch1 : s.ch2));
            return typeof val === 'number' ? val : 0;
        });

        try {
            workerRef.current.postMessage({ eeg, sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE, smootherWindow: SMOOTHER_WINDOW });
            lastPostRef.current = now;
        } catch (err) {
            console.error('Failed to post to bandpower worker', err);
        }
    }, [samples]);

    const plotData = animatedData;

    // Convert hex color to ColorRGBA
    const hexToColorRGBA = (hex: string, alpha: number = 1.0): ColorRGBA => {
        const cleanHex = hex.replace('#', '');
        const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
        const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
        const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
        return new ColorRGBA(r, g, b, alpha);
    };

    // Helper function to create dotted lines
    const createDottedLine = (
        plot: WebglPlot, 
        startX: number, 
        startY: number, 
        endX: number, 
        endY: number, 
        color: ColorRGBA, 
        density: number = 25
    ) => {
        const length = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        const dotCount = Math.floor(length * density);
        
        for (let dot = 0; dot < dotCount; dot++) {
            const t1 = dot / dotCount;
            const t2 = Math.min(t1 + 0.7 / dotCount, (dot + 1) / dotCount);
            
            if ((dot % 3) !== 2) {
                const dotLine = new WebglLine(color, 2);
                dotLine.lineSpaceX(-1, 2 / 2);
                
                const x1 = startX + t1 * (endX - startX);
                const y1 = startY + t1 * (endY - startY);
                const x2 = startX + t2 * (endX - startX);
                const y2 = startY + t2 * (endY - startY);
                
                dotLine.setX(0, x1);
                dotLine.setY(0, y1);
                dotLine.setX(1, x2);
                dotLine.setY(1, y2);
                
                plot.addLine(dotLine);
            }
        }
    };

    // Helper function to get colorful brainwave colors
    const getBrainwaveColor = (label: string): string => {
        const brainwaveColors = {
            'Alpha': '#10B981',    // Emerald - associated with relaxed awareness
            'Beta': '#3B82F6',     // Blue - associated with active concentration
            'Gamma': '#8B5CF6',    // Violet - associated with high-level cognitive processing
            'Theta': '#F59E0B',    // Amber - associated with creativity and deep meditation
            'Delta': '#EF4444'     // Red - associated with deep sleep and healing
        };
        return brainwaveColors[label as keyof typeof brainwaveColors] || colors.labels;
    };

    // Calculate pentagon vertices for the web (inverted 180 degrees)
    const calculatePentagonVertices = useCallback((radius: number) => {
        const vertices = [];
        const angleStep = (2 * Math.PI) / 5; // Pentagon has 5 sides
        
        for (let i = 0; i < 5; i++) {
            const angle = i * angleStep + Math.PI / 2; // Start from bottom (inverted)
            vertices.push({
                x: radius * Math.cos(angle),
                y: radius * Math.sin(angle),
                angle
            });
        }
        return vertices;
    }, []);

    // Calculate data points positioned on the web (inverted 180 degrees)
    const calculateDataPoints = useCallback(() => {
        
        return plotData.map((item, index) => {
            const angle = index * (2 * Math.PI / 5) + Math.PI / 2; // Pentagon angles (inverted)
            const maxVal = item.maxValue || 100;
            const normalizedValue = Math.min(item.value / maxVal, 1);
            const pointRadius = WEB_RADIUS * normalizedValue;
            
            return {
                x: pointRadius * Math.cos(angle),
                y: pointRadius * Math.sin(angle),
                value: Math.round(item.value),
                label: item.label,
                angle,
                normalizedValue
            };
        });
    }, [plotData]);

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

            const dataPoints = calculateDataPoints();
            const webColor = hexToColorRGBA(colors.web, 0.9);
            const dataColor = hexToColorRGBA(colors.stroke, 1.0);

            // Clear any existing lines
            plot.removeAllLines();

            // 1. Draw concentric pentagon web rings
            const webColorStrong = hexToColorRGBA(colors.web, 1.0);
            const webColorLight = hexToColorRGBA(colors.web, 0.8);
            
            for (let level = 1; level <= webLevels; level++) {
                const levelRadius = WEB_RADIUS * (level / webLevels);
                const vertices = calculatePentagonVertices(levelRadius);
                // Use the same color for all rings
                const ringColor = webColorLight;
                // Create dotted pentagon by drawing multiple small segments
                for (let side = 0; side < 5; side++) {
                    const startVertex = vertices[side];
                    const endVertex = vertices[(side + 1) % 5];
                    // Create dotted pentagon ring segments
                    createDottedLine(
                        plot, 
                        startVertex.x, 
                        startVertex.y, 
                        endVertex.x, 
                        endVertex.y, 
                        ringColor, 
                        30
                    );
                }
            }

            // 2. Draw dotted radial spokes from center to pentagon vertices
            for (let i = 0; i < 5; i++) {
                const angle = i * (2 * Math.PI / 5) + Math.PI / 2;
                const outerX = WEB_RADIUS * Math.cos(angle);
                const outerY = WEB_RADIUS * Math.sin(angle);
                
                // Create dotted radial spokes from center to vertices
                createDottedLine(plot, 0, 0, outerX, outerY, webColorStrong, 25);
            }

            // 3. Add dotted web connecting lines between rings
            const webStrandColor = hexToColorRGBA(colors.web, 0.3);
            
            // 3. Draw dotted connecting lines between pentagon rings
            for (let level = 1; level < webLevels; level += 2) {
                const innerRadius = WEB_RADIUS * (level / webLevels);
                const outerRadius = WEB_RADIUS * ((level + 1) / webLevels);
                
                for (let i = 0; i < 5; i++) {
                    const angle = i * (2 * Math.PI / 5) + Math.PI / 2;
                    
                    const innerX = innerRadius * Math.cos(angle);
                    const innerY = innerRadius * Math.sin(angle);
                    const outerX = outerRadius * Math.cos(angle);
                    const outerY = outerRadius * Math.sin(angle);
                    
                    // Create dotted web connecting strands
                    createDottedLine(plot, innerX, innerY, outerX, outerY, webStrandColor, 20);
                }
            }

            // 4. Draw filled data area (pentagon shape based on values)
            const fillColor = hexToColorRGBA(colors.fill, 0.3);
            if (dataPoints.length >= 5) {
                const fillLine = new WebglLine(fillColor, 6);
                fillLine.lineSpaceX(-1, 2 / 6);
                
                for (let i = 0; i < 5; i++) {
                    fillLine.setX(i, dataPoints[i].x);
                    fillLine.setY(i, dataPoints[i].y);
                }
                // Close the data pentagon
                fillLine.setX(5, dataPoints[0].x);
                fillLine.setY(5, dataPoints[0].y);
                
                plot.addLine(fillLine);
            }

            // 5. Draw data outline (pentagon border)
            if (dataPoints.length >= 5) {
                const outlineLine = new WebglLine(dataColor, 6);
                outlineLine.lineSpaceX(-1, 2 / 6);
                
                for (let i = 0; i < 5; i++) {
                    outlineLine.setX(i, dataPoints[i].x);
                    outlineLine.setY(i, dataPoints[i].y);
                }
                // Close the data pentagon
                outlineLine.setX(5, dataPoints[0].x);
                outlineLine.setY(5, dataPoints[0].y);
                
                plot.addLine(outlineLine);
            }

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
        
        return plotData.map((item, index) => {
            // Pentagon vertex angles rotated 37 degrees clockwise for optimal label placement
            const baseAngle = index * (2 * Math.PI / 5) + Math.PI / 2;
            const angle = baseAngle + (Math.PI / 4) - (Math.PI / 18) + (Math.PI / 90);
            
            // Convert from WebGL coordinates (-1 to 1) to screen coordinates
            const totalWebGLRadius = WEB_RADIUS + LABEL_OFFSET;
            
            // Convert WebGL coordinates to screen coordinates
            const webGLX = totalWebGLRadius * Math.cos(angle);
            const webGLY = totalWebGLRadius * Math.sin(angle);
            
            // Transform from WebGL space (-1 to 1) to screen space
            const screenX = centerX + (webGLX * centerX);
            const screenY = centerY + (webGLY * centerY);
            
            return {
                x: screenX,
                y: screenY,
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
                                fontSize: Math.max(12, Math.min(16, width / 18)),
                                fontWeight: '500',
                                textShadow: '1px 1px 2px rgba(0,0,0,0.2)',
                                letterSpacing: '0.3px'
                            }}
                        >
                            <div 
                                className="px-2 py-1 rounded-md bg-white/10 backdrop-blur-sm border border-white/20"
                                style={{
                                    color: getBrainwaveColor(pos.label),
                                }}
                            >
                                {pos.label}
                            </div>
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