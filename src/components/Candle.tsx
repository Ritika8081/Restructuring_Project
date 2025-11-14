"use client";
import React, { useEffect, useState } from 'react';

/**
 * src/components/Candle.tsx
 *
 * Purpose: Decorative candle visualization that maps a numeric `betaPower`
 * value (0-100) to a smooth flame brightness. Used by the dashboard to
 * provide a visually-appealing indicator of signal strength.
 *
 * Exports: default CandleChart component
 */

type CandleChartProps = {
  width?: number | string;
  height?: number | string;
  betaPower?: number; // controls brightness
  isFullPage?: boolean;
  threshold?: number; // minimum betaPower to start lighting (0-100)
  minVisible?: number; // minimum visible brightness (0-1)
  backgroundColor?: string;
};

const CandleChart: React.FC<CandleChartProps> = ({
  width = '100%',
  height = '100%',
  betaPower = 0,
  isFullPage = false,
  // Lower default threshold so small beta values produce visible flame
  threshold = 0,
  // Slightly larger minimum so very small signals still show a hint of flame
  minVisible = 0.06,
  backgroundColor = 'transparent',
}) => {
  const clampedThreshold = Math.max(0, Math.min(100, threshold));
  const clampedMinVisible = Math.max(0, Math.min(1, minVisible));

  // Map betaPower to a 0..1 brightness value relative to threshold
  const raw = typeof betaPower === 'number' ? betaPower : 0;
  const linear = raw <= clampedThreshold ? 0 : (raw - clampedThreshold) / Math.max(1, (100 - clampedThreshold));
  // Apply a mild nonlinear curve to amplify low values (sqrt-like)
  const curved = linear > 0 ? Math.pow(linear, 0.7) : 0;
  // final brightness in [0,1], clamped and including minVisible when >0
  const brightness = curved > 0 ? Math.max(clampedMinVisible, Math.min(1, curved)) : 0;
  const [displayBrightness, setDisplayBrightness] = useState(0);

  useEffect(() => {
    // Smoothly animate displayBrightness towards brightness only when brightness > 0.
    const target = brightness;
    const timer = setInterval(() => {
      setDisplayBrightness(prev => {
        const diff = target - prev;
        // If both are zero, keep at zero
        if (Math.abs(diff) < 0.005) return target;
        return prev + diff * 0.14;
      });
    }, 16);
    return () => clearInterval(timer);
  }, [betaPower]);

  // Deterministic flame path generator (no randomness) — simpler and cheaper
  const generateFlamePath = (w = 200, h = 300) => {
    const midX = w / 2;
    const topY = 40;
    const bottomY = h - 30;
    // control offset proportional to brightness to make flame taller/wider
    const controlOffset = 20 + displayBrightness * 18;
    const leftX = midX - 30 - displayBrightness * 8;
    const rightX = midX + 30 + displayBrightness * 8;

    return `M ${midX} ${topY} C ${midX - controlOffset} ${topY + 40}, ${leftX} ${topY + 90}, ${leftX} ${topY + 160} C ${leftX} ${topY + 200}, ${midX} ${bottomY - 40}, ${midX} ${bottomY} C ${midX} ${bottomY - 40}, ${rightX} ${topY + 200}, ${rightX} ${topY + 160} C ${rightX} ${topY + 90}, ${midX + controlOffset} ${topY + 40}, ${midX} ${topY} Z`;
  };

  return (
    <div
      style={{
        width,
        height,
        background: backgroundColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 0,
        minWidth: 0,
      }}
      className="p-0 m-0"
    >
      <div
        className={`relative flex flex-col items-center justify-end ${isFullPage ? 'w-1/3 h-3/4' : 'w-40 h-56'}`}
        style={{ pointerEvents: 'none' }}
      >
        {/* Flame area (~60%) */}
        <div style={{ height: '60%', width: '100%' }} className="relative">
          <svg
            viewBox="0 0 200 300"
            preserveAspectRatio="xMidYMid meet"
            className="absolute bottom-0 left-0 w-full h-full"
          >
            <defs>
              <linearGradient id="outerFlame" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={`rgba(255,140,0, ${Math.min(1, displayBrightness * 1.0)})`} />
                <stop offset="100%" stopColor={`rgba(255,69,0, ${Math.min(1, displayBrightness * 0.6)})`} />
              </linearGradient>
              <linearGradient id="innerFlame" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={`rgba(255,225,120, ${Math.min(1, displayBrightness * 1.0)})`} />
                <stop offset="100%" stopColor={`rgba(255,165,0, ${Math.min(1, displayBrightness * 0.8)})`} />
              </linearGradient>
            </defs>

            <path
              d={generateFlamePath()}
              fill="url(#outerFlame)"
              className="transition-all duration-300"
              style={{ opacity: Math.min(1, displayBrightness) * 0.95 }}
            />
            <path
              d={generateFlamePath()}
              fill="url(#innerFlame)"
              className="transition-all duration-300"
              style={{ opacity: Math.min(1, displayBrightness) * 1.0 }}
            />
          </svg>
        </div>

        {/* Candle / base (~40%) */}
        <div
          style={{ height: '40%', width: '100%' }}
          className="relative rounded-t-md overflow-hidden flex items-start justify-center"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-gray-100 to-gray-200 dark:from-stone-600 dark:to-stone-700 rounded-t-md shadow-inner" />
          <div className="absolute inset-0 flex justify-center items-start pt-3">
            <div
              className="font-semibold text-gray-900 px-2 py-1 rounded transition-all"
              style={{
                background: `rgba(255,255,255, ${0.15 + displayBrightness * 0.2})`,
                color: '#0f172a',
                pointerEvents: 'auto',
                transform: isFullPage ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              {Number.isFinite(betaPower) ? String(Math.round(betaPower)).padStart(2, '0') : '00'}
            </div>
          </div>
          <div className="absolute inset-0 bg-white/5 rounded-b-lg" />
        </div>
      </div>
    </div>
  );
};

export default CandleChart;