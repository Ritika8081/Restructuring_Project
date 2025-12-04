// src/lib/bandpowerPool.ts
// Provides a single shared bandpower Worker instance for the app.
let sharedBandpowerWorker: Worker | null = null;

export function getBandpowerWorker(): Worker {
  if (!sharedBandpowerWorker) {
    sharedBandpowerWorker = new Worker(new URL('@/workers/bandpower.worker.ts', import.meta.url), { type: 'module' });
  }
  return sharedBandpowerWorker;
}

export function _resetBandpowerWorkerForTests(): void {
  // internal helper to allow clean resets in tests/devtools (not used in prod)
  if (sharedBandpowerWorker) {
    try { sharedBandpowerWorker.terminate(); } catch (e) { }
  }
  sharedBandpowerWorker = null;
}
