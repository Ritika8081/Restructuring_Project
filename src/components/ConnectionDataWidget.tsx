/**
 * src/components/ConnectionDataWidget.tsx
 *
 * Minimal connection selector modal — compact UI with small buttons and
 * minimal text as requested.
 */
import React, { useState } from 'react';
import BleConnection from '@/connections/BleConnection';
import SerialConnection from '@/connections/SerialConnection';
import WifiConnection from '@/connections/WifiConnection';

const CONNECTION_TYPES = [
  { label: 'Serial', value: 'serial', short: 'USB' },
  { label: 'BLE', value: 'ble', short: 'BLE' },
  { label: 'WiFi', value: 'wifi', short: 'WiFi' },
];

export default function ConnectionDataWidget() {
  const [selected, setSelected] = useState<string>('serial');

  return (
    <div style={{ width: '100%', height: '100%', padding: 8, boxSizing: 'border-box', fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>

        {/* Left: very compact vertical selector */}
        <div style={{ width: 72, padding: 6, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          {CONNECTION_TYPES.map((t) => (
            <div key={t.value} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <button
                onClick={() => setSelected(t.value)}
                title={t.label}
                aria-pressed={selected === t.value}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 10,
                  border: selected === t.value ? '2px solid #2563eb' : '1px solid rgba(14,165,164,0.08)',
                  background: selected === t.value ? '#2563eb' : '#ffffff',
                  color: selected === t.value ? '#fff' : '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                {t.label.charAt(0)}
              </button>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{t.short}</div>
            </div>
          ))}
        </div>

        {/* Right: minimal content area */}
        <div style={{ flex: 1, minHeight: 160, padding: 10, borderRadius: 10, background: '#fff', border: '1px solid #eef2f7', boxShadow: '0 6px 18px rgba(2,6,23,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{CONNECTION_TYPES.find(c => c.value === selected)?.label}</div>
           
          </div>

          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{CONNECTION_TYPES.find(c => c.value === selected)?.short}</div>

          <div style={{ borderTop: '1px dashed rgba(238,242,247,1)', paddingTop: 8 }}>
            {selected === 'ble' && <BleConnection />}
            {selected === 'serial' && <SerialConnection />}
            {selected === 'wifi' && <WifiConnection />}
          </div>
        </div>
      </div>
    </div>
  );
}

