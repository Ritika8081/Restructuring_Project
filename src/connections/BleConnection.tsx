'use client'

/**
 * src/connections/BleConnection.tsx
 *
 * Purpose: React component to manage a Web Bluetooth connection to the
 * NPG device. Parses incoming binary packets, extracts channel samples,
 * and forwards samples into the ChannelData context via `addSample`.
 *
 * Exports: default React component BleConnection
 */
import { useState, useRef, useEffect } from 'react'
import { useChannelData } from '@/lib/channelDataContext';

// Extend the Navigator interface to include bluetooth
declare global {
  interface Navigator {
    bluetooth: any;
  }
}

// Add a type declaration for BluetoothDevice if not available
type BluetoothDevice = {
  id: string;
  name?: string;
  gatt?: any;
  // Add other properties as needed
};

export default function BleConnection() {
  const [isConnected, setIsConnected] = useState(false)
  const [device, setDevice] = useState<BluetoothDevice | null>(null)
  const [receivedData, setReceivedData] = useState<string[]>([])
  const [rawData, setRawData] = useState<{ch0: number, ch1: number, ch2: number}[]>([])
  const channelData = useChannelData();
  // Prefer using the provider-exposed ref when available — this avoids
  // creating local effects in each connection component.
  const providerAddSampleRef = channelData.addSampleRef;
  // Keep refs for device and characteristic so we can cleanly disconnect
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const dataCharRef = useRef<any>(null);
  const controlCharRef = useRef<any>(null);
  const unregisterDisconnectRef = useRef<(() => void) | null>(null);
  
  // Refs for functionality
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Buffer parsed samples to avoid updating React state on every notification.
  const rawBufferRef = useRef<{ch0: number, ch1: number, ch2: number, counter?: number}[]>([])
  const flushBufferTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastPacketOkRef = useRef<number>(0)
  const lastPacketVerboseRef = useRef<number>(0)
  const sampleIndex = useRef(0)
  const totalSamples = useRef(0)
  // Track sample counters for drop-detection and ordering
  const prevSampleCounter = useRef<number | null>(null)
  const samplesReceived = useRef(0)

  // Device constants
  const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
  const DATA_CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"
  const CONTROL_CHAR_UUID = "0000ff01-0000-1000-8000-00805f9b34fb"
  const SAMPLE_RATE = 500
  const SINGLE_SAMPLE_LEN = 7
  const NEW_PACKET_LEN = 7 * 10
  const NUM_CHANNELS = 3 // BLE has 3 channels

  // Optimized auto-scroll with debouncing - keeps scrollbar at bottom
  useEffect(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      if (scrollContainerRef.current) {
        // Force scroll to bottom immediately
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
      }
    }, 10) // Reduced delay for faster scrolling

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [rawData.length])

  // Scroll to bottom when component first renders data
  useEffect(() => {
    if (rawData.length > 0 && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [rawData.length > 0])

  const handleDataReceived = (event: any) => {
    const value = event.target.value
    const len = value?.byteLength || 0

    const processView = (view: DataView) => {
      try {
        const counter = view.getUint8(0)
        const ch0 = view.getInt16(1, false)
        const ch1 = view.getInt16(3, false)
        const ch2 = view.getInt16(5, false)

        // Detect unusually large jumps in the 8-bit counter (wrap-aware).
        // Note: the device often sends multi-sample packets (e.g. 10 samples),
        // so a counter jump equal to the packet size is expected between
        // packets. We only warn on large unexpected jumps.
        if (prevSampleCounter.current !== null) {
          const diff = (counter - prevSampleCounter.current + 256) % 256
          if (diff > 50) {
            console.warn(`BLE large packet counter jump: prev=${prevSampleCounter.current} now=${counter} (+${diff})`)
          }
        }
        prevSampleCounter.current = counter

  // Bookkeeping
  samplesReceived.current += 1
  sampleIndex.current = (sampleIndex.current + 1) % 1000
  totalSamples.current += 1

        // Forward to channel context and local displays (include counter)
  try {
    const dispatchSample = providerAddSampleRef?.current ?? channelData.addSample;
    dispatchSample && dispatchSample({ ch0, ch1, ch2, timestamp: Date.now(), counter });
  } catch (err) {
    // defensive: don't let provider errors break parsing loop
    console.error('addSample error', err);
  }
  return { ch0, ch1, ch2, counter }
      } catch (err) {
        console.error('Error parsing BLE DataView', err)
        return null
      }
    }

    const newRawValues: {ch0: number, ch1: number, ch2: number, counter?: number}[] = []

    if (len === NEW_PACKET_LEN || (len % SINGLE_SAMPLE_LEN) === 0) {
      // Parse as one or more full samples
      for (let i = 0; i < len; i += SINGLE_SAMPLE_LEN) {
        // Use the DataView's byteOffset to avoid misalignment when the
        // underlying ArrayBuffer is shared or when the DataView does not
        // start at offset 0.
        const view = new DataView(value.buffer, (value.byteOffset || 0) + i, SINGLE_SAMPLE_LEN)
        const parsed = processView(view)
        if (parsed) newRawValues.push({ ch0: parsed.ch0, ch1: parsed.ch1, ch2: parsed.ch2, counter: parsed.counter })
      }
    } else if (len === SINGLE_SAMPLE_LEN) {
      const view = new DataView(value.buffer, value.byteOffset || 0, SINGLE_SAMPLE_LEN)
      const parsed = processView(view)
      if (parsed) newRawValues.push({ ch0: parsed.ch0, ch1: parsed.ch1, ch2: parsed.ch2, counter: parsed.counter })
    } else {
      console.warn(`Unexpected BLE packet length: ${len}`)
    }

    if (newRawValues.length > 0) {
      // Rate-limited verbose dump of parsed packet contents (useful for debugging)
      try {
        const now = Date.now()
        if (now - lastPacketVerboseRef.current > 1000) { // at most once per second
          lastPacketVerboseRef.current = now
          // Print a concise sample of the packet: counter and channel values
          const samplePreview = newRawValues.slice(0, 8).map(v => ({ cnt: v.counter, ch0: v.ch0, ch1: v.ch1, ch2: v.ch2 }))
        }
      } catch (err) {}
      // Buffer parsed samples and flush to React state at a lower rate to
      // avoid render storms when notifications arrive rapidly.
      rawBufferRef.current.push(...newRawValues)

      // Schedule a flush (coalesced) if not already scheduled.
      if (flushBufferTimeoutRef.current == null) {
        flushBufferTimeoutRef.current = setTimeout(() => {
          try {
            const buf = rawBufferRef.current.splice(0)
            if (buf.length > 0) {
              // Update raw data display (trim older entries)
              setRawData(prev => {
                const merged = [...prev, ...buf.map(v => ({ ch0: v.ch0, ch1: v.ch1, ch2: v.ch2 }))]
                return merged.slice(-1000)
              })

              // Update received data log with a brief summary
              const timestamp = new Date().toLocaleTimeString()
              setReceivedData(prev => {
                const newEntry = `${timestamp}: Packet parsed (buffered ${buf.length} samples) - Total: ${totalSamples.current}`
                return [...prev, newEntry].slice(-200)
              })
            }
          } finally {
            if (flushBufferTimeoutRef.current) {
              clearTimeout(flushBufferTimeoutRef.current)
              flushBufferTimeoutRef.current = null
            }
          }
        }, 200)
      }

      // Per-packet counter diagnostics: compute counters array and check
      // whether counters inside the packet are sequential. This helps
      // detect whether counter jumps are due to lost packets or parsing
      // misalignment.
      try {
        const counters = newRawValues.map(v => (v.counter === undefined ? null : v.counter as number))
        const first = counters[0]
        const last = counters[counters.length - 1]
        if (first !== null && last !== null) {
          // Log a concise packet summary when packet contains multiple samples
            if (counters.length > 1) {
            // Check sequentiality within the packet
            const nonSeq: number[] = []
            for (let i = 1; i < counters.length; i++) {
              const prev = counters[i - 1] as number
              const cur = counters[i] as number
              const d = (cur - prev + 256) % 256
              if (d !== 1) nonSeq.push(i)
            }
              if (nonSeq.length > 0) {
                console.warn(`BLE packet counter non-sequential at indices: ${nonSeq.join(', ')}; packetCnts=[${counters.join(',')}]`)
              } else {
                // Rate-limit positive packet confirmation to reduce noise
                const now = Date.now()
                if (now - lastPacketOkRef.current > 5000) {
                  console.info(`BLE packet parsed OK: samples=${counters.length} first=${first} last=${last}`)
                  lastPacketOkRef.current = now
                } else {
                  console.debug(`BLE packet parsed: samples=${counters.length} first=${first} last=${last}`)
                }
              }
          } else {
            // Single-sample packet — lightweight debug
            const now = Date.now()
            if (now - lastPacketOkRef.current > 5000) {
              console.info(`BLE single sample cnt=${first}`)
              lastPacketOkRef.current = now
            } else {
              console.debug(`BLE single sample cnt=${first}`)
            }
          }
        }
      } catch (err) {
        // ignore logging/diagnostic errors
      }
    }
  }

  const connect = async () => {
    try {
      if (!('bluetooth' in navigator)) {
        alert("Web Bluetooth API is not supported in this browser.")
        return
      }

      const selectedDevice = await (navigator as any).bluetooth.requestDevice({
        filters: [{ namePrefix: "NPG" }],
        optionalServices: [SERVICE_UUID]
      })

  setDevice(selectedDevice)
  deviceRef.current = selectedDevice
      setIsConnected(true)
  // Inform provider of the device sampling rate so filter modal can auto-populate
  try { channelData.setSamplingRate && channelData.setSamplingRate(SAMPLE_RATE); } catch (e) {}

      const server = await selectedDevice.gatt?.connect()
      const service = await server?.getPrimaryService(SERVICE_UUID)
  const controlChar = await service?.getCharacteristic(CONTROL_CHAR_UUID)
  const dataChar = await service?.getCharacteristic(DATA_CHAR_UUID)
  controlCharRef.current = controlChar
  dataCharRef.current = dataChar

      // Send commands automatically
      setTimeout(async () => {
        await controlChar?.writeValue(new TextEncoder().encode("START"))
      }, 500)

      // Start notifications
  await dataChar?.startNotifications()
  dataChar?.addEventListener("characteristicvaluechanged", handleDataReceived)

      setReceivedData(['Connected! Starting data collection...'])

      // Register disconnect handler in provider so page-level disconnects work
      try {
        if (channelData && typeof channelData.registerConnectionDisconnect === 'function') {
          unregisterDisconnectRef.current = channelData.registerConnectionDisconnect(doDisconnect);
          console.info('[BLE] registered disconnect handler in context');
        }
      } catch (e) {}

    } catch (error) {
      console.error('BLE connection failed:', error)
    }
  }

  // Graceful disconnect handler invoked by global event
  const doDisconnect = async () => {
    console.info('[BLE][doDisconnect] start');
    try {
      try {
        if (dataCharRef.current) {
          console.info('[BLE][doDisconnect] stopping notifications');
          try { await dataCharRef.current.stopNotifications(); } catch (e) { console.warn('[BLE] stopNotifications error', e); }
          try { dataCharRef.current.removeEventListener('characteristicvaluechanged', handleDataReceived); } catch (e) { console.warn('[BLE] removeEventListener error', e); }
          dataCharRef.current = null;
        }
      } catch (e) { console.warn('[BLE] dataChar cleanup error', e); }

      try {
        if (deviceRef.current && deviceRef.current.gatt && deviceRef.current.gatt.connected) {
          console.info('[BLE][doDisconnect] disconnecting gatt');
          try { deviceRef.current.gatt.disconnect(); } catch (e) { console.warn('[BLE] gatt.disconnect error', e); }
        }
      } catch (e) { console.warn('[BLE] deviceRef disconnect error', e); }

      try { setIsConnected(false); } catch (e) {}
      try { setReceivedData(prev => [...prev, 'Disconnected']); } catch (e) {}
      try { channelData.clearSamples && channelData.clearSamples(); } catch (e) { console.warn('[BLE] clearSamples error', e); }
      console.info('[BLE][doDisconnect] done');
      try { if (unregisterDisconnectRef.current) { unregisterDisconnectRef.current(); unregisterDisconnectRef.current = null; } } catch (e) {}
    } catch (err) {
      console.error('Error during BLE disconnect', err);
    }
  }

  // Listen for global disconnect events
  useEffect(() => {
    const handler = () => { try { console.info('[BLE] received app:disconnect'); } catch (e) {} ; doDisconnect(); };
    try { window.addEventListener('app:disconnect', handler as EventListener); } catch (e) {}
    return () => {
      try { window.removeEventListener('app:disconnect', handler as EventListener); } catch (e) {}
      // Note: we intentionally do not automatically unregister the provider-level
      // disconnect handler here because it is registered only when a connection
      // is active (in `connect()`) and unregistered by `doDisconnect()` once
      // the connection is torn down. This avoids removing the handler when the
      // UI (modal) unmounts while the device remains connected.
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={connect}
        disabled={isConnected}
        className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
      >
        {isConnected ? 'Connected' : 'Connect to NPG Device'}
      </button>
     
    </div>
  )
}