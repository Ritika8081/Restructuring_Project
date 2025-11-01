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
  if (signal.length !== fftSize) {
    // If provided signal is shorter/longer, create a Float32Array of length fftSize and copy (zero-pad or truncate)
    const buf = new Float32Array(fftSize);
    buf.set(new Float32Array(signal.slice(0, fftSize)));
    const fft = new FFT(fftSize);
    const mags = fft.computeMagnitudes(buf);
    const raw: Record<string, number> = {};
    for (const [band, range] of Object.entries(BANDS)) {
      raw[band] = calculateBandPower(mags, range, sampleRate, fftSize);
    }
    const total = Object.values(raw).reduce((a, b) => a + b, 0);
    const rel: Record<string, number> = {};
    for (const band of Object.keys(BANDS)) {
      rel[band] = total > 0 ? raw[band] / total : 0;
    }
    return { raw, relative: rel };
  }

  const fft = new FFT(fftSize);
  const mags = fft.computeMagnitudes(new Float32Array(signal));
  const raw: Record<string, number> = {};
  for (const [band, range] of Object.entries(BANDS)) {
    raw[band] = calculateBandPower(mags, range, sampleRate, fftSize);
  }
  const total = Object.values(raw).reduce((a, b) => a + b, 0);
  const rel: Record<string, number> = {};
  for (const band of Object.keys(BANDS)) {
    rel[band] = total > 0 ? raw[band] / total : 0;
  }
  return { raw, relative: rel };
}
