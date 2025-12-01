import React, { useEffect, useState, useCallback, useRef } from 'react';

type Step = {
  selector: string; // query selector for element to highlight
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  action?: 'drag-demo' | 'connect-demo' | 'flow-demo';
};

type Props = {
  steps: Step[];
  open: boolean;
  onClose?: () => void;
  initial?: number;
  theme?: 'dark' | 'glass' | 'neon' | 'default';
  // When true, the tour will NOT call `scrollIntoView` on target elements.
  // This avoids forcing page/modal scrolling when the tour opens.
  preventAutoScroll?: boolean;
  // Optional callback for demo actions (drag, connect, etc.). If it returns a Promise,
  // the tour will wait for it to resolve and then auto-advance to the next step.
  onAction?: (action: Step['action'] | undefined, index: number) => void | Promise<void>;
};

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

const OnboardingTour: React.FC<Props> = ({ steps, open, onClose, initial = 0, theme = 'default', onAction, preventAutoScroll = false }) => {
  const tourDemoRef = useRef<{ nodes: HTMLElement[] }>({ nodes: [] });

  const [index, setIndex] = useState<number>(initial);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(open);

  // Internal demo runner: if parent doesn't provide `onAction`, use these
  const performInternalAction = useCallback(async (action: Step['action'] | undefined, idx: number) => {
    if (!action) return;
    try {
      // helpers
      const makeFixedDiv = (opts: Partial<CSSStyleDeclaration> = {}) => {
        const d = document.createElement('div');
        d.style.position = 'fixed';
        d.style.pointerEvents = 'none';
        d.style.zIndex = '200080';
        Object.assign(d.style, opts);
        return d;
      };

      if (action === 'drag-demo') {
        const src = document.querySelector('#flow-palette div[draggable]') as HTMLElement | null;
        const destArea = document.getElementById('flow-area');
        if (!src || !destArea) return;
        const sRect = src.getBoundingClientRect();
        const dRect = destArea.getBoundingClientRect();
        const ghost = makeFixedDiv({ left: `${sRect.left}px`, top: `${sRect.top}px`, width: `${sRect.width}px`, height: `${sRect.height}px` });
        ghost.className = 'tour-demo-ghost';
        ghost.style.background = (window.getComputedStyle(src).backgroundColor as string) || '#eef2ff';
        ghost.style.border = '1px solid rgba(0,0,0,0.06)';
        ghost.style.borderRadius = '8px';
        ghost.style.boxShadow = '0 12px 30px rgba(2,6,23,0.08)';
        ghost.style.transition = 'transform 700ms cubic-bezier(.2,.9,.2,1), left 700ms, top 700ms, opacity 300ms';
        document.body.appendChild(ghost);
        tourDemoRef.current.nodes.push(ghost);

        const destX = dRect.left + Math.max(60, dRect.width * 0.3);
        const destY = dRect.top + Math.max(60, dRect.height * 0.3);
        const tooltipEl = document.querySelector('[data-tour-tooltip]') as HTMLElement | null;
        let finalDestX = destX;
        let finalDestY = destY;
        const NODE_W = 160; const NODE_H = 80; const AVOID_MARGIN = 12;
        try {
          if (tooltipEl) {
            const tRect = tooltipEl.getBoundingClientRect();
            const nodeRect = { left: finalDestX, top: finalDestY, right: finalDestX + NODE_W, bottom: finalDestY + NODE_H };
            const intersects = !(nodeRect.right < tRect.left || nodeRect.left > tRect.right || nodeRect.bottom < tRect.top || nodeRect.top > tRect.bottom);
            if (intersects) {
              const shiftX = (tRect.right - nodeRect.left) + AVOID_MARGIN;
              let attemptX = finalDestX + shiftX;
              if (attemptX + NODE_W <= window.innerWidth - 12) finalDestX = attemptX;
              else {
                const attemptY = tRect.top - NODE_H - AVOID_MARGIN;
                if (attemptY >= 12) finalDestY = attemptY;
                else {
                  const attemptX2 = tRect.left - NODE_W - AVOID_MARGIN;
                  if (attemptX2 >= 12) finalDestX = attemptX2; else finalDestY = Math.min(window.innerHeight - NODE_H - 12, tRect.bottom + AVOID_MARGIN);
                }
              }
            }
          }
        } catch (e) { }

        requestAnimationFrame(() => {
          try { ghost.style.left = `${finalDestX}px`; ghost.style.top = `${finalDestY}px`; ghost.style.transform = 'scale(1.02)'; } catch (e) { }
        });

        await new Promise<void>((resolve) => {
          setTimeout(() => {
            try {
              const node = makeFixedDiv({ left: `${finalDestX}px`, top: `${finalDestY}px`, width: '160px', height: '80px' });
              node.style.borderRadius = '10px';
              node.style.background = '#eef2ff';
              node.style.border = '1px solid #c7d2fe';
              node.style.boxShadow = '0 12px 30px rgba(2,6,23,0.08)';
              node.style.display = 'flex'; node.style.alignItems = 'center'; node.style.justifyContent = 'center'; node.style.fontWeight = '700';
              node.textContent = 'Demo Node';
              document.body.appendChild(node);
              tourDemoRef.current.nodes.push(node);

              setTimeout(() => { try { node.style.opacity = '0'; node.style.transform = 'scale(0.98)'; } catch (e) { } }, 700);
              const fallbackRem = window.setTimeout(() => { try { node.remove(); } catch (e) { } resolve(); }, 2200);
              node.addEventListener('transitionend', () => { try { window.clearTimeout(fallbackRem); node.remove(); } catch (e) { } resolve(); });
            } catch (e) { resolve(); }
            try { ghost.style.opacity = '0'; } catch (e) { }
            setTimeout(() => { try { ghost.remove(); } catch (e) { } }, 300);
          }, 820);
        });
      }

      if (action === 'flow-demo') {
        const destArea = document.getElementById('flow-area');
        if (!destArea) return;
        const dRect = destArea.getBoundingClientRect();
        const positions = [
          { x: dRect.left + dRect.width * 0.28, y: dRect.top + dRect.height * 0.32 },
          { x: dRect.left + dRect.width * 0.5, y: dRect.top + dRect.height * 0.22 },
          { x: dRect.left + dRect.width * 0.72, y: dRect.top + dRect.height * 0.42 },
        ];
        const nodes: HTMLElement[] = positions.map(p => {
          const n = makeFixedDiv({ left: `${p.x}px`, top: `${p.y}px`, width: '140px', height: '72px' });
          n.style.borderRadius = '10px'; n.style.background = '#eef2ff'; n.style.border = '1px solid #c7d2fe'; n.style.boxShadow = '0 12px 30px rgba(2,6,23,0.08)';
          n.style.display = 'flex'; n.style.alignItems = 'center'; n.style.justifyContent = 'center'; n.style.fontWeight = '700'; n.style.color = '#0f172a';
          document.body.appendChild(n); tourDemoRef.current.nodes.push(n); return n;
        });

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); svg.style.position = 'fixed'; svg.style.left = '0'; svg.style.top = '0'; svg.style.zIndex = '200070'; svg.style.pointerEvents = 'none';
        const makePath = (stroke = '#60a5fa') => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('stroke', stroke); p.setAttribute('stroke-width', '4'); p.setAttribute('fill', 'none'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); svg.appendChild(p); return p; };
        const pAB = makePath('#60a5fa'); const pBC = makePath('#60a5fa'); const pAC = makePath('#60a5fa');
        document.body.appendChild(svg);

        const update = () => {
          try {
            const r0 = nodes[0].getBoundingClientRect(); const r1 = nodes[1].getBoundingClientRect(); const r2 = nodes[2].getBoundingClientRect();
            const mid = (x1: number, x2: number) => (x1 + x2) / 2;
            const xA = r0.left + r0.width; const yA = r0.top + r0.height / 2; const xB = r1.left + r1.width / 2; const yB = r1.top + r1.height / 2; const xC = r2.left; const yC = r2.top + r2.height / 2;
            const dAB = `M ${xA} ${yA} C ${mid(xA, xB)} ${yA}, ${mid(xA, xB)} ${yB}, ${xB} ${yB}`;
            const dBC = `M ${xB} ${yB} C ${mid(xB, xC)} ${yB}, ${mid(xB, xC)} ${yC}, ${xC} ${yC}`;
            pAB.setAttribute('d', dAB); pBC.setAttribute('d', dBC);
          } catch (e) { }
        };
        update();
        const startAnim = (path: SVGPathElement, delay: number) => {
          let len = 300; try { len = (path as any).getTotalLength ? (path as any).getTotalLength() : len; } catch (e) { }
          path.style.strokeDasharray = `${len}`; path.style.strokeDashoffset = `${len}`; path.getBoundingClientRect(); path.style.transition = 'stroke-dashoffset 700ms ease-out'; setTimeout(() => { try { path.style.strokeDashoffset = '0'; } catch (e) { } }, delay);
        };
        startAnim(pAB as any, 120); startAnim(pBC as any, 420); startAnim(pAC as any, 740);

        await new Promise<void>((resolve) => {
          const cleanup = () => { try { svg.remove(); } catch (e) { } try { tourDemoRef.current.nodes.forEach(n => n.remove()); } catch (e) { } tourDemoRef.current.nodes = []; resolve(); };
          const fallback = window.setTimeout(cleanup, 3000);
          try { pAC.addEventListener('transitionend', () => { window.clearTimeout(fallback); cleanup(); }); } catch (e) { }
        });
      }

      if (action === 'connect-demo') {
        // show centered overlay listing device types, then small highlight + connect label
        try { (window as any).__DEMO_SUPPRESS_CONN_MODAL = true; } catch (e) { }
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed'; overlay.style.zIndex = '200050'; overlay.style.minWidth = '160px'; overlay.style.borderRadius = '8px'; overlay.style.background = '#fff'; overlay.style.boxShadow = '0 8px 20px rgba(2,6,23,0.06)'; overlay.style.padding = '8px'; overlay.style.fontSize = '13px'; overlay.style.fontWeight = '600'; overlay.style.pointerEvents = 'none';
        try {
          // Wait briefly for the flow area to exist (tour might open before modal mounts)
          const waitForFlowArea = async (timeout = 800) => {
            const start = Date.now();
            let el = document.getElementById('flow-area');
            if (el) return el;
            while (Date.now() - start < timeout) {
              await new Promise(r => setTimeout(r, 80));
              el = document.getElementById('flow-area');
              if (el) return el;
            }
            return null;
          };

          const flowEl = await waitForFlowArea(800);
          if (flowEl) {
            const fr = flowEl.getBoundingClientRect();
            // Position overlay at the center of the flow area (viewport coordinates)
            overlay.style.left = `${fr.left + fr.width / 2}px`;
            overlay.style.top = `${fr.top + fr.height / 2}px`;
            overlay.style.transform = 'translate(-50%, -50%)';
          } else {
            // Fallback: center of viewport
            overlay.style.left = '50%'; overlay.style.top = '50%'; overlay.style.transform = 'translate(-50%, -50%)';
          }
        } catch (e) { overlay.style.left = '50%'; overlay.style.top = '50%'; overlay.style.transform = 'translate(-50%, -50%)'; }

        const list = document.createElement('div'); list.style.display = 'flex'; list.style.flexDirection = 'column'; list.style.gap = '6px';
        const names = ['Ble', 'Serial', 'Wifi']; const rows: HTMLDivElement[] = [];
        for (const n of names) { const r = document.createElement('div'); r.textContent = n; r.style.padding = '6px 8px'; r.style.borderRadius = '6px'; r.style.border = '1px solid transparent'; r.style.background = '#fff'; r.style.position = 'relative'; list.appendChild(r); rows.push(r); }
        overlay.appendChild(list); document.body.appendChild(overlay); tourDemoRef.current.nodes.push(overlay);

        const first = rows[0]; const bar = document.createElement('div'); bar.style.position = 'absolute'; bar.style.left = '0'; bar.style.top = '6px'; bar.style.bottom = '6px'; bar.style.width = '4px'; bar.style.borderTopLeftRadius = '6px'; bar.style.borderBottomLeftRadius = '6px'; bar.style.background = 'rgba(16,185,129,0.9)'; bar.style.opacity = '0'; bar.style.transition = 'opacity 140ms ease'; try { first.appendChild(bar); } catch (e) { }
        const timers: number[] = [];
        timers.push(window.setTimeout(() => { try { bar.style.opacity = '1'; } catch (e) { } }, 190));
        timers.push(window.setTimeout(() => { try { bar.style.opacity = '0'; } catch (e) { } }, 1300));
        timers.push(window.setTimeout(() => { try { const info = document.createElement('div'); info.textContent = 'Connecting…'; info.style.fontWeight = '700'; info.style.marginTop = '8px'; info.style.fontSize = '13px'; overlay.appendChild(info); } catch (e) { } }, 1320));

        await new Promise<void>((resolve) => {
          timers.push(window.setTimeout(() => { try { overlay.remove(); } catch (e) { } try { (window as any).__DEMO_SUPPRESS_CONN_MODAL = false; } catch (e) { } timers.forEach(t => window.clearTimeout(t)); resolve(); } , 1820));
        });
      }
    } catch (e) { /* swallow */ }
  }, [steps.length]);

  // cleanup any demo nodes when tour unmounts
  useEffect(() => {
    return () => {
      try { tourDemoRef.current.nodes.forEach(n => n.remove()); } catch (e) { }
      tourDemoRef.current.nodes = [];
      try { (window as any).__DEMO_SUPPRESS_CONN_MODAL = false; } catch (e) { }
    };
  }, []);
  

  useEffect(() => { setVisible(open); }, [open]);

  // When opened, ensure the tour starts at the provided initial step
  useEffect(() => {
    if (open) setIndex(initial);
  }, [open, initial]);

  const updateTarget = useCallback((i: number) => {
    const s = steps[i];
    if (!s) { setTargetRect(null); return; }
    try {
      const el = document.querySelector(s.selector) as HTMLElement | null;
      if (!el) { setTargetRect(null); return; }
      // Only auto-scroll when not explicitly prevented. Auto-scrolling can
      // cause fixed/fullscreen modals or pinned UI to jump; callers may
      // prefer to disable it (see `preventAutoScroll` prop).
      if (!preventAutoScroll && typeof (el as any).scrollIntoView === 'function') {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch (e) { }
      }
      const r = el.getBoundingClientRect();
      setTargetRect(r);
    } catch (e) { setTargetRect(null); }
  }, [steps]);

  useEffect(() => {
    if (!visible) return;
    updateTarget(index);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'ArrowRight' || ev.key === 'Enter') setIndex(i => Math.min(i + 1, steps.length - 1));
      if (ev.key === 'ArrowLeft') setIndex(i => Math.max(i - 1, 0));
      if (ev.key === 'Escape') { setVisible(false); onClose && onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, index, steps.length, updateTarget, onClose]);

  useEffect(() => { if (visible) updateTarget(index); }, [index, visible, updateTarget]);

  // Trigger optional demo action when a step becomes active. If `onAction` returns
  // a Promise, await it and auto-advance to the next step when it resolves.
  const actionPendingRef = useRef<number | null>(null);
  useEffect(() => {
    if (!visible) return;
    const s = steps[index];
    if (s && s.action) {
      // give visual highlight a moment to appear
      actionPendingRef.current = index;
      let cancelled = false;
      const run = async () => {
        try {
          if (typeof onAction === 'function') {
            const maybe = onAction(s.action, index);
            if (maybe && typeof (maybe as any).then === 'function') {
              await (maybe as Promise<void>);
            }
          } else {
            // parent didn't provide handler — run internal demo
            await performInternalAction(s.action, index as number);
          }
          if (cancelled) return;
          // only auto-advance if the step hasn't changed and tour still visible
          // For certain actions (like 'connect-demo') we want the step to remain
          // until the user explicitly clicks Next — do not auto-advance in that case.
          // Also avoid auto-advancing into a connect-demo: if the *next* step is
          // a connect-demo, require the user to click Next instead of jumping.
          const nextStep = steps[index + 1];
          const autoAdvanceAllowed = s.action !== 'connect-demo' && !(nextStep && nextStep.action === 'connect-demo');
          if (autoAdvanceAllowed && visible && actionPendingRef.current === index) {
            setTimeout(() => {
              try {
                setIndex(i => Math.min(i + 1, steps.length - 1));
              } catch (e) { }
            }, 240);
          }
        } catch (e) { /* swallow */ }
      };
      const t = setTimeout(run, 1420);
      return () => { cancelled = true; actionPendingRef.current = null; clearTimeout(t); };
    }
    return () => { actionPendingRef.current = null; };
  }, [index, visible, steps, onAction, performInternalAction]);

  const next = () => { if (index < steps.length - 1) setIndex(i => i + 1); else { setVisible(false); onClose && onClose(); } };
  const prev = () => setIndex(i => Math.max(0, i - 1));

  if (!visible) return null;

  const step = steps[index];

  // Theme styles
  const themeStyles: Record<string, any> = {
    default: { bg: 'white', fg: '#0f172a', panelBg: 'rgba(255,255,255,0.98)', overlay: 'rgba(0,0,0,0.45)' },
    dark: { bg: '#0b1220', fg: '#e6eef8', panelBg: 'rgba(4,6,12,0.9)', overlay: 'rgba(0,0,0,0.6)' },
    glass: { bg: 'rgba(255,255,255,0.04)', fg: '#0f172a', panelBg: 'rgba(255,255,255,0.78)', overlay: 'rgba(2,6,23,0.55)' },
    neon: { bg: '#0b1220', fg: '#7ef9ff', panelBg: 'linear-gradient(135deg,#0f172a 0%,#0b1220 100%)', overlay: 'rgba(0,0,0,0.65)' },
  };
  const ts = themeStyles[theme] || themeStyles.default;

  // Compute tooltip position relative to targetRect
  // Reserve an estimated tooltip height so controls (Next/Done) remain visible
  const EST_TOOLTIP_HEIGHT = 220;
  // tooltip z-index elevated so its controls are never clipped by the highlight outline
  const tooltipStyle: React.CSSProperties = { position: 'fixed', zIndex: 200080, maxWidth: 420, boxShadow: '0 10px 40px rgba(2,6,23,0.36)', borderRadius: 12 };
  if (targetRect) {
    const margin = 12;
    // prefer position given in step or auto
    const pos = step.position || 'auto';
    if (pos === 'auto' || pos === 'bottom') {
      tooltipStyle.left = clamp(targetRect.left + targetRect.width / 2 - 200, 12, window.innerWidth - 432);
      tooltipStyle.top = clamp(targetRect.bottom + margin, 12, window.innerHeight - EST_TOOLTIP_HEIGHT);
    }
    if (pos === 'top') {
      tooltipStyle.left = clamp(targetRect.left + targetRect.width / 2 - 200, 12, window.innerWidth - 432);
      tooltipStyle.top = clamp(targetRect.top - 160, 12, window.innerHeight - EST_TOOLTIP_HEIGHT);
    }
    if (pos === 'left') {
      tooltipStyle.left = clamp(targetRect.left - 440, 12, window.innerWidth - 432);
      tooltipStyle.top = clamp(targetRect.top + targetRect.height / 2 - 60, 12, window.innerHeight - EST_TOOLTIP_HEIGHT);
    }
    if (pos === 'right') {
      tooltipStyle.left = clamp(targetRect.right + margin, 12, window.innerWidth - 432);
      tooltipStyle.top = clamp(targetRect.top + targetRect.height / 2 - 60, 12, window.innerHeight - EST_TOOLTIP_HEIGHT);
    }
    // if the computed tooltip would overlap the target, try to nudge it away
    try {
      const estW = Math.min(420, window.innerWidth - 48);
      const estH = EST_TOOLTIP_HEIGHT; // estimated tooltip height
      let tl = typeof tooltipStyle.left === 'number' ? tooltipStyle.left : parseInt(String(tooltipStyle.left as any)) || 24;
      let tt = typeof tooltipStyle.top === 'number' ? tooltipStyle.top : parseInt(String(tooltipStyle.top as any)) || 80;
      const overlaps = !(tl + estW < targetRect.left || tl > targetRect.right || tt + estH < targetRect.top || tt > targetRect.bottom);
      if (overlaps) {
        // prefer placing above the target if there's room
        const above = targetRect.top - estH - margin;
        if (above >= 12) {
          tt = clamp(above, 12, window.innerHeight - EST_TOOLTIP_HEIGHT);
        } else {
          // try left
          const left = targetRect.left - estW - margin;
          if (left >= 12) {
            tl = left;
          } else {
            // try right
            const right = targetRect.right + margin;
            if (right + estW <= window.innerWidth - 12) {
              tl = right;
            } else {
              // fallback: place just below
              tt = clamp(targetRect.bottom + margin, 12, window.innerHeight - EST_TOOLTIP_HEIGHT);
            }
          }
        }
      }
      tooltipStyle.left = tl;
      tooltipStyle.top = tt;
    } catch (e) { /* ignore overlap calc errors */ }
  } else {
    tooltipStyle.left = 24; tooltipStyle.top = 80;
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: ts.overlay, zIndex: 200000 }} aria-hidden />

      {/* highlight box */}
      {targetRect && (
        <div
          style={{
            position: 'fixed',
            left: targetRect.left - 8,
            top: targetRect.top - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            borderRadius: 10,
            zIndex: 200060,
            pointerEvents: 'none',
            transition: 'left 300ms ease, top 300ms ease, width 300ms ease, height 300ms ease, box-shadow 220ms ease',
            // stronger highlight so the target stands out above the overlay & tooltip
            boxShadow: theme === 'glass' ? '0 20px 48px rgba(2,6,23,0.45)' : '0 0 0 4px rgba(255,255,255,0.9), 0 8px 36px rgba(2,6,23,0.6)',
            border: theme === 'glass' ? '2px solid rgba(255,255,255,0.6)' : '3px solid rgba(255,255,255,0.95)',
            background: 'transparent'
          }}
        />
      )}

      <div
        style={{
          ...tooltipStyle,
          background: ts.panelBg,
          color: ts.fg,
          padding: 18,
          borderRadius: 12,
          transform: 'translateY(-6px)',
          opacity: 0,
          animation: 'ot-fade-slide 260ms ease forwards',
          ...(theme === 'glass' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)' } : {}),
        }}
        data-tour-tooltip="1"
      >
        <style>{`@keyframes ot-fade-slide { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{step.title}</div>
            <div style={{ fontSize: 13, marginTop: 6, color: ts.fg }}>{step.description}</div>
          </div>
          <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 700 }}>{`${index + 1}/${steps.length}`}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <button onClick={() => { setVisible(false); onClose && onClose(); }} aria-label="Skip tour" style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: ts.fg, fontSize: 13 }}>Skip</button>
          <button onClick={() => { prev(); }} aria-label="Previous step" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', background: 'transparent', color: ts.fg }}>Back</button>
          {index < steps.length - 1 ? (
            <button onClick={() => next()} aria-label="Next step" style={{ padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#2563eb', color: '#fff' }}>Next</button>
          ) : (
            <button onClick={() => { next(); }} aria-label="Finish tour" style={{ padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#10b981', color: '#fff' }}>Done</button>
          )}
        </div>
      </div>
    </>
  );
};

export default OnboardingTour;
