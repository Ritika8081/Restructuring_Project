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

// This worker now supports multiple logical "channels" keyed by the
// `channel` (or `channelIndex` / `widgetId`) field in the incoming message.
// Each logical channel keeps its own smoother and circular buffers so a
// single Worker can safely serve many widgets/devices without mixing state.

type PerChannelState = {
  smoother: BandSmoother | null;
  prevSmootherWindow: number;
  emaState: Record<string, number> | null;
  lastPostTs: number;
  currentPostRate: number;
  bufferCache: Record<number, { buf: Float32Array; idx: number; samplesSinceFFT: number; samplesPerFFT: number }>;
};

const perChannel: Record<string, PerChannelState> = {};

// Shared FFT cache (can be reused across channels)
const fftCache: Record<number, FFT> = {};

// Note: filtering (notch/IIR) is applied upstream by the flowchart widget.
// This worker processes raw samples pushed from the UI/flow and does not
// apply additional filtering here to avoid duplicate filtering.

self.onmessage = (e: MessageEvent<any>) => {
  const data = e.data || {};
  const channelKey = String(data.channel ?? data.channelIndex ?? data.widgetId ?? '0');

  // Ensure per-channel state exists
  let state = perChannel[channelKey];
  if (!state) {
    state = {
      smoother: null,
      prevSmootherWindow: 0,
      emaState: null,
      lastPostTs: 0,
      currentPostRate: 200,
      bufferCache: {},
    };
    perChannel[channelKey] = state;
  }

  // Streaming single-sample message handler
  if (data.sample !== undefined) {
    const sample = Number(data.sample) || 0;
    const sampleRate = data.sampleRate ?? 500;
    const fftSize = data.fftSize ?? 256;
    const samplesPerFFT = data.samplesPerFFT ?? 10;
    const smootherWindow = data.smootherWindow ?? 128;

    // Ensure buffer entry for this channel
    let entry = state.bufferCache[fftSize];
    if (!entry) {
      entry = { buf: new Float32Array(fftSize), idx: 0, samplesSinceFFT: 0, samplesPerFFT };
      state.bufferCache[fftSize] = entry;
    }

    const v = sample;
    entry.buf[entry.idx] = v;
    entry.idx = (entry.idx + 1) % fftSize;
    entry.samplesSinceFFT++;

    if (!state.smoother || state.prevSmootherWindow !== smootherWindow) {
      state.smoother = new BandSmoother(smootherWindow);
      state.prevSmootherWindow = smootherWindow;
      state.emaState = null;
    }

    if (entry.samplesSinceFFT >= samplesPerFFT) {
      entry.samplesSinceFFT = 0;
      const input = new Float32Array(fftSize);
      for (let i = 0; i < fftSize; i++) {
        const idx = (entry.idx + i) % fftSize;
        input[i] = entry.buf[idx];
      }

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

      const alpha = 1 - Math.exp(-state.currentPostRate / Math.max(1, 1000));
      if (!state.emaState) {
        state.emaState = {} as Record<string, number>;
        for (const k of Object.keys(rel)) state.emaState[k] = rel[k];
      } else {
        for (const k of Object.keys(rel)) state.emaState[k] = alpha * rel[k] + (1 - alpha) * (state.emaState[k] ?? 0);
      }

      if (state.smoother && state.emaState) state.smoother.updateAll(state.emaState);
      const smooth = state.smoother ? state.smoother.getAll() : rel;

      const now = Date.now();
      if (now - state.lastPostTs >= state.currentPostRate) {
        state.lastPostTs = now;
        (self as unknown as Worker).postMessage({ channelIndex: data.channel ?? data.channelIndex ?? null, raw, relative: rel, smooth, relBands: rel, smoothBands: smooth });
      }
    }
    return;
  }

  // Upstream array processing
  if (data.upstream) {
    const upstream = data.upstream as number[];
    const sampleRate = data.sampleRate ?? 500;
    const fftSize = data.fftSize ?? 256;
    const smootherWindow = data.smootherWindow ?? 128;
    const postRateMs = Math.max(200, data.postRateMs ?? 200);
    const emaTauMs = data.emaTauMs ?? 1000;
    const mode = data.mode ?? data.processingMode ?? 'welch';

    state.currentPostRate = postRateMs;

    const input = new Float32Array(fftSize);
    const start = Math.max(0, upstream.length - fftSize);
    const offset = fftSize - (upstream.length - start);
    for (let i = 0; i < fftSize; i++) {
      const srcIdx = start + (i - offset);
      input[i] = (srcIdx >= start && srcIdx < upstream.length) ? Number(upstream[srcIdx]) || 0 : 0;
    }

    let needPrefill = false;
    if (!state.smoother || state.prevSmootherWindow !== smootherWindow) {
      state.smoother = new BandSmoother(smootherWindow);
      state.prevSmootherWindow = smootherWindow;
      state.emaState = null;
      needPrefill = true;
    }

    let raw: Record<string, number> = {};
    let rel: Record<string, number> = {};
    if (mode === 'simple') {
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

    const alpha = 1 - Math.exp(-state.currentPostRate / Math.max(1, emaTauMs));
    if (!state.emaState) {
      state.emaState = {} as Record<string, number>;
      for (const k of Object.keys(rel)) state.emaState[k] = rel[k];
    } else {
      for (const k of Object.keys(rel)) {
        state.emaState[k] = alpha * rel[k] + (1 - alpha) * (state.emaState[k] ?? 0);
      }
    }

    if (needPrefill && state.smoother && state.emaState) {
      state.smoother.prefill(state.emaState);
    }

    if (state.smoother && state.emaState) state.smoother.updateAll(state.emaState);
    const smooth = state.smoother ? state.smoother.getAll() : rel;

    const now = Date.now();
    if (now - state.lastPostTs >= state.currentPostRate) {
      state.lastPostTs = now;
      (self as unknown as Worker).postMessage({ channelIndex: data.channel ?? data.channelIndex ?? null, raw, relative: rel, smooth, relBands: rel, smoothBands: smooth });
    }
    return;
  }

  // Fallback handling for `eeg` payload shape
  const { eeg, sampleRate = 500, fftSize = 256, smootherWindow = 128 } = data;
  const postRateMs = Math.max(200, data.postRateMs ?? 200);
  const emaTauMs = data.emaTauMs ?? 1000;
  const mode = data.mode ?? data.processingMode ?? 'welch';

  state.currentPostRate = postRateMs;

  let needPrefill = false;
  if (!state.smoother || state.prevSmootherWindow !== smootherWindow) {
    state.smoother = new BandSmoother(smootherWindow);
    state.prevSmootherWindow = smootherWindow;
    state.emaState = null;
    needPrefill = true;
  }

  let eegBuf: Float32Array;
  if (eeg instanceof ArrayBuffer) eegBuf = new Float32Array(eeg);
  else if (Array.isArray(eeg)) eegBuf = new Float32Array(eeg);
  else if (eeg && eeg.buffer instanceof ArrayBuffer) eegBuf = new Float32Array(eeg.buffer);
  else eegBuf = new Float32Array(0);

  let raw: Record<string, number> = {};
  let rel: Record<string, number> = {};
  if (mode === 'simple') {
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

  const alpha = 1 - Math.exp(-state.currentPostRate / Math.max(1, emaTauMs));
  if (!state.emaState) {
    state.emaState = {} as Record<string, number>;
    for (const k of Object.keys(rel)) state.emaState[k] = rel[k];
  } else {
    for (const k of Object.keys(rel)) {
      state.emaState[k] = alpha * rel[k] + (1 - alpha) * (state.emaState[k] ?? 0);
    }
  }

  if (needPrefill && state.smoother && state.emaState) {
    state.smoother.prefill(state.emaState);
  }

  if (state.smoother && state.emaState) state.smoother.updateAll(state.emaState);
  const smooth = state.smoother ? state.smoother.getAll() : rel;

  const now = Date.now();
  if (now - state.lastPostTs >= state.currentPostRate) {
    state.lastPostTs = now;
    (self as unknown as Worker).postMessage({ channelIndex: data.channel ?? data.channelIndex ?? null, raw, relative: rel, smooth, relBands: rel, smoothBands: smooth });
  }
};
