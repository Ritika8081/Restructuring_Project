import React, { useRef } from 'react';

export type SpiderDatum = { subject: string; value: number };

type Props = {
  data?: SpiderDatum[] | number[];
  size?: number | string; // px number or CSS string like '100%'
  colors?: string[]; // gradient stops or single color
  max?: number; // max value for radial scaling (defaults to 1)
  gridLevels?: number; // concentric polygon levels
  logValues?: boolean; // whether to print the normalized band values to console
  logIntervalMs?: number; // minimum ms between prints
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

export default function SpiderPlot({ data, size = '100%', colors = ['#6C5CE7', '#00B894'], max = 1, gridLevels = 4, logValues = true, logIntervalMs = 250 }: Props) {
  const lastLogRef = useRef<number>(0);
  const lastLoggedBandsRef = useRef<number[] | null>(null);
  const d = normalizeInput(data);
  const N = d.length;
  // Use a base logical drawing area (baseSize). When `size` is a number, we
  // allow the SVG to be that pixel size; when `size` is '100%' we still use
  // the baseSize for coordinate math and let the SVG scale to its container.
  const baseSize = typeof size === 'number' ? size : 240;

  // Add padding around the base drawing area to avoid label clipping. Padding
  // scales with the baseSize so larger plots get proportionally more room.
  const padding = Math.max(18, Math.round(baseSize * 0.12));
  const viewWidth = baseSize + padding * 2;

  // Center of the radar in view coordinates (accounting for padding)
  const cx = padding + baseSize / 2;
  const cy = padding + baseSize / 2;

  // Radius inside the base drawing area (we keep a margin so labels can sit outside)
  const radius = Math.min(baseSize / 2, baseSize / 2) * 0.78;

  const angleStep = (Math.PI * 2) / N;

  const maxVal = Math.max(max, ...d.map((p) => Math.abs(p.value)));

  // Prepare normalized band values (0..1) for logging/inspection
  const normalizedBands = d.map((p) => Math.max(0, Math.min(1, p.value / maxVal)));

  // Throttled console output to avoid flooding the console on high-frequency updates
  if (logValues) {
    try {
      const now = performance.now();
      if (now - (lastLogRef.current || 0) >= (logIntervalMs || 250)) {
        // Print labels and normalized band values together for clarity (throttled)
        // This mirrors what the SpiderPlot is rendering so developers can
        // inspect the exact band vector shown in the UI.
          try {
            // Avoid logging identical vectors repeatedly. Only print when
            // values changed beyond a tiny epsilon or when there was no
            // previous log. This reduces console spam when updates are
            // frequent but values stay the same.
            const eps = 1e-6;
            const last = lastLoggedBandsRef.current;
            let changed = false;
            if (!last || last.length !== normalizedBands.length) changed = true;
            else {
              for (let i = 0; i < normalizedBands.length; i++) {
                if (Math.abs((last[i] || 0) - normalizedBands[i]) > eps) { changed = true; break; }
              }
            }
            if (changed) {
              // Compact readable output: labels + comma-separated values
              const labels = d.map((p) => p.subject).join(', ');
              const vals = normalizedBands.map((v) => Number(v.toFixed(6))).join(', ');
              console.log(`[SpiderPlot] bands — ${labels} => [${vals}]`);
              lastLoggedBandsRef.current = normalizedBands.slice();
            }
          } catch (e) { /* swallow logging errors */ }
        lastLogRef.current = now;
      }
    } catch (e) {
      // swallow logging errors
    }
  }

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

  // Scaled sizes for stroke and font so visuals remain proportional when
  // the component is resized via CSS (SVG scales using viewBox).
  const strokeW = Math.max(1, Math.round(baseSize * 0.008));
  const fontSize = Math.max(9, Math.round(baseSize * 0.045));

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewWidth} ${viewWidth}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ overflow: 'visible' }}
    >
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
      <g stroke="#cbd5e1" strokeWidth={Math.max(0.5, strokeW * 0.7)} fill="none" opacity={0.7}>
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
          const labelDist = radius + Math.max(12, padding * 0.6);
          const lx = cx + labelDist * Math.cos(a);
          const ly = cy + labelDist * Math.sin(a);
          const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
          return (
            <g key={p.subject}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="#94a3b8" strokeWidth={Math.max(0.6, strokeW * 0.6)} opacity={0.7} />
              <text x={lx} y={ly} fontSize={fontSize} fill="#334155" textAnchor={anchor} dominantBaseline="central">
                {p.subject}
              </text>
            </g>
          );
        })}
      </g>

      {/* value polygon (filled with gradient and stroked) */}
      <g>
        <polygon points={valuePolygon()} fill="url(#spiderGrad)" fillOpacity={0.25} stroke="url(#spiderGrad)" strokeWidth={Math.max(1, strokeW)} />

        {/* vertex dots */}
        {d.map((p, i) => {
          const v = Math.max(0, Math.min(1, p.value / maxVal));
          const r = v * radius;
          const a = -Math.PI / 2 + i * angleStep;
          const x = cx + r * Math.cos(a);
          const y = cy + r * Math.sin(a);
          const color = stops[i % stops.length];
          return <circle key={i} cx={x} cy={y} r={Math.max(2.5, strokeW * 1.6)} fill={color} stroke="#fff" strokeWidth={Math.max(0.6, strokeW * 0.4)} />;
        })}
      </g>

      {/* center label (optional) */}
      <text x={cx} y={cy} fontSize={10} fill="#475569" textAnchor="middle" dominantBaseline="central"></text>
    </svg>
  );
}
