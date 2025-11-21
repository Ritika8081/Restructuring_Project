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
import { BANDS, BandSmoother, calculateBandPower, computeBandPowersWelch } from '@/lib/bandpower';

// Single-channel worker using FFT to compute (smoothed) relative band powers
let smoother: BandSmoother | null = null;
let prevSmootherWindow = 0;
let emaState: Record<string, number> | null = null;
let lastPostTs = 0;
let currentPostRate = 200; // ms
const fftCache: Record<number, FFT> = {};

// Per-fft-size circular buffers for streaming sample mode
const bufferCache: Record<number, { buf: Float32Array; idx: number; samplesSinceFFT: number; samplesPerFFT: number }> = {};

// Note: filtering (notch/IIR) is applied upstream by the flowchart widget.
// This worker processes raw samples pushed from the UI/flow and does not
// apply additional filtering here to avoid duplicate filtering.

self.onmessage = (e: MessageEvent<any>) => {
  const data = e.data || {};

  // Streaming single-sample message handler: { sample: number, sampleRate, fftSize, samplesPerFFT?, smootherWindow?, mode? }
  if (data.sample !== undefined) {
    const sample = Number(data.sample) || 0;
    const sampleRate = data.sampleRate ?? 500;
    const fftSize = data.fftSize ?? 256;
    const samplesPerFFT = data.samplesPerFFT ?? 10;
    const smootherWindow = data.smootherWindow ?? 128;
    const mode = data.mode ?? 'simple';

    // Ensure buffer entry
    let entry = bufferCache[fftSize];
    if (!entry) {
      entry = { buf: new Float32Array(fftSize), idx: 0, samplesSinceFFT: 0, samplesPerFFT };
      bufferCache[fftSize] = entry;
    }

    // No filtering here: the flowchart/widget upstream will apply notch/IIR when requested.
    const v = sample;

    // Push into circular buffer (keep most recent fftSize samples)
    entry.buf[entry.idx] = v;
    entry.idx = (entry.idx + 1) % fftSize;
    entry.samplesSinceFFT++;

    // Ensure smoother exists
    if (!smoother || prevSmootherWindow !== smootherWindow) {
      smoother = new BandSmoother(smootherWindow);
      prevSmootherWindow = smootherWindow;
      emaState = null;
    }

    // Run FFT occasionally when we have enough new samples
    if (entry.samplesSinceFFT >= samplesPerFFT) {
      entry.samplesSinceFFT = 0;

      // Build ordered input (last fftSize samples with oldest first)
      const input = new Float32Array(fftSize);
      for (let i = 0; i < fftSize; i++) {
        const idx = (entry.idx + i) % fftSize;
        input[i] = entry.buf[idx];
      }

      // Compute band powers (use simple single-FFT path)
      let fft = fftCache[fftSize];
      if (!fft) { fft = new FFT(fftSize); fftCache[fftSize] = fft; }
      const mags = fft.computeMagnitudes(input);
      const raw: Record<string, number> = {};
      for (const [band, range] of Object.entries(BANDS)) {
        raw[band] = calculateBandPower(mags, range, sampleRate, fftSize);
      }
      const total = Object.values(raw).reduce((a, b) => a + b, 0);
      const rel: Record<string, number> = {};
      for (const band of Object.keys(BANDS)) rel[band] = total > 0 ? raw[band] / total : 0;

      // EMA smoothing
      const alpha = 1 - Math.exp(-currentPostRate / Math.max(1, 1000));
      if (!emaState) {
        emaState = {} as Record<string, number>;
        for (const k of Object.keys(rel)) emaState[k] = rel[k];
      } else {
        for (const k of Object.keys(rel)) emaState[k] = alpha * rel[k] + (1 - alpha) * (emaState[k] ?? 0);
      }

      // Prefill if needed
      if (smoother && (smoother as any).bufferSize && (smoother as any).bufferSize !== prevSmootherWindow) {
        // already handled elsewhere; noop
      }
      if (smoother && emaState) smoother.updateAll(emaState);
      const smooth = smoother ? smoother.getAll() : rel;

      const now = Date.now();
      if (now - lastPostTs >= currentPostRate) {
        lastPostTs = now;
        (self as unknown as Worker).postMessage({ raw, relative: rel, smooth, relBands: rel, smoothBands: smooth });
      }
    }
    return;
  }

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
    const postRateMs = Math.max(200, data.postRateMs ?? 200);
    const emaTauMs = data.emaTauMs ?? 1000;
    const mode = data.mode ?? data.processingMode ?? 'welch';

    currentPostRate = postRateMs;

    // Build input aligned to the right (most recent samples)
    const input = new Float32Array(fftSize);
    const start = Math.max(0, upstream.length - fftSize);
    const offset = fftSize - (upstream.length - start);
    for (let i = 0; i < fftSize; i++) {
      const srcIdx = start + (i - offset);
      input[i] = (srcIdx >= start && srcIdx < upstream.length) ? Number(upstream[srcIdx]) || 0 : 0;
    }

    // Ensure smoother exists and matches requested window
    let needPrefill = false;
    if (!smoother || prevSmootherWindow !== smootherWindow) {
      smoother = new BandSmoother(smootherWindow);
      prevSmootherWindow = smootherWindow;
      emaState = null; // reset EMA when window changes
      needPrefill = true;
    }

    // Compute band powers via selected mode
    let raw: Record<string, number> = {};
    let rel: Record<string, number> = {};
    if (mode === 'simple') {
      // Single-FFT path: reuse FFT if possible
      let fft = fftCache[fftSize];
      if (!fft) { fft = new FFT(fftSize); fftCache[fftSize] = fft; }
      const mags = fft.computeMagnitudes(input);
      for (const [band, range] of Object.entries(BANDS)) {
        raw[band] = calculateBandPower(mags, range, sampleRate, fftSize);
      }
      const total = Object.values(raw).reduce((a, b) => a + b, 0);
      for (const band of Object.keys(BANDS)) rel[band] = total > 0 ? raw[band] / total : 0;
    } else {
      const res = computeBandPowersWelch(
        Array.from(input),
        sampleRate,
        fftSize,
        Math.min(fftSize, 256),
        0.5
      );
      raw = res.raw;
      rel = res.relative;
    }

    // EMA smoothing: compute alpha from time-constant (tau)
    const alpha = 1 - Math.exp(-currentPostRate / Math.max(1, emaTauMs));
    if (!emaState) {
      emaState = {} as Record<string, number>;
      for (const k of Object.keys(rel)) emaState[k] = rel[k];
    } else {
      for (const k of Object.keys(rel)) {
        emaState[k] = alpha * rel[k] + (1 - alpha) * (emaState[k] ?? 0);
      }
    }

    // Prefill BandSmoother to avoid cold-start zeros (efficient)
    if (needPrefill && smoother && emaState) {
      smoother.prefill(emaState);
    }

    // Update smoother with EMA-smoothed vector (combines both methods)
    if (smoother && emaState) smoother.updateAll(emaState);
    const smooth = smoother ? smoother.getAll() : rel;

    const now = Date.now();
    if (now - lastPostTs >= currentPostRate) {
      lastPostTs = now;
      (self as unknown as Worker).postMessage({ raw, relative: rel, smooth, relBands: rel, smoothBands: smooth });
    }
    return;
  }

  // Fallback: original message shape expects `eeg` samples
  const { eeg, sampleRate = 500, fftSize = 256, smootherWindow = 128 } = data;
  const postRateMs = Math.max(200, data.postRateMs ?? 200);
  const emaTauMs = data.emaTauMs ?? 1000;
  const mode = data.mode ?? data.processingMode ?? 'welch';

  currentPostRate = postRateMs;

  // Ensure smoother exists and matches requested window
  let needPrefill = false;
  if (!smoother || prevSmootherWindow !== smootherWindow) {
    smoother = new BandSmoother(smootherWindow);
    prevSmootherWindow = smootherWindow;
    emaState = null;
    needPrefill = true;
  }
  // Normalize various incoming shapes (ArrayBuffer, Float32Array, JS array)
  let eegBuf: Float32Array;
  if (eeg instanceof ArrayBuffer) eegBuf = new Float32Array(eeg);
  else if (Array.isArray(eeg)) eegBuf = new Float32Array(eeg);
  else if (eeg && eeg.buffer instanceof ArrayBuffer) eegBuf = new Float32Array(eeg.buffer);
  else eegBuf = new Float32Array(0);

  let raw: Record<string, number> = {};
  let rel: Record<string, number> = {};
  if (mode === 'simple') {
    // ensure input length and zero-pad/truncate
    const input = new Float32Array(fftSize);
    input.set(eegBuf.subarray(Math.max(0, eegBuf.length - fftSize)));
    let fft = fftCache[fftSize];
    if (!fft) { fft = new FFT(fftSize); fftCache[fftSize] = fft; }
    const mags = fft.computeMagnitudes(input);
    for (const [band, range] of Object.entries(BANDS)) {
      raw[band] = calculateBandPower(mags, range, sampleRate, fftSize);
    }
    const total = Object.values(raw).reduce((a, b) => a + b, 0);
    for (const band of Object.keys(BANDS)) rel[band] = total > 0 ? raw[band] / total : 0;
  } else {
    const res = computeBandPowersWelch(
      Array.from(eegBuf),
      sampleRate,
      fftSize,
      Math.min(fftSize, 256),
      0.5
    );
    raw = res.raw;
    rel = res.relative;
  }

  // EMA smoothing
  const alpha = 1 - Math.exp(-currentPostRate / Math.max(1, emaTauMs));
  if (!emaState) {
    emaState = {} as Record<string, number>;
    for (const k of Object.keys(rel)) emaState[k] = rel[k];
  } else {
    for (const k of Object.keys(rel)) {
      emaState[k] = alpha * rel[k] + (1 - alpha) * (emaState[k] ?? 0);
    }
  }

  if (needPrefill && smoother && emaState) {
    smoother.prefill(emaState);
  }

  if (smoother && emaState) smoother.updateAll(emaState);
  const smooth = smoother ? smoother.getAll() : rel;

  const now = Date.now();
  if (now - lastPostTs >= currentPostRate) {
    lastPostTs = now;
    (self as unknown as Worker).postMessage({ raw, relative: rel, smooth, relBands: rel, smoothBands: smooth });
  }
};
