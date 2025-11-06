/**
 * src/components/ConnectionSelectorWidget.tsx
 *
 * Purpose: Small UI widget allowing the user to choose between available
 * connection types (Serial, BLE, WiFi) and trigger the connection flow.
 *
 * Exports: default ConnectionSelectorWidget
 */
import React, { useState } from 'react';

const CONNECTION_TYPES = [
  { label: 'Serial', value: 'serial' },
  { label: 'BLE', value: 'ble' },
  { label: 'WiFi', value: 'wifi' },
];

const ConnectionSelectorWidget: React.FC<{ onConnect?: (type: string) => void }> = ({ onConnect }) => {
  const [selected, setSelected] = useState<string>('serial');

  const handleConnect = () => {
    if (onConnect) {
      onConnect(selected);
    }
  };

  return (
    <div >
      <h3 >Select Connection</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CONNECTION_TYPES.map((type) => (
          <label key={type.value} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="radio"
              name="connectionType"
              value={type.value}
              checked={selected === type.value}
              onChange={() => setSelected(type.value)}
              style={{ marginRight: 8 }}
            />
            <span style={{ color: selected === type.value ? '#2563eb' : '#333', fontWeight: selected === type.value ? 'bold' : 'normal' }}>{type.label}</span>
          </label>
        ))}
      </div>
      <button
        style={{ marginTop: 18, background: '#2563eb', color: 'white', padding: '8px 16px', borderRadius: 6, border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
        onClick={handleConnect}
      >
        Connect
      </button>
      <div style={{ marginTop: 12, color: '#2563eb', fontWeight: 'bold' }}>
        Current: {CONNECTION_TYPES.find(t => t.value === selected)?.label}
      </div>
    </div>
  );
};

export default ConnectionSelectorWidget;
