import React from 'react';

export type SpiderDatum = { subject: string; value: number };

type Props = {
  data?: SpiderDatum[] | number[];
  size?: number | string; // px number or CSS string like '100%'
  colors?: string[]; // gradient stops or single color
  max?: number; // max value for radial scaling (defaults to 1)
  gridLevels?: number; // concentric polygon levels
};

const defaultBands = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'];

// Replace zero/missing values by nearest non-zero neighbor in circular fashion
function fillCircularZeros(values: number[]): number[] {
  const N = values.length;
  if (N === 0) return values.slice();
  const out = values.slice();
  const allZero = out.every((v) => !v);
  if (allZero) return out;

  for (let i = 0; i < N; i++) {
    if (!out[i]) {
      // search outward for nearest non-zero value (circular)
      let found = false;
      for (let dist = 1; dist < N; dist++) {
        const a = (i + dist) % N;
        if (out[a]) { out[i] = out[a]; found = true; break; }
        const b = (i - dist + N) % N;
        if (out[b]) { out[i] = out[b]; found = true; break; }
      }
      if (!found) out[i] = 0;
    }
  }
  return out;
}

function normalizeInput(data?: SpiderDatum[] | number[] | any[]) {
  if (!data) return defaultBands.map((s) => ({ subject: s, value: 0 }));

  // Numeric array: treat as ordered band values
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'number') {
    const nums = data as number[];
    const filled = fillCircularZeros(nums);
    return defaultBands.map((s, i) => ({ subject: s, value: filled[i] ?? 0 }));
  }

  // Array of objects: accept { subject, value } or { label, value, maxValue }
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
    // If objects include numeric values, fill zeros circularly to avoid collapsed polygons
    const arr = (data as any[]).map((obj) => Number(obj.value ?? 0) || 0);
    const filledArr = fillCircularZeros(arr);
    return (data as any[]).map((obj, i) => {
      const subject = obj.subject ?? obj.label ?? defaultBands[i] ?? `v${i}`;
      let value = filledArr[i] ?? (Number(obj.value ?? 0) || 0);
      // If maxValue provided, convert to fraction
      if (obj.maxValue) {
        const mv = Number(obj.maxValue) || 1;
        if (mv > 0) value = value / mv;
      }
      return { subject, value };
    });
  }

  return defaultBands.map((s) => ({ subject: s, value: 0 }));
}

export default function SpiderPlot({ data, size = '100%', colors = ['#6C5CE7', '#00B894'], max = 1, gridLevels = 4 }: Props) {
  const d = normalizeInput(data);
  const N = d.length;
  const viewSize = typeof size === 'number' ? size : 240;
  const cx = viewSize / 2;
  const cy = viewSize / 2;
  const radius = Math.min(cx, cy) * 0.85;

  const angleStep = (Math.PI * 2) / N;

  const maxVal = Math.max(max, ...d.map((p) => Math.abs(p.value)));

  const pointsForLevel = (level: number) => {
    const r = (radius * level) / gridLevels;
    return d
      .map((_, i) => {
        const a = -Math.PI / 2 + i * angleStep;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        return `${x},${y}`;
      })
      .join(' ');
  };

  const valuePolygon = () =>
    d
      .map((p, i) => {
        const v = Math.max(0, Math.min(1, p.value / maxVal));
        const r = v * radius;
        const a = -Math.PI / 2 + i * angleStep;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        return `${x},${y}`;
      })
      .join(' ');

  const stops = colors;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${viewSize} ${viewSize}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="spiderGrad" x1="0%" x2="100%" y1="0%" y2="0%">
          {stops.map((c, i) => (
            <stop key={i} offset={`${(i / (stops.length - 1 || 1)) * 100}%`} stopColor={c} stopOpacity={1} />
          ))}
        </linearGradient>
        <radialGradient id="spiderGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={stops[0]} stopOpacity={0.35} />
          <stop offset="100%" stopColor={stops[stops.length - 1]} stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* background glow */}
      <circle cx={cx} cy={cy} r={radius * 1.05} fill="url(#spiderGlow)" />

      {/* grid concentric polygons */}
      <g stroke="#cbd5e1" strokeWidth={1} fill="none" opacity={0.7}>
        {Array.from({ length: gridLevels }, (_, li) => (
          <polygon key={li} points={pointsForLevel(gridLevels - li)} strokeDasharray={li === 0 ? '3 3' : '2 3'} />
        ))}
      </g>

      {/* spokes & labels */}
      <g>
        {d.map((p, i) => {
          const a = -Math.PI / 2 + i * angleStep;
          const x = cx + radius * Math.cos(a);
          const y = cy + radius * Math.sin(a);
          const lx = cx + (radius + 18) * Math.cos(a);
          const ly = cy + (radius + 18) * Math.sin(a);
          const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
          return (
            <g key={p.subject}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="#94a3b8" strokeWidth={1} opacity={0.7} />
              <text x={lx} y={ly} fontSize={11} fill="#334155" textAnchor={anchor} dominantBaseline="central">
                {p.subject}
              </text>
            </g>
          );
        })}
      </g>

      {/* value polygon (filled with gradient and stroked) */}
      <g>
        <polygon points={valuePolygon()} fill="url(#spiderGrad)" fillOpacity={0.25} stroke="url(#spiderGrad)" strokeWidth={2} />

        {/* vertex dots */}
        {d.map((p, i) => {
          const v = Math.max(0, Math.min(1, p.value / maxVal));
          const r = v * radius;
          const a = -Math.PI / 2 + i * angleStep;
          const x = cx + r * Math.cos(a);
          const y = cy + r * Math.sin(a);
          const color = stops[i % stops.length];
          return <circle key={i} cx={x} cy={y} r={3.5} fill={color} stroke="#fff" strokeWidth={0.8} />;
        })}
      </g>

      {/* center label (optional) */}
      <text x={cx} y={cy} fontSize={10} fill="#475569" textAnchor="middle" dominantBaseline="central"></text>
    </svg>
  );
}
