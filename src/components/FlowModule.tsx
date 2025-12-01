'use client';

import React, { useState, useRef } from 'react';
import { useChannelData } from '@/lib/channelDataContext';
import ConnectionDataWidget from '@/components/ConnectionDataWidget';
import { Widget, GridSettings } from '@/types/widget.types';

type ToastType = 'success' | 'error' | 'info';
type Props = {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  playFlow?: () => void;
  showToast?: (message: string, type?: ToastType) => void;
  onSaveLayout?: () => void;
  onLoadLayout?: (newWidgets: Widget[] | any, newGridSettings?: GridSettings) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  flowScale?: number;
  // Optional flowchart presets selector
  flowPresets?: Array<{ id: string; name: string; flowOptions?: any; modalPositions?: Record<string, any>; connections?: Array<{from:string,to:string}>; gridSettings?: GridSettings; channelCount?: number }>;
  selectedFlowPresetId?: string | null;
  onSelectFlowPreset?: (id: string) => void;
  onSaveFlowPreset?: () => void;
  connActive?: boolean;
  setConnActive?: (b: boolean) => void;
  connConnecting?: boolean;
  setConnConnecting?: (b: boolean) => void;
  showConnectionModal?: boolean;
  setShowConnectionModal?: (b: boolean) => void;
};

const ACTION_COLORS: Record<string, { bg: string; text: string; shadow: string }> = {
  primary: { bg: '#0ea5a4', text: '#ffffff', shadow: '0 8px 24px rgba(14,165,164,0.12)' },
  success: { bg: '#7c3aed', text: '#ffffff', shadow: '0 8px 24px rgba(124,58,237,0.12)' },
  green: { bg: '#4cc668ff', text: '#083344', shadow: '0 8px 24px rgba(6,182,212,0.10)' },
  accent: { bg: '#f59e0b', text: '#08131a', shadow: '0 8px 24px rgba(245,158,11,0.10)' },
  neutral: { bg: '#0f172a', text: '#ffffff', shadow: '0 8px 24px rgba(15,23,42,0.06)' },
  ghost: { bg: '#f8fafc', text: '#0f172a', shadow: 'none' },
};

