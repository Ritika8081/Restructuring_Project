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
  const { addSample } = useChannelData();
  
  // Refs for functionality
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
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

        // Forward to channel context and local displays
        addSample({ ch0, ch1, ch2, timestamp: Date.now() });
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
        const view = new DataView(value.buffer.slice(i, i + SINGLE_SAMPLE_LEN))
        const parsed = processView(view)
        if (parsed) newRawValues.push({ ch0: parsed.ch0, ch1: parsed.ch1, ch2: parsed.ch2, counter: parsed.counter })
      }
    } else if (len === SINGLE_SAMPLE_LEN) {
      const view = new DataView(value.buffer.slice(0, SINGLE_SAMPLE_LEN))
      const parsed = processView(view)
      if (parsed) newRawValues.push({ ch0: parsed.ch0, ch1: parsed.ch1, ch2: parsed.ch2, counter: parsed.counter })
    } else {
      console.warn(`Unexpected BLE packet length: ${len}`)
    }

    if (newRawValues.length > 0) {
      // Update raw data display
      setRawData(prev => [...prev, ...newRawValues.map(v => ({ ch0: v.ch0, ch1: v.ch1, ch2: v.ch2 }))])

      // Update received data log (brief entry)
      const timestamp = new Date().toLocaleTimeString()
      setReceivedData(prev => {
        const newEntry = `${timestamp}: Packet parsed (${newRawValues.length} samples) - Total: ${totalSamples.current}`
        return [...prev, newEntry]
      })

      // Optionally log per-packet counters for debugging (less noisy)
      if (newRawValues.length > 0) {
        try {
          // Log every parsed sample in this packet so you can see the
          // counter and channel values for each sample (verbose).
          const lines = newRawValues.map(v => `cnt=${v.counter} CH0=${v.ch0} CH1=${v.ch1} CH2=${v.ch2}`)
          // console.log(`BLE packet samples (${newRawValues.length}):\n` + lines.join('\n'))
        } catch (err) {
          // ignore logging errors
        }
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
      setIsConnected(true)

      const server = await selectedDevice.gatt?.connect()
      const service = await server?.getPrimaryService(SERVICE_UUID)
      const controlChar = await service?.getCharacteristic(CONTROL_CHAR_UUID)
      const dataChar = await service?.getCharacteristic(DATA_CHAR_UUID)

      // Send commands automatically
      setTimeout(async () => {
        await controlChar?.writeValue(new TextEncoder().encode("START"))
      }, 500)

      // Start notifications
      await dataChar?.startNotifications()
      dataChar?.addEventListener("characteristicvaluechanged", handleDataReceived)

      setReceivedData(['Connected! Starting data collection...'])

    } catch (error) {
      console.error('BLE connection failed:', error)
    }
  }

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