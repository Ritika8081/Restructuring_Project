'use client'

import { useState, useRef, useEffect } from 'react'
import { useChannelData } from '@/lib/channelDataContext';

// Extend the Navigator interface to include the serial property
declare global {
  interface Navigator {
    serial: any;
  }
}

export default function SerialConnection() {
  const { addSample } = useChannelData();
  const [isConnected, setIsConnected] = useState(false)
  const [device, setDevice] = useState<any | null>(null)
  const [receivedData, setReceivedData] = useState<string[]>([])
  const [currentData, setCurrentData] = useState<{ch0: number, ch1: number, ch2: number} | null>(null)
  const [recentSamples, setRecentSamples] = useState<{ch0: number, ch1: number, ch2: number}[]>([])
  
  const readerRef = useRef<any>(null)
  const bufferRef = useRef<number[]>([])
  const sampleIndex = useRef(0)
  const totalSamples = useRef(0)
  const readerActiveRef = useRef(false)
  
  // Ref for auto-scrolling
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Device constants matching firmware
  const BAUD_RATE = 230400
  const NUM_CHANNELS = 3
  const HEADER_LEN = 3
  const PACKET_LEN = NUM_CHANNELS * 2 + HEADER_LEN + 1 // 10 bytes total
  const SYNC_BYTE_1 = 0xC7
  const SYNC_BYTE_2 = 0x7C
  const END_BYTE = 0x01
  const SAMPLE_RATE = 500
  const MAX_DISPLAY_SAMPLES = 50 // Only keep last 50 samples for display

  // Optimized auto-scroll - only for recent samples display
  useEffect(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
      }
    }, 100)

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [recentSamples.length])

  const connect = async () => {
    try {
      const selectedPort = await navigator.serial.requestPort()
      await selectedPort.open({ baudRate: BAUD_RATE })
      
      setDevice(selectedPort)
      setIsConnected(true)
      readerActiveRef.current = true
      
      // Start reading data
      startReading(selectedPort)
      
      // Send commands automatically
      setTimeout(async () => {
        await sendCommand(selectedPort, "WHORU")
      }, 500)
      
      setTimeout(async () => {
        await sendCommand(selectedPort, "START")
      }, 1000)
      
      setReceivedData(['Connected! Starting data collection...'])

    } catch (error) {
      console.error('Serial connection failed:', error)
    }
  }

  const startReading = async (port: any) => {
    const reader = port.readable.getReader()
    readerRef.current = reader
    
    try {
      while (port.readable && readerActiveRef.current) {
        const { value, done } = await reader.read()
        
        if (done) break
        
        if (value && value.length > 0) {
          // Check for text responses
          try {
            const textData = new TextDecoder().decode(value)
            if (textData.trim().length > 0 && !textData.includes('\x00')) {
              const timestamp = new Date().toLocaleTimeString()
              setReceivedData(prev => [...prev.slice(-10), `${timestamp}: ${textData.trim()}`]) // Keep only last 10 log entries
            }
          } catch (decodeError) {
            // Not text data, treat as binary
          }
          
          // Add to buffer for packet parsing
          const byteArray = Array.from(value as Uint8Array)
          bufferRef.current = [...bufferRef.current, ...byteArray]
          
          handleDataReceived()
        }
      }
    } catch (error) {
      console.error('Error reading from serial port:', error)
    } finally {
      if (readerRef.current) {
        try {
          reader.releaseLock()
        } catch (e) {
          console.log('Reader already released')
        }
      }
    }
  }

  const handleDataReceived = () => {
    const buffer = bufferRef.current
    
    if (buffer.length === 0) return
    
    // Look for complete packets
    for (let i = 0; i <= buffer.length - PACKET_LEN; i++) {
      if (buffer[i] === SYNC_BYTE_1 && buffer[i + 1] === SYNC_BYTE_2) {
        const packet = buffer.slice(i, i + PACKET_LEN)
        
        if (packet.length === PACKET_LEN && packet[PACKET_LEN - 1] === END_BYTE) {
          // Valid packet found - extract ALL 3 channels
          const ch0 = (packet[3] << 8) | packet[4] // Channel 0
          const ch1 = (packet[5] << 8) | packet[6] // Channel 1
          const ch2 = (packet[7] << 8) | packet[8] // Channel 2
          
          const newSample = { ch0, ch1, ch2 }
          // Push to global channel data context
          addSample({ ch0, ch1, ch2, timestamp: Date.now() });
          // Update current data (real-time display)
          setCurrentData(newSample)
          // Update recent samples (keep only last MAX_DISPLAY_SAMPLES)
          setRecentSamples(prev => {
            const updated = [...prev, newSample]
            return updated.length > MAX_DISPLAY_SAMPLES 
              ? updated.slice(-MAX_DISPLAY_SAMPLES) 
              : updated
          })
          sampleIndex.current = (sampleIndex.current + 1) % 1000
          totalSamples.current += 1
          
          // Remove processed packet from buffer
          bufferRef.current = buffer.slice(i + PACKET_LEN)
          return
        }
      }
    }
    
    // Keep buffer size manageable
    if (bufferRef.current.length > 1000) {
      bufferRef.current = bufferRef.current.slice(-500)
    }
  }

  const sendCommand = async (port: any, command: string) => {
    if (port && port.writable) {
      try {
        const writer = port.writable.getWriter()
        const data = new TextEncoder().encode(command + '\n')
        await writer.write(data)
        writer.releaseLock()
      } catch (error) {
        console.error('Error sending command:', error)
      }
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={connect}
        disabled={isConnected}
        className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 transition-colors"
      >
        {isConnected ? 'Connected' : 'Connect to NPG Device'}
      </button>
      
    

     
    </div>
  )
}