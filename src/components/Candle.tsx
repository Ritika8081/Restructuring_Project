'use client';
import React, { useEffect, useState } from 'react';

type CandleChartProps = {
  width?: number | string;
  height?: number | string;
  betaPower?: number; // controls brightness
  isFullPage?: boolean;
  backgroundColor?: string;
};

const CandleChart: React.FC<CandleChartProps> = ({
  width = '100%',
  height = '100%',
  betaPower = 0,
  isFullPage = false,
  backgroundColor = 'transparent',
}) => {
  const brightness = Math.max(0.1, Math.min(1, betaPower / 100));
  const [displayBrightness, setDisplayBrightness] = useState(0.1);

  useEffect(() => {
    const target = Math.max(0.1, Math.min(1, betaPower / 100));
    const timer = setInterval(() => {
      setDisplayBrightness(prev => {
        const diff = target - prev;
        return Math.abs(diff) < 0.01 ? target : prev + diff * 0.12;
      });
    }, 16);
    return () => clearInterval(timer);
  }, [betaPower]);

  const generateFlamePath = (w = 200, h = 300) => {
    const midX = w / 2;
    const topY = 40;
    const bottomY = h - 30;
    const controlOffset = 20 + (Math.random() - 0.5) * 10 * displayBrightness;
    const leftX = midX - 30 - Math.random() * 10 * displayBrightness;
    const rightX = midX + 30 + Math.random() * 10 * displayBrightness;

    return `
      M ${midX} ${topY}
      C ${midX - controlOffset} ${topY + 40}, ${leftX} ${topY + 90}, ${leftX} ${topY + 160}
      C ${leftX} ${topY + 200}, ${midX} ${bottomY - 40}, ${midX} ${bottomY}
      C ${midX} ${bottomY - 40}, ${rightX} ${topY + 200}, ${rightX} ${topY + 160}
      C ${rightX} ${topY + 90}, ${midX + controlOffset} ${topY + 40}, ${midX} ${topY}
      Z
    `;
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
                <stop offset="0%" stopColor={`rgba(255,140,0, ${displayBrightness * 0.7})`} />
                <stop offset="100%" stopColor={`rgba(255,69,0, ${displayBrightness * 0.25})`} />
              </linearGradient>
              <linearGradient id="innerFlame" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={`rgba(255,225,120, ${displayBrightness * 0.95})`} />
                <stop offset="100%" stopColor={`rgba(255,165,0, ${displayBrightness * 0.6})`} />
              </linearGradient>
              <filter id="softBlur">
                <feGaussianBlur stdDeviation="6" />
              </filter>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <path
              d={generateFlamePath()}
              fill="url(#outerFlame)"
              filter="url(#softBlur)"
              className="transition-all duration-300"
              style={{ opacity: Math.min(1, displayBrightness) * 0.8 }}
            />
            <path
              d={generateFlamePath()}
              fill="url(#innerFlame)"
              filter="url(#glow)"
              className="transition-all duration-300"
              style={{ opacity: Math.min(1, displayBrightness) }}
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
              {Number.isFinite(betaPower) ? String(Math.floor(betaPower)).padStart(2, '0') : '00'}
            </div>
          </div>
          <div className="absolute inset-0 bg-white/5 rounded-b-lg" />
        </div>
      </div>
    </div>
  );
};

export default CandleChart;