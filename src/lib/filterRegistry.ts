// Central registry for filter nodes
import { HighPassFilter, EXGFilter, Notch } from './filters';

type FilterKind = 'highpass' | 'exg' | 'notch';

export type FilterConfig = {
  kind: FilterKind;
  samplingRate?: number; // 250 | 500
  bits?: string; // for EXG
  exgType?: number; // 1..4
  notchType?: number; // 1..2
};

type FilterEntry = {
  id: string;
  config: FilterConfig;
  instance: HighPassFilter | EXGFilter | Notch | null;
  inputSource?: string | null; // e.g. 'channel-1'
  buffer: number[]; // recent output samples
};

const entries: Map<string, FilterEntry> = new Map();
const MAX_BUFFER = 1024;

export function registerFilter(id: string, config: FilterConfig) {
  let entry = entries.get(id);
  if (!entry) {
    entry = { id, config, instance: null, inputSource: null, buffer: [] };
    entries.set(id, entry);
  }
  entry.config = config;
  // create instance according to config
  if (config.kind === 'highpass') {
    const inst = new HighPassFilter();
    if (config.samplingRate) inst.setSamplingRate(config.samplingRate);
    entry.instance = inst;
  } else if (config.kind === 'exg') {
    const inst = new EXGFilter();
    // If bits not provided, use a sensible default (12-bit ADC) so yScale is non-zero
    const bits = config.bits || '12';
    if (config.samplingRate) inst.setbits(bits, config.samplingRate);
    entry.instance = inst;
  } else if (config.kind === 'notch') {
    const inst = new Notch();
    if (config.samplingRate) inst.setbits(config.samplingRate);
    entry.instance = inst;
  }
  entry.buffer = [];
}

export function unregisterFilter(id: string) {
  entries.delete(id);
}

export function setFilterConfig(id: string, config: FilterConfig) {
  registerFilter(id, config);
}

export function connectFilterInput(filterId: string, sourceId: string | null) {
  const entry = entries.get(filterId);
  if (!entry) return;
  entry.inputSource = sourceId;
}

export function syncConnections(connections: Array<{ from: string; to: string }>) {
  // reset inputs
  entries.forEach(e => { e.inputSource = null; });
  for (const c of connections) {
    if (c.to && c.to.startsWith('filter-')) {
      // only consider channel -> filter mappings for now
      if (c.from && c.from.startsWith('channel-')) {
        const ent = entries.get(c.to);
        if (ent) ent.inputSource = c.from;
      }
    }
  }
}

export function onRawSample(sample: Record<string, any>) {
  // sample is like { ch0, ch1, ch2, ... }
  entries.forEach(entry => {
    if (!entry.inputSource || !entry.instance) return;
    const m = String(entry.inputSource).match(/channel-(\d+)/i);
    const idx = m ? Math.max(1, parseInt(m[1], 10)) - 1 : 0; // zero-based
    const key = `ch${idx}`;
    const val = typeof sample[key] === 'number' ? sample[key] : 0;
    let out = val;
    try {
      if (entry.config.kind === 'highpass') {
        out = (entry.instance as HighPassFilter).process(val);
      } else if (entry.config.kind === 'exg') {
        const t = entry.config.exgType || 1;
        out = (entry.instance as EXGFilter).process(val, t);
      } else if (entry.config.kind === 'notch') {
        const t = entry.config.notchType || 1;
        out = (entry.instance as Notch).process(val, t);
      }
    } catch (err) {
      // swallow processing errors
    }
    entry.buffer.push(out);
    if (entry.buffer.length > MAX_BUFFER) entry.buffer.shift();
  });
}

export function getFilterBuffer(filterId: string) {
  const entry = entries.get(filterId);
  return entry ? entry.buffer : [];
}

export function getRegisteredFilters() {
  return Array.from(entries.values()).map(e => ({ id: e.id, config: e.config, inputSource: e.inputSource }));
}

export default {
  registerFilter,
  unregisterFilter,
  setFilterConfig,
  connectFilterInput,
  syncConnections,
  onRawSample,
  getFilterBuffer,
  getRegisteredFilters,
};