export default function FlowModule(props: Props) {
  const {
    children,
    className,
    style,
    id,
    playFlow,
    showToast,
    connActive,
    setConnActive,
    connConnecting,
    setConnConnecting,
    showConnectionModal,
    setShowConnectionModal,
  } = props;

  const channelData = useChannelData();

  const [internalConnActive, setInternalConnActive] = useState(false);
  const connActiveVal = typeof connActive === 'boolean' ? connActive : internalConnActive;
  const setConnActiveFn = setConnActive || setInternalConnActive;

  const [internalShowConnectionModal, setInternalShowConnectionModal] = useState(false);
  const showConnectionModalVal = typeof showConnectionModal === 'boolean' ? showConnectionModal : internalShowConnectionModal;
  const setShowConnectionModalFn = setShowConnectionModal || setInternalShowConnectionModal;

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const toast = showToast || (() => {});

  const { onSaveLayout, onLoadLayout, onZoomIn, onZoomOut, flowScale: flowScaleProp } = props;

  const callOrDispatch = (eventName: string, cb?: () => void) => {
    try {
      if (typeof cb === 'function') { try { cb(); } catch (e) { } }
      else { try { window.dispatchEvent(new CustomEvent(eventName)); } catch (e) { } }
    } catch (e) { }
  };
 

  const handleSaveClick = () => {
    try {
      if (typeof onSaveLayout === 'function') {
        try { onSaveLayout(); } catch (e) { }
      } else {
        try { window.dispatchEvent(new CustomEvent('flow:save-layout')); } catch (e) { }
      }
    } catch (e) { }
    try { setMoreOpen(false); } catch (e) { }
  };

  const handleLoadClick = () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = async () => {
        try {
          const f = input.files && input.files[0];
          if (!f) {
            try { toast('No file selected', 'info'); } catch (e) { }
            return;
          }
          const text = await f.text();
          let parsed: any = null;
          try { parsed = JSON.parse(text); } catch (err) {
            try { toast('Failed to parse JSON file', 'error'); } catch (e) { }
            return;
          }

          // Determine widget array + optional grid settings (tolerant to various export shapes)
          let widgetsToPass: any = null;
          let gridToPass: any = undefined;

          const tryExtract = (obj: any) => {
            if (!obj) return null;
            if (Array.isArray(obj)) return obj;
            if (Array.isArray(obj.widgets)) return obj.widgets;
            if (Array.isArray(obj.layout && obj.layout.widgets)) return obj.layout.widgets;
            if (Array.isArray(obj.data && obj.data.widgets)) return obj.data.widgets;
            if (obj.widgets && typeof obj.widgets === 'object' && !Array.isArray(obj.widgets)) return Object.values(obj.widgets);
            if (obj.widgetsById && typeof obj.widgetsById === 'object') return Object.values(obj.widgetsById);
            if (Array.isArray(obj.nodes)) return obj.nodes;
            if (Array.isArray(obj.elements)) return obj.elements;
            // fallback: search first array-of-objects found on the top-level
            for (const k of Object.keys(obj)) {
              if (Array.isArray(obj[k]) && obj[k].length > 0 && typeof obj[k][0] === 'object') return obj[k];
            }
            return null;
          };

          widgetsToPass = tryExtract(parsed);
          if (!widgetsToPass && Array.isArray(parsed)) widgetsToPass = parsed;
          if (!widgetsToPass && parsed && parsed.widgets) {
            widgetsToPass = Array.isArray(parsed.widgets) ? parsed.widgets : Object.values(parsed.widgets);
          }
          if (parsed && parsed.gridSettings) gridToPass = parsed.gridSettings;

          if (widgetsToPass && widgetsToPass.length > 0) {
            // Normalize widgets: ensure required fields exist
            const normalized = (widgetsToPass || []).map((w: any, idx: number) => {
              const id = w.id || w.key || w._id || `imported-${idx}`;
              const x = Number.isFinite(w.x) ? w.x : (Number.isFinite(w.left) ? Math.floor(w.left) : 0);
              const y = Number.isFinite(w.y) ? w.y : (Number.isFinite(w.top) ? Math.floor(w.top) : 0);
              const width = Number.isFinite(w.width) ? w.width : (Number.isFinite(w.w) ? w.w : Math.max(1, Math.floor(w.width || 1)));
              const height = Number.isFinite(w.height) ? w.height : (Number.isFinite(w.h) ? w.h : Math.max(1, Math.floor(w.height || 1)));
              const minWidth = Number.isFinite(w.minWidth) ? w.minWidth : 1;
              const minHeight = Number.isFinite(w.minHeight) ? w.minHeight : 1;
              const type = w.type || w.widgetType || 'basic';
              return { ...w, id, x, y, width, height, minWidth, minHeight, type } as any;
            });

            if (typeof onLoadLayout === 'function') {
              try {
                try { console.debug('[FlowModule] calling onLoadLayout', { count: normalized.length, sample: normalized.slice(0,3) }); } catch (e) { }
                onLoadLayout(normalized, gridToPass);
                try { toast(`Layout loaded with ${normalized.length} widgets`, 'success'); } catch (e) { }
                try { setMoreOpen(false); } catch (e) { }
              } catch (e) {
                try { console.error('[FlowModule] onLoadLayout threw', e); } catch (er) { }
                try { toast('Failed to apply layout', 'error'); } catch (err) { }
              }
            } else {
              // no prop handler, dispatch event for legacy listeners
              try { console.debug('[FlowModule] dispatching flow:load-layout event', { count: normalized.length }); } catch (e) { }
              try { window.dispatchEvent(new CustomEvent('flow:load-layout', { detail: { widgets: normalized, gridSettings: gridToPass } })); } catch (e) { }
              try { toast('Layout loaded (event dispatched)', 'success'); } catch (e) { }
              try { setMoreOpen(false); } catch (e) { }
            }
          } else if (parsed && (Array.isArray(parsed.flowOptions) || parsed.modalPositions || Array.isArray(parsed.connections))) {
            // Parsed payload contains flow-specific fields (flowOptions/modalPositions/connections)
            if (typeof onLoadLayout === 'function') {
              try {
                try { console.debug('[FlowModule] calling onLoadLayout with full payload', { flowOptions: parsed.flowOptions ? parsed.flowOptions.length : 0 }); } catch (e) { }
                onLoadLayout(parsed, gridToPass);
                try { toast('Layout loaded', 'success'); } catch (e) { }
                try { setMoreOpen(false); } catch (e) { }
              } catch (e) {
                try { console.error('[FlowModule] onLoadLayout threw', e); } catch (er) { }
                try { toast('Failed to apply layout', 'error'); } catch (err) { }
              }
            } else {
              try { console.debug('[FlowModule] dispatching flow:load-layout event (payload)'); } catch (e) { }
              try { window.dispatchEvent(new CustomEvent('flow:load-layout', { detail: parsed })); } catch (e) { }
              try { toast('Layout loaded (event dispatched)', 'success'); } catch (e) { }
              try { setMoreOpen(false); } catch (e) { }
            }
          } else {
            try { toast('Invalid layout file: expected widget array or { widgets, gridSettings }', 'error'); } catch (e) { }
          }
        } catch (err) { }
      };
      input.click();
    } catch (e) { }
  };

  const handleConnectClick = () => {
    try {
      if (!connActiveVal) {
        try { if (typeof setConnConnecting === 'function') setConnConnecting(true); } catch (e) { }
        // If an onboarding demo is running, it may show its own visual overlay.
        // Honor a global flag so the real connection modal is not opened twice.
        try {
          if (typeof window !== 'undefined' && (window as any).__DEMO_SUPPRESS_CONN_MODAL) {
            return;
          }
        } catch (e) { }
        setShowConnectionModalFn(true);
        return;
      }

      if (channelData && typeof (channelData as any).disconnectActiveConnections === 'function') {
        try { (channelData as any).disconnectActiveConnections(); } catch (e) { }
      }

      try {
        const current = (window as any).__app_connection_disconnect_current;
        const handlers = (window as any).__app_connection_disconnect_handlers as Array<() => void> | undefined;
        if (typeof current === 'function') try { current(); } catch (e) { }
        if (Array.isArray(handlers)) handlers.slice().forEach(h => { try { h(); } catch (e) { } });
      } catch (e) { }

      try { window.dispatchEvent(new CustomEvent('app:disconnect', { detail: { source: 'flow-widget' } })); } catch (e) { }
      setConnActiveFn(false);
      try { if (typeof setConnConnecting === 'function') setConnConnecting(false); } catch (e) { }
      try { toast('Disconnecting...', 'info'); } catch (e) { }
    } catch (err) { }
  };

  return (
    <div
      id={id || 'flow-module'}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px solid #b9bcc1ff', padding: 6, marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontWeight: 800, fontSize: 32, marginBottom: 4, paddingBottom: 8, lineHeight: 1.05, color: '#06b6d4', letterSpacing: 0.2 }}>
              Chords Playground
            </h1>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>Tips: drag → connect → Play</div>

            {/* Flowchart presets selector */}
            {Array.isArray(props.flowPresets) && props.flowPresets.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12 }}>
                <select
                  aria-label="Select flow preset"
                  value={props.selectedFlowPresetId || (props.flowPresets[0] && props.flowPresets[0].id) || ''}
                  onChange={(e) => { try { if (typeof props.onSelectFlowPreset === 'function') props.onSelectFlowPreset(e.target.value); } catch (err) {} }}
                  style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #e6eef8', background: '#fff' }}
                >
                  {props.flowPresets.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                <button
                  title="Save current as preset"
                  onClick={() => { try { if (typeof props.onSaveFlowPreset === 'function') props.onSaveFlowPreset(); } catch (e) {} }}
                  style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #eef2f7', background: '#f8fafc', cursor: 'pointer', fontSize: 12 }}
                >
                  Save Preset
                </button>
              </div>
            )}

            {connConnecting ? (
              <button
                data-tour="connect-button"
                title="Connecting"
                onClick={handleConnectClick}
                style={{ background: ACTION_COLORS.green.bg, color: ACTION_COLORS.green.text, padding: '8px 12px', borderRadius: 10, fontWeight: 700, border: 'none', cursor: 'default', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: 'none', marginRight: 6 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: 'flowmodule-spin 900ms linear infinite' }}>
                  <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.6)" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="40" strokeDashoffset="10" />
                </svg>
                <span>Connecting…</span>
                <style>{`@keyframes flowmodule-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
              </button>
            ) : (
              <button
                data-tour="connect-button"
                title={connActiveVal ? 'Disconnect' : 'Connect'}
                onClick={handleConnectClick}
                style={{ background: connActiveVal ? ACTION_COLORS.neutral.bg : ACTION_COLORS.green.bg, color: connActiveVal ? ACTION_COLORS.neutral.text : ACTION_COLORS.green.text, padding: '8px 12px', borderRadius: 10, fontWeight: 700, border: 'none', cursor: 'pointer', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: connActiveVal ? 'none' : ACTION_COLORS.green.shadow, marginRight: 6 }}
              >
                {connActiveVal ? 'Disconnect' : 'Connect'}
              </button>
            )}

            <button
              data-tour="play-button"
              style={{ background: ACTION_COLORS.green.bg, color: ACTION_COLORS.green.text, padding: '8px 14px', borderRadius: 10, fontWeight: 700, border: 'none', cursor: 'pointer', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: ACTION_COLORS.green.shadow }}
              onClick={() => { try { if (playFlow) playFlow(); } catch (e) { } }}
            >
              Play
            </button>

            <div style={{ position: 'relative', display: 'inline-block', marginLeft: 8 }} ref={moreRef}>
              <button
                title="More"
                aria-haspopup="true"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen(o => !o)}
                style={{ background: ACTION_COLORS.ghost.bg, color: ACTION_COLORS.ghost.text, padding: '8px 12px', borderRadius: 10, fontWeight: 700, border: `1px solid ${ACTION_COLORS.ghost.text}`, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 6v.01" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 12v.01" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 18v.01" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span style={{ fontSize: 13 }}>More</span>
              </button>

              {moreOpen && (
                <div role="menu" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Escape') setMoreOpen(false); }} style={{ position: 'absolute', right: 0, marginTop: 8, background: '#ffffff', borderRadius: 10, boxShadow: '0 12px 36px rgba(2,6,23,0.12)', padding: 8, zIndex: 100050, minWidth: 220 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #eef2f7', background: '#f3f3f6ff', cursor: 'pointer', fontWeight: 800, fontSize: 13 }} onClick={() => { try { setMoreOpen(false); } catch (e) { } }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: ACTION_COLORS.primary.bg, color: '#fff' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 3v5h5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </span>
                      <div style={{ textAlign: 'left', flex: 1 }}>
                        <div style={{ fontSize: 13 }}>Replay Tour</div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Show onboarding again</div>
                      </div>
                    </div>

                    <div aria-label="Zoom controls" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px' }}>
                      <button title="Zoom in" onClick={() => callOrDispatch('flow:zoom-in', onZoomIn)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #eef2f7', background: '#fff', cursor: 'pointer' }}>Zoom In</button>
                      <button title="Zoom out" onClick={() => callOrDispatch('flow:zoom-out', onZoomOut)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #eef2f7', background: '#fff', cursor: 'pointer' }}>Zoom Out</button>
                      <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{typeof flowScaleProp === 'number' ? `${Math.round((flowScaleProp || 1) * 100)}%` : ''}</div>
                    </div>

                    <div onClick={() => handleSaveClick()} data-tour="download-layout" style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: ACTION_COLORS.accent.bg, color: '#08131a' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 10l5-5 5 5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 5v14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </span>
                      <div style={{ textAlign: 'left', flex: 1 }}>
                        <div style={{ fontSize: 13 }}>Save Layout</div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Export your flow as JSON</div>
                      </div>
                    </div>

                    <div onClick={() => handleLoadClick()} data-tour="load-layout" style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: ACTION_COLORS.primary.bg, color: '#fff' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 3v5h5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </span>
                      <div style={{ textAlign: 'left', flex: 1 }}>
                        <div style={{ fontSize: 13 }}>Load Layout</div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Import a saved layout JSON</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showConnectionModalVal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 100002, pointerEvents: 'auto' }}>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(81, 75, 75, 0.39)',
              zIndex: 200002,
              pointerEvents: 'auto',
            }}
            onClick={() => setShowConnectionModalFn(false)}
          />

          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              borderRadius: 16,
              boxShadow: '0 12px 48px rgba(0,0,0,0.32)',
              border: '2px solid #2563eb',
              padding: 40,
              minWidth: 420,
              maxWidth: 520,
              background: 'rgba(248, 247, 247, 1)',
              zIndex: 200003,
              pointerEvents: 'auto',
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <button style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', fontSize: 22, color: '#2563eb', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); setShowConnectionModalFn(false); }}>
              &times;
            </button>
            <ConnectionDataWidget />
          </div>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
