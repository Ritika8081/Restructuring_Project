/**
 * src/lib/bandpower.ts
 *
 * Purpose: Helper utilities to compute band power from FFT magnitudes.
 * Exports band definitions, a simple BandSmoother, and helpers to compute
 * raw and relative band power values for a given signal.
 *
 * Exports: BANDS, BandSmoother, calculateBandPower, computeBandPowers
 */
import { FFT } from '@/lib/fft';

// Reuse FFT instances per size to avoid repeated allocations/initialization
const fftCache: Record<number, FFT> = {};

// Frequency band definitions (Hz)
export const BANDS: Record<string, [number, number]> = {
  delta: [0.5, 4],
  theta: [4, 8],
  alpha: [8, 12],
  beta: [12, 30],
  gamma: [30, 45],
};

// Sliding-window smoother (simple moving average per band)
export class BandSmoother {
  private bufferSize: number;
  private buffers: Record<string, number[]>;
  private sums: Record<string, number>;
  private idx = 0;

  constructor(bufferSize: number) {
    this.bufferSize = bufferSize;
    this.buffers = {} as Record<string, number[]>;
    this.sums = {} as Record<string, number>;
    for (const band of Object.keys(BANDS)) {
      this.buffers[band] = new Array(bufferSize).fill(0);
      this.sums[band] = 0;
    }
  }

  updateAll(vals: Record<string, number>) {
    for (const band of Object.keys(vals)) {
      const old = this.buffers[band][this.idx] || 0;
      this.sums[band] = (this.sums[band] || 0) - old + vals[band];
      this.buffers[band][this.idx] = vals[band];
    }
    this.idx = (this.idx + 1) % this.bufferSize;
  }

  // Efficiently prefill the circular buffer with a single value vector
  // (avoids calling updateAll repeatedly during cold-start).
  prefill(vals: Record<string, number>) {
    for (const band of Object.keys(this.buffers)) {
      const v = vals[band] ?? 0;
      this.buffers[band].fill(v);
      this.sums[band] = v * this.bufferSize;
    }
    this.idx = 0;
  }

  getAll(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const band of Object.keys(this.sums)) {
      out[band] = (this.sums[band] || 0) / this.bufferSize;
    }
    return out;
  }
}

// Calculate band power using FFT magnitudes
export function calculateBandPower(
  mags: Float32Array,
  [f1, f2]: [number, number],
  sampleRate = 500,
  fftSize = 256
): number {
  const res = sampleRate / fftSize;
  const start = Math.max(1, Math.ceil(f1 / res));
  const end = Math.min(mags.length - 1, Math.floor(f2 / res));
  if (end < start) return 0;
  let power = 0;
  for (let i = start; i <= end; i++) {
    power += mags[i] * mags[i];
  }
  return power;
}

// Compute band powers for a single channel signal
export function computeBandPowers(
  signal: number[],
  sampleRate = 500,
  fftSize = 256
): { raw: Record<string, number>; relative: Record<string, number> } {
  // Prepare an FFT-sized input buffer (zero-pad or truncate as needed)
  const input = new Float32Array(fftSize);
  if (signal && signal.length > 0) {
    const src = signal.slice(Math.max(0, signal.length - fftSize), signal.length);
    input.set(new Float32Array(src), Math.max(0, fftSize - src.length));
  }

  let fft = fftCache[fftSize];
  if (!fft) { fft = new FFT(fftSize); fftCache[fftSize] = fft; }
  const mags = fft.computeMagnitudes(input);

  const raw: Record<string, number> = {};
  for (const [band, range] of Object.entries(BANDS)) {
    raw[band] = calculateBandPower(mags, range, sampleRate, fftSize);
  }

  // Total power (exclude DC at index 0)
  const total = Object.keys(raw).reduce((acc, k) => acc + (Number(raw[k]) || 0), 0);
  const rel: Record<string, number> = {};
  for (const band of Object.keys(BANDS)) {
    const v = total > 0 ? (Number(raw[band]) || 0) / total : 0;
    rel[band] = Number.isFinite(v) ? Math.max(0, v) : 0;
  }

  // Sanitize raw values as well
  for (const k of Object.keys(raw)) {
    const v = Number(raw[k]) || 0;
    raw[k] = Number.isFinite(v) && v >= 0 ? v : 0;
  }

  return { raw, relative: rel };
}

