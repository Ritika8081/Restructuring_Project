
import React, { useState } from 'react';
import BleConnection from '@/connections/BleConnection';
import SerialConnection from '@/connections/SerialConnection';
import WifiConnection from '@/connections/WifiConnection';

const CONNECTION_TYPES = [
  { label: 'Serial', value: 'serial' },
  { label: 'BLE', value: 'ble' },
  { label: 'WiFi', value: 'wifi' },
];

export default function ConnectionDataWidget() {
  const [selected, setSelected] = useState<string>('serial');

  return (
    <div style={{ width: '100%', height: '100%', padding: 8 }}>
      <div style={{ marginBottom: 16 }}>
        <h3>Select Connection Type</h3>
        <div style={{ display: 'flex', gap: 16 }}>
          {CONNECTION_TYPES.map((type) => (
            <button
              key={type.value}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: selected === type.value ? '2px solid #2563eb' : '1px solid #ccc',
                background: selected === type.value ? '#2563eb' : '#f3f4f6',
                color: selected === type.value ? 'white' : '#333',
                fontWeight: selected === type.value ? 'bold' : 'normal',
                cursor: 'pointer',
                outline: 'none',
              }}
              onClick={() => setSelected(type.value)}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        {selected === 'ble' && <BleConnection />}
        {selected === 'serial' && <SerialConnection />}
        {selected === 'wifi' && <WifiConnection />}
      </div>
    </div>
  );
}
