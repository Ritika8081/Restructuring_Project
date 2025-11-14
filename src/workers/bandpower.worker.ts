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

self.onmessage = (e: MessageEvent<any>) => {
  const data = e.data || {};

  // Support forwarded upstream streams from the flow router. When the
  // Bandpower consumer receives a `upstream` field we treat it as a time
  // series of numeric samples (recent values) and compute bandpower from
  // that array. This allows other widgets (e.g. SpiderPlot) to publish
  // arrays/streams that are forwarded into this worker via the Bandpower
  // component.
  if (data.upstream) {
    const upstream = data.upstream as number[];
    const sampleRate = data.sampleRate ?? 500;
    const fftSize = data.fftSize ?? 256;
    const smootherWindow = data.smootherWindow ?? 128;

    if (!smoother) smoother = new BandSmoother(smootherWindow);

    // Build a Float32Array input aligned to the right (most recent samples)
    const input = new Float32Array(fftSize);
    const start = Math.max(0, upstream.length - fftSize);
    const offset = fftSize - (upstream.length - start);
    for (let i = 0; i < fftSize; i++) {
      const srcIdx = start + (i - offset);
      input[i] = (srcIdx >= start && srcIdx < upstream.length) ? Number(upstream[srcIdx]) || 0 : 0;
    }

    const fft = new FFT(fftSize);
    const mags = fft.computeMagnitudes(input);

    const raw: Record<string, number> = {};
    for (const [band, range] of Object.entries(BANDS)) {
      raw[band] = calculateBandPower(mags, range, sampleRate, fftSize);
    }

    const total = Object.values(raw).reduce((a, b) => a + b, 0);
    const rel: Record<string, number> = {};
    for (const band of Object.keys(BANDS)) {
      rel[band] = total > 0 ? raw[band] / total : 0;
    }

    smoother.updateAll(rel);
    const smooth = smoother.getAll();
    (self as unknown as Worker).postMessage({ raw, relative: rel, smooth });
    return;
  }

  // Fallback: original message shape expects `eeg` samples
  const { eeg, sampleRate = 500, fftSize = 256, smootherWindow = 128 } = data;

  if (!smoother) smoother = new BandSmoother(smootherWindow);

  // Ensure an FFT instance and compute magnitudes
  const fft = new FFT(fftSize);
  const input = new Float32Array(fftSize);
  input.set(new Float32Array((eeg || []).slice(0, fftSize)));
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