// Welch-style averaging: split signal into overlapping segments, apply a Hann
// window to each, compute FFT magnitudes, accumulate per-bin power and
// average across segments. This produces a much smoother PSD estimate which
// yields more stable band-power estimates for short, noisy signals.
export function computeBandPowersWelch(
  signal: number[],
  sampleRate = 500,
  fftSize = 256,
  segmentLength = Math.min(fftSize, 256),
  overlap = 0.5,
  mainsFreq = 50
): { raw: Record<string, number>; relative: Record<string, number>; dB: Record<string, number> } {
  // Clamp overlap to reasonable range
  overlap = Math.min(Math.max(overlap, 0.0), 0.9);

  // Ensure fftSize is a power of two (next power-of-two if needed)
  const nextPow2 = (n: number) => {
    let v = 1;
    while (v < n) v <<= 1;
    return v;
  };
  if ((fftSize & (fftSize - 1)) !== 0) fftSize = nextPow2(fftSize);

  const segLen = Math.min(Math.max(4, Math.floor(segmentLength)), fftSize);
  const hop = Math.max(1, Math.floor(segLen * (1 - overlap)));

  // Prepare input buffer (use provided signal, right-aligned)
  const sig = new Float32Array(signal.length);
  sig.set(new Float32Array(signal));

  // Precompute Hann window and its squared-energy normalization U
  const windowVals = new Float32Array(segLen);
  for (let n = 0; n < segLen; n++) {
    windowVals[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (segLen - 1)));
  }
  let winSqSum = 0;
  for (let i = 0; i < segLen; i++) winSqSum += windowVals[i] * windowVals[i];
  const U = Math.max(winSqSum / segLen, 1e-12);

  const accumPower = new Float64Array(fftSize / 2);
  let segments = 0;

  // Reuse FFT instance for this fftSize
  let fft = fftCache[fftSize];
  if (!fft) { fft = new FFT(fftSize); fftCache[fftSize] = fft; }
  for (let start = 0; start + segLen <= sig.length; start += hop) {
    const input = new Float32Array(fftSize);
    for (let i = 0; i < segLen; i++) input[i] = sig[start + i] * windowVals[i];

    const mags = fft.computeMagnitudes(input);
    for (let i = 0; i < mags.length; i++) accumPower[i] += mags[i] * mags[i];
    segments++;
  }

  if (segments === 0) {
    // Fallback to single windowed FFT (use as much as available)
    const input = new Float32Array(fftSize);
    const useLen = Math.min(sig.length, segLen);
    for (let i = 0; i < useLen; i++) input[i] = sig[i] * windowVals[i];
    const mags = fft.computeMagnitudes(input);
    for (let i = 0; i < mags.length; i++) accumPower[i] = mags[i] * mags[i];
    segments = 1;
  }

  // Average across segments and convert to PSD (correct for window energy and df)
  for (let i = 0; i < accumPower.length; i++) accumPower[i] = (accumPower[i] / segments) / U;
  const df = sampleRate / fftSize;
  for (let i = 0; i < accumPower.length; i++) accumPower[i] = accumPower[i] * df;

  // Compute raw band powers
  const raw: Record<string, number> = {};
  for (const [band, range] of Object.entries(BANDS)) {
    const start = Math.max(1, Math.ceil(range[0] / df));
    const end = Math.min(accumPower.length - 1, Math.floor(range[1] / df));
    let power = 0;
    if (end >= start) {
      for (let i = start; i <= end; i++) power += accumPower[i];
    }
    raw[band] = Number.isFinite(power) && power > 0 ? power : 0;
  }

  // Compute total power excluding DC and mains artifact region
  let totalPower = 0;
  const mainsBin = Math.round(mainsFreq / df);
  const mainsBinRadius = Math.max(1, Math.round(1 / df));
  for (let i = 1; i < accumPower.length; i++) {
    if (Math.abs(i - mainsBin) <= mainsBinRadius) continue;
    const v = accumPower[i];
    if (Number.isFinite(v) && v > 0) totalPower += v;
  }

  const rel: Record<string, number> = {};
  for (const band of Object.keys(BANDS)) {
    const v = totalPower > 0 ? (raw[band] || 0) / totalPower : 0;
    rel[band] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  }

  // dB values (10*log10 of power) with floor at -120 dB
  const dB: Record<string, number> = {};
  const eps = 1e-12;
  for (const band of Object.keys(BANDS)) {
    const p = raw[band] || 0;
    const v = 10 * Math.log10(Math.max(p, eps));
    dB[band] = Number.isFinite(v) ? Number(v.toFixed(2)) : -120;
  }

  return { raw, relative: rel, dB };
}
