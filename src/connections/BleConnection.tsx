'use client'

import { useState, useRef, useEffect } from 'react'

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
  
  // Refs for functionality
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sampleIndex = useRef(0)
  const totalSamples = useRef(0)

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
    if (value.byteLength === NEW_PACKET_LEN) {
      const newRawValues: {ch0: number, ch1: number, ch2: number}[] = []
      
      for (let i = 0; i < NEW_PACKET_LEN; i += SINGLE_SAMPLE_LEN) {
        const view = new DataView(value.buffer.slice(i, i + SINGLE_SAMPLE_LEN))
        
        // Extract all 3 channels from BLE packet
        // BLE packet structure (7 bytes per sample):
        // [0] = Counter/Status
        // [1][2] = Channel 0 (16-bit)
        // [3][4] = Channel 1 (16-bit) 
        // [5][6] = Channel 2 (16-bit)
        
        const ch0 = view.getInt16(1, false) // Channel 0 at offset 1
        const ch1 = view.getInt16(3, false) // Channel 1 at offset 3
        const ch2 = view.getInt16(5, false) // Channel 2 at offset 5
        
        console.log(`BLE Sample: CH0=${ch0}, CH1=${ch1}, CH2=${ch2}`)
        
        // Add all 3 channels to raw data display
        newRawValues.push({
          ch0: ch0,
          ch1: ch1,
          ch2: ch2
        })

        sampleIndex.current = (sampleIndex.current + 1) % 1000
        totalSamples.current += 1
      }

      // Update raw data display
      setRawData(prev => [...prev, ...newRawValues])

      // Update received data log
      const timestamp = new Date().toLocaleTimeString()
      setReceivedData(prev => {
        const newEntry = `${timestamp}: Packet received (${newRawValues.length} samples) - Total: ${totalSamples.current}`
        return [...prev, newEntry]
      })
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

      console.log('Connected to:', selectedDevice.name)
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
      
      {device && (
        <div className="text-center mb-4">
          <p className="text-green-600">Connected to: {device.name || 'NPG-BLE Device'}</p>
          <p className="text-sm text-gray-600">Sample Rate: {SAMPLE_RATE}Hz | Total Samples: {totalSamples.current}</p>
        </div>
      )}


      {rawData.length > 0 && (
        <div className="w-full max-w-2xl">
          <h3 className="text-lg font-semibold mb-2">
            All Channel Data ({rawData.length} samples) - Latest at bottom ↓
          </h3>
          <div 
            ref={scrollContainerRef}
            className="bg-blue-50 p-4 rounded-lg h-80 overflow-y-auto border"
            style={{ 
              scrollBehavior: 'auto',
              display: 'flex',
              flexDirection: 'column-reverse' // This makes latest items appear at bottom visually
            }}
          >
            <div className="text-xs font-mono">
              {rawData.map((sample, index) => (
                <div key={index} className="mb-1 hover:bg-blue-100 px-2 py-1 rounded">
                  <span className="font-semibold">Sample {index + 1}:</span> 
                  <span className="text-red-600 ml-2">CH0: {sample.ch0}</span>
                  <span className="text-green-600 ml-2">CH1: {sample.ch1}</span>
                  <span className="text-blue-600 ml-2">CH2: {sample.ch2}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-1 text-center">
            Auto-scroll (keeps latest at bottom) - CH0: Red, CH1: Green, CH2: Blue
          </div>
        </div>
      )}
    </div>
  )
}