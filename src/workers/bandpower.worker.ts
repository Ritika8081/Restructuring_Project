/**
 * src/workers/bandpower.worker.ts
 *
 * Purpose: Web Worker that receives EEG samples and computes band powers
 * (raw and smoothed) using FFT and the BandSmoother utility.
 *
 * Exports: Worker message handler (posts { raw, relative, smooth } back to caller)
 * Side effects: Creates a persistent `smoother` instance across messages.
 */
import { FFT } from '@/lib/fft';
import { BANDS, BandSmoother, calculateBandPower } from '@/lib/bandpower';

// Single-channel worker using FFT to compute (smoothed) relative band powers
let smoother: BandSmoother | null = null;

self.onmessage = (e: MessageEvent<{
  eeg: number[];
  sampleRate?: number;
  fftSize?: number;
  smootherWindow?: number;
}>) => {
  const { eeg, sampleRate = 500, fftSize = 256, smootherWindow = 128 } = e.data;

  if (!smoother) smoother = new BandSmoother(smootherWindow);

  // Ensure an FFT instance and compute magnitudes
  const fft = new FFT(fftSize);
  const input = new Float32Array(fftSize);
  input.set(new Float32Array(eeg.slice(0, fftSize)));
  const mags = fft.computeMagnitudes(input);

  // Compute absolute power per band
  const raw: Record<string, number> = {};
  for (const [band, range] of Object.entries(BANDS)) {
    raw[band] = calculateBandPower(mags, range, sampleRate, fftSize);
  }

  // Compute relative powers
  const total = Object.values(raw).reduce((a, b) => a + b, 0);
  const rel: Record<string, number> = {};
  for (const band of Object.keys(BANDS)) {
    rel[band] = total > 0 ? raw[band] / total : 0;
  }

  // Update smoother and return smoothed relative values
  smoother.updateAll(rel);
  const smooth = smoother.getAll();

  (self as unknown as Worker).postMessage({ raw, relative: rel, smooth });
};
