import React, { useEffect, useState, useCallback, useRef } from 'react';

type Step = {
  selector: string; // query selector for element to highlight
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  action?: 'drag-demo' | 'connect-demo';
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
  const [index, setIndex] = useState<number>(initial);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(open);

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
    if (s && s.action && typeof onAction === 'function') {
      // give visual highlight a moment to appear
      actionPendingRef.current = index;
      let cancelled = false;
      const run = async () => {
        try {
          const maybe = onAction(s.action, index);
          if (maybe && typeof (maybe as any).then === 'function') {
            await (maybe as Promise<void>);
            if (cancelled) return;
            // only auto-advance if the step hasn't changed and tour still visible
            if (visible && actionPendingRef.current === index) {
              setTimeout(() => {
                try {
                  setIndex(i => Math.min(i + 1, steps.length - 1));
                } catch (e) { }
              }, 240);
            }
          }
        } catch (e) { /* swallow */ }
      };
      const t = setTimeout(run, 420);
      return () => { cancelled = true; actionPendingRef.current = null; clearTimeout(t); };
    }
    return () => { actionPendingRef.current = null; };
  }, [index, visible, steps, onAction]);

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
