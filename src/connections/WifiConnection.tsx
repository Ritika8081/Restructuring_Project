'use client'

import { useState, useRef, useEffect } from 'react'

export default function WifiConnection() {
  const [isConnected, setIsConnected] = useState(false)
  const [device, setDevice] = useState<WebSocket | null>(null)
  const [receivedData, setReceivedData] = useState<string[]>([])
  const [rawData, setRawData] = useState<{ch0: number, ch1: number, ch2: number}[]>([])
  const [ipAddress, setIpAddress] = useState("192.168.4.1")
  
  // Refs for functionality
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sampleIndex = useRef(0)
  const totalSamples = useRef(0)
  const wsRef = useRef<WebSocket | null>(null)

  // Device constants
  const SAMPLE_RATE = 500
  const FPS = 25
  const TOTAL_BLOCKS = Math.floor(SAMPLE_RATE / FPS) // 20 blocks per packet
  const BLOCK_SIZE = 13 // From Python: blockSize = 13
  const WS_PORT = 81
  const NUM_CHANNELS = 3 // ESP32 has 3 ADC channels

  // Sampling rate commands from Python code
  const SR_COMMANDS = {
    250: 0x06,
    500: 0x05,
    1000: 0x04,
    2000: 0x03,
    4000: 0x02,
    8000: 0x01,
    16000: 0x00
  }

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

  const handleDataReceived = (event: MessageEvent) => {
    const timestamp = new Date().toLocaleTimeString()
    
    // Handle binary data (matching Python logic)
    if (event.data instanceof ArrayBuffer) {
      const buffer = new Uint8Array(event.data)
      
      setReceivedData(prev => [...prev, `${timestamp}: Packet received (${buffer.length} bytes) - Total: ${totalSamples.current}`])
      
      if (buffer.length > 0) {
        const newRawValues: {ch0: number, ch1: number, ch2: number}[] = []
        
        // Parse each 13-byte block exactly like Python code
        for (let blockLocation = 0; blockLocation < buffer.length; blockLocation += BLOCK_SIZE) {
          if (blockLocation + BLOCK_SIZE <= buffer.length) {
            const block = buffer.slice(blockLocation, blockLocation + BLOCK_SIZE)
            
            const counter = block[0] // Counter byte
            
            // Extract 3 ADC channels from ESP32 (adc_pins[] = {0, 1, 2})
            // Each channel is 2 bytes (big-endian)
            const ch0 = (block[1] << 8) | block[2]  // Channel 0 (bytes 1-2)
            const ch1 = (block[3] << 8) | block[4]  // Channel 1 (bytes 3-4)  
            const ch2 = (block[5] << 8) | block[6]  // Channel 2 (bytes 5-6)
            
            
            // Add all 3 channels to raw data display
            newRawValues.push({
              ch0: ch0,
              ch1: ch1,
              ch2: ch2
            })
            
            sampleIndex.current = (sampleIndex.current + 1) % 1000
            totalSamples.current += 1
          }
        }

        // Update raw data display
        if (newRawValues.length > 0) {
          setRawData(prev => [...prev, ...newRawValues])
        }
      }
    } 
    // Handle Blob data
    else if (event.data instanceof Blob) {
      setReceivedData(prev => [...prev, `${timestamp}: Blob received (${event.data.size} bytes)`])
      
      // Convert Blob to ArrayBuffer and process
      event.data.arrayBuffer().then(arrayBuffer => {
        const buffer = new Uint8Array(arrayBuffer)
        
        if (buffer.length > 0) {
          const newRawValues: {ch0: number, ch1: number, ch2: number}[] = []
          
          for (let blockLocation = 0; blockLocation < buffer.length; blockLocation += BLOCK_SIZE) {
            if (blockLocation + BLOCK_SIZE <= buffer.length) {
              const block = buffer.slice(blockLocation, blockLocation + BLOCK_SIZE)
              
              const counter = block[0]
              
              // Extract 3 ADC channels
              const ch0 = (block[1] << 8) | block[2]
              const ch1 = (block[3] << 8) | block[4]
              const ch2 = (block[5] << 8) | block[6]
              
              newRawValues.push({
                ch0: ch0,
                ch1: ch1,
                ch2: ch2
              })
              
              sampleIndex.current = (sampleIndex.current + 1) % 1000
              totalSamples.current += 1
            }
          }

          if (newRawValues.length > 0) {
            setRawData(prev => [...prev, ...newRawValues])
          }
        }
      })
    }
    // Handle text data
    else if (typeof event.data === 'string') {
    
      setReceivedData(prev => [...prev, `${timestamp}: Response: ${event.data.trim()}`])
    }
  }

  const sendCommand = async (command: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (command === "START") {
        // Send sampling rate first, then trigger
        const srByte = SR_COMMANDS[500 as keyof typeof SR_COMMANDS] << 1
        const finalCommand = 0x80 | srByte | 1 // 500Hz, FPS=1
        
        const commandByte = new Uint8Array([finalCommand])
        wsRef.current.send(commandByte)
        
        
        // Then send start trigger
        setTimeout(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const triggerByte = new Uint8Array([0x01])
            wsRef.current.send(triggerByte)
           
          }
        }, 100)
      }
      
      const timestamp = new Date().toLocaleTimeString()
      setReceivedData(prev => [...prev, `${timestamp}: Sent command: ${command}`])
    }
  }

  const connect = async () => {
    try {
      const timestamp = new Date().toLocaleTimeString()
      setReceivedData([`${timestamp}: Connecting to ${ipAddress}:${WS_PORT}...`])
      
      const wsUrl = `ws://${ipAddress}:${WS_PORT}/`
      
      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer' // Important: ensure ArrayBuffer format
      wsRef.current = ws
      
      ws.onopen = () => {
        setDevice(ws)
        setIsConnected(true)
        setReceivedData(['Connected! Starting data collection...'])
        
        // Send commands automatically like BLE/Serial
        setTimeout(async () => {
          await sendCommand("START")
        }, 500)
      }

      ws.onmessage = handleDataReceived

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setReceivedData(prev => [...prev, `${new Date().toLocaleTimeString()}: WebSocket error`])
      }

      ws.onclose = (event) => {
        setIsConnected(false)
        setDevice(null)
        wsRef.current = null
        console.log('WebSocket closed:', event.code, event.reason)
        setReceivedData(prev => [...prev, `${new Date().toLocaleTimeString()}: Connection closed`])
      }

    } catch (error) {
      console.error('WiFi connection failed:', error)
      setReceivedData(prev => [...prev, `${new Date().toLocaleTimeString()}: Failed: ${error}`])
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-2 items-center">
        
        <button
          onClick={connect}
          disabled={isConnected}
          className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:bg-gray-400 transition-colors"
        >
          {isConnected ? 'Connected' : 'Connect to NPG Device'}
        </button>
      </div>
      
      {device && (
        <div className="text-center mb-4">
          <p className="text-green-600">Connected to: NPG-LITE WiFi Device ({ipAddress})</p>
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
            className="bg-purple-50 p-4 rounded-lg h-80 overflow-y-auto border"
            style={{ 
              scrollBehavior: 'auto',
              display: 'flex',
              flexDirection: 'column-reverse' // This makes latest items appear at bottom visually
            }}
          >
            <div className="text-xs font-mono">
              {rawData.map((sample, index) => (
                <div key={index} className="mb-1 hover:bg-purple-100 px-2 py-1 rounded">
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