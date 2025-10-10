import { useState } from 'react';
import BleConnection from '@/connections/BleConnection';
import SerialConnection from '@/connections/SerialConnection';
import WifiConnection from '@/connections/WifiConnection';

export type ConnectionType = 'ble' | 'serial' | 'wifi';

export function useConnection(type: ConnectionType) {
  // Each connection component manages its own state, so we just render the right one
  switch (type) {
    case 'ble':
      return <BleConnection />;
    case 'serial':
      return <SerialConnection />;
    case 'wifi':
      return <WifiConnection />;
    default:
      return null;
  }
}

export default function ConnectionDataWidget({ type }: { type: ConnectionType }) {
  // Render both table and graph for the selected connection type
  // The connection components should internally show their data (table/graph)
  return (
    <div style={{ width: '100%', height: '100%', padding: 8 }}>
      {useConnection(type)}
    </div>
  );
}
