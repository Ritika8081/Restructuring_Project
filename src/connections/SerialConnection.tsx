'use client'

/**
 * src/connections/SerialConnection.tsx
 *
 * Purpose: Manage a native-serial (Web Serial API) connection to the device.
 * Reads incoming bytes, parses packets, forwards channel samples into the
 * ChannelData context and provides a simple UI for connect/disconnect.
 *
 * Exports: default React component SerialConnection
 */
import { useState, useRef, useEffect } from 'react'
import { useChannelData } from '@/lib/channelDataContext';

// Extend the Navigator interface to include the serial property
declare global {
  interface Navigator {
    serial: any;
  }
}

export default function SerialConnection() {
  const channelData = useChannelData();
  const providerAddSampleRef = channelData.addSampleRef;
  const [isConnected, setIsConnected] = useState(false)
  const [device, setDevice] = useState<any | null>(null)
  const [receivedData, setReceivedData] = useState<string[]>([])
  const [currentData, setCurrentData] = useState<Record<string, number> | null>(null)
  const [recentSamples, setRecentSamples] = useState<Record<string, number>[]>([])
  // Throttled updates: hold latest currentData in a ref and batch recentSamples
  const currentDataRef = useRef<Record<string, number> | null>(null)
  const recentSamplesRef = useRef<Record<string, number>[]>([])
  const flushSamplesTimeoutRef = useRef<any>(null)
  // Track a simple key (counter or serialized snippet) of the newest sample
  // buffered so we can skip flushing identical data repeatedly.
  const currentSampleKeyRef = useRef<string | null>(null)
  const lastFlushedSampleKeyRef = useRef<string | null>(null)
  // Detected device type for UI badge (e.g. 'UNO-R4' or 'NPG-Lite')
  const [detectedDeviceType, setDetectedDeviceType] = useState<string | null>(null);
  // Allow user to select device mode: auto-detect (default), R4 (6ch) or 3ch legacy
  const [deviceMode, setDeviceMode] = useState<'auto' | 'r4' | '3ch'>('auto');
  
  const readerRef = useRef<any>(null)
  const portRef = useRef<any>(null)
  const writerRef = useRef<any>(null)
  const unregisterDisconnectRef = useRef<(() => void) | null>(null)
  const bufferRef = useRef<number[]>([])
  const sampleIndex = useRef(0)
  const totalSamples = useRef(0)
  const readerActiveRef = useRef(false)
  // Buffer incoming textual/log messages to avoid frequent setState calls
  const receivedDataRef = useRef<string[]>([])
  const flushLogsTimeoutRef = useRef<any>(null)
  // Debug helpers: log raw assembly of hi/lo bytes for the first few
  // received packets. We do NOT mutate or rescale assembled sample
  // values here; the provider is responsible for normalization and
  // centering (the connection may call `channelData.setAdcBits` to
  // inform the provider of ADC resolution). We only print raw bytes
  // for inspection.
  const debugSamplesLoggedRef = useRef(0);
  
  // Ref for auto-scrolling
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Keep last seen text to avoid appending identical messages repeatedly
  const lastReceivedTextRef = useRef<string | null>(null);

  // Helper: schedule flush of buffered logs into React state (debounced)
  const scheduleFlushLogs = (delay = 200) => {
    if (flushLogsTimeoutRef.current) return
    flushLogsTimeoutRef.current = setTimeout(() => {
      try {
        setReceivedData(prev => {
          const combined = [...prev, ...receivedDataRef.current]
          // Keep only last 10 log entries
          const trimmed = combined.slice(-10)
          return trimmed
        })
      } catch (e) {}
      receivedDataRef.current = []
      clearTimeout(flushLogsTimeoutRef.current)
      flushLogsTimeoutRef.current = null
    }, delay)
  }

  const pushLog = (msg: string) => {
    receivedDataRef.current.push(msg)
    scheduleFlushLogs()
  }

  // Device constants matching firmware (use refs so we can adapt dynamically)
  const BAUD_RATE = 230400
  const HEADER_LEN = 3
  const SYNC_BYTE_1 = 0xC7
  const SYNC_BYTE_2 = 0x7C
  const END_BYTE = 0x01
  // Defaults (most boards use 3 channels at 500Hz); UNO R4 uses 6 channels
  const numChannelsRef = useRef<number>(3);
  const sampleRateRef = useRef<number>(500);
  const packetLenRef = useRef<number>(numChannelsRef.current * 2 + HEADER_LEN + 1);
  const MAX_DISPLAY_SAMPLES = 50 // Only keep last 50 samples for display

  // Flush buffered sample updates into React state (debounced)
  const scheduleFlushSamples = (delay = 100) => {
    if (flushSamplesTimeoutRef.current) return
    flushSamplesTimeoutRef.current = setTimeout(() => {
      try {
        // Avoid flushing when the newest buffered sample matches the
        // last flushed sample to prevent redundant React updates.
        const newestKey = currentSampleKeyRef.current
        if (newestKey !== null && newestKey === lastFlushedSampleKeyRef.current) {
          return
        }
        // Update currentData once with the most recent sample
        try { setCurrentData(currentDataRef.current); } catch (e) {}
        // Merge recentSamplesRef into state and trim
        try {
          setRecentSamples(prev => {
            const merged = [...prev, ...recentSamplesRef.current]
            const trimmed = merged.slice(-MAX_DISPLAY_SAMPLES)
            return trimmed
          })
        } catch (e) {}
        // clear buffered refs
        recentSamplesRef.current = []
        // remember last flushed key
        if (currentSampleKeyRef.current) lastFlushedSampleKeyRef.current = currentSampleKeyRef.current
      } finally {
        if (flushSamplesTimeoutRef.current) {
          clearTimeout(flushSamplesTimeoutRef.current)
          flushSamplesTimeoutRef.current = null
        }
      }
    }, delay)
  }

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
      portRef.current = selectedPort
      setIsConnected(true)
      // Preconfigure parsing based on selected deviceMode (user can override auto-detect)
      try {
        if (deviceMode === 'r4') {
          numChannelsRef.current = 6;
          sampleRateRef.current = 500;
          packetLenRef.current = numChannelsRef.current * 2 + HEADER_LEN + 1;
          console.info('[Serial] connect(): using UNO-R4 mode (6ch @ 500Hz)');
          setDetectedDeviceType('UNO-R4 (manual)');
          // Inform provider of per-channel sampling rate so pending filters can be created
          try {
            if (channelData.setChannelSamplingRate) {
              for (let i = 0; i < numChannelsRef.current; i++) channelData.setChannelSamplingRate(i, sampleRateRef.current);
            }
          } catch (e) {}
          // Tell provider this device uses 14-bit ADC values
          try { channelData.setAdcBits && channelData.setAdcBits(14); } catch (e) {}
        } else if (deviceMode === '3ch') {
          numChannelsRef.current = 3;
          sampleRateRef.current = 500;
          packetLenRef.current = numChannelsRef.current * 2 + HEADER_LEN + 1;
          console.info('[Serial] connect(): using Legacy 3ch mode (3ch @ 500Hz)');
          setDetectedDeviceType('NPG-Lite (manual)');
          try {
            if (channelData.setChannelSamplingRate) {
              for (let i = 0; i < numChannelsRef.current; i++) channelData.setChannelSamplingRate(i, sampleRateRef.current);
            }
          } catch (e) {}
        }
      } catch (e) { }
  // Let the provider know the device sampling rate so filters can be configured
  try { channelData.setSamplingRate && channelData.setSamplingRate(sampleRateRef.current); } catch (e) {}
    // Start reading data (this will also inspect initial text responses like WHORU)
    if (!readerActiveRef.current) {
      readerActiveRef.current = true
      startReading(selectedPort)
    } else {
      console.info('[Serial] reader already active - skipping startReading')
    }
      
      // Send commands automatically
      setTimeout(async () => {
        await sendCommand(selectedPort, "WHORU")
      }, 500)
      
      setTimeout(async () => {
        await sendCommand(selectedPort, "START")
      }, 1000)
      
  // Seed initial connection message immediately
  setReceivedData(['Connected! Starting data collection...'])

      // Register disconnect handler in provider so page-level disconnects work
      try {
        if (channelData && typeof channelData.registerConnectionDisconnect === 'function') {
          if (!unregisterDisconnectRef.current) {
            unregisterDisconnectRef.current = channelData.registerConnectionDisconnect(doDisconnect);
            console.info('[Serial] registered disconnect handler in context');
          } else {
            console.info('[Serial] disconnect handler already registered');
          }
        }
      } catch (e) {}

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
            const trimmed = textData.trim();
            // Run detection on any trimmed textual response. Some devices
            // include NUL bytes when sending mixed binary/text replies;
            // don't skip detection just because NULs are present.
            if (trimmed.length > 0) {
              const timestamp = new Date().toLocaleTimeString()
              // Avoid appending the same text repeatedly which can cause
              // frequent state churn and render storms.
              if (lastReceivedTextRef.current !== trimmed) {
                lastReceivedTextRef.current = trimmed;
                pushLog(`${timestamp}: ${trimmed}`)
              }
              // Auto-detect UNO R4 responses (firmware responds with "UNO-R4") and adjust parsing
              try {
                const t = trimmed.toUpperCase();
                if (t.includes('UNO-R4') || t.includes('R4')) {
                  // UNO R4 uses 6 channels and the same sampling rate defined in firmware
                  // Only update detection state once (avoid repeating state updates)
                  if (numChannelsRef.current !== 6) {
                    numChannelsRef.current = 6;
                    sampleRateRef.current = 500;
                    packetLenRef.current = numChannelsRef.current * 2 + HEADER_LEN + 1;
                    try { channelData.setSamplingRate && channelData.setSamplingRate(sampleRateRef.current); } catch (e) {}
                    // Also set per-channel sampling rate so provider can create filter instances per-channel
                    try {
                      if (channelData.setChannelSamplingRate) {
                        for (let i = 0; i < numChannelsRef.current; i++) channelData.setChannelSamplingRate(i, sampleRateRef.current);
                      }
                    } catch (e) {}
                    // Set ADC resolution to 14 bits for UNO-R4 so provider centers correctly
                    try { channelData.setAdcBits && channelData.setAdcBits(14); } catch (e) {}
                    console.info('[Serial] Detected device: UNO-R4');
                    setDetectedDeviceType('UNO-R4');
                    pushLog(`${timestamp}: Detected UNO-R4, using ${numChannelsRef.current} channels @ ${sampleRateRef.current}Hz`);
                  }
                } else if (t.includes('NPG') || t.includes('NPG-LITE') || t.includes('NPG LITE') || t.includes('LITE')) {
                  // NPG Lite (legacy) response - assume 3 channels at 500Hz unless overridden
                  if (numChannelsRef.current !== 3) {
                    numChannelsRef.current = 3;
                    sampleRateRef.current = 500;
                    packetLenRef.current = numChannelsRef.current * 2 + HEADER_LEN + 1;
                    try { channelData.setSamplingRate && channelData.setSamplingRate(sampleRateRef.current); } catch (e) {}
                    try {
                      if (channelData.setChannelSamplingRate) {
                        for (let i = 0; i < numChannelsRef.current; i++) channelData.setChannelSamplingRate(i, sampleRateRef.current);
                      }
                    } catch (e) {}
                    console.info('[Serial] Detected device: NPG-Lite');
                    setDetectedDeviceType('NPG-Lite');
                    pushLog(`${timestamp}: Detected NPG-Lite, using ${numChannelsRef.current} channels @ ${sampleRateRef.current}Hz`);
                  }
                }
              } catch (e) {
                // ignore detection errors
              }
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

  // Graceful disconnect triggered by app
  const doDisconnect = async () => {
    console.info('[Serial][doDisconnect] start');
    try {
      // Stop reader
      try {
        readerActiveRef.current = false;
        if (readerRef.current) {
          console.info('[Serial][doDisconnect] cancelling reader');
          try { await readerRef.current.cancel(); } catch (e) { console.warn('[Serial] reader.cancel error', e); }
          try { readerRef.current.releaseLock(); } catch (e) { console.warn('[Serial] reader.releaseLock error', e); }
          readerRef.current = null;
        }
      } catch (e) { console.warn('[Serial] reader cleanup error', e); }

      // Attempt to send STOP and close writer
      try {
        const port = portRef.current;
        if (port && port.writable) {
          try {
            console.info('[Serial][doDisconnect] sending STOP');
            const writer = port.writable.getWriter();
            try { await writer.write(new TextEncoder().encode('STOP\n')); } catch (e) { console.warn('[Serial] writer.write STOP error', e); }
            try { writer.releaseLock(); } catch (e) { console.warn('[Serial] writer.releaseLock error', e); }
          } catch (e) { console.warn('[Serial] writer error', e); }
        }
      } catch (e) { console.warn('[Serial] stop/send error', e); }

      // Close port
      try {
        if (portRef.current) {
          console.info('[Serial][doDisconnect] closing port');
          try { await portRef.current.close(); } catch (e) { console.warn('[Serial] port.close error', e); }
          portRef.current = null;
        }
      } catch (e) { console.warn('[Serial] port close error', e); }

      try { setIsConnected(false); } catch (e) {}
      try { channelData.clearSamples && channelData.clearSamples(); } catch (e) { console.warn('[Serial] clearSamples error', e); }
      console.info('[Serial][doDisconnect] done');
      try { if (unregisterDisconnectRef.current) { unregisterDisconnectRef.current(); unregisterDisconnectRef.current = null; } } catch (e) {}
    } catch (err) {
      console.error('Error during serial disconnect', err)
    }
  }

  useEffect(() => {
    const handler = () => { try { console.info('[Serial] received app:disconnect'); } catch (e) {} ; doDisconnect(); };
    try { window.addEventListener('app:disconnect', handler as EventListener); } catch (e) {}
    return () => {
      try { window.removeEventListener('app:disconnect', handler as EventListener); } catch (e) {}
      // See note in BLE connection: we register the provider-level disconnect
      // handler when a connection is established (in `connect()`), and it is
      // unregistered by `doDisconnect()` after the connection is torn down.
    };
  }, []);

  // Clean up any outstanding sample flush timers when component unmounts
  useEffect(() => {
    return () => {
      try { if (flushSamplesTimeoutRef.current) { clearTimeout(flushSamplesTimeoutRef.current); flushSamplesTimeoutRef.current = null } } catch (e) {}
    }
  }, [])

  const handleDataReceived = () => {
    const buffer = bufferRef.current
    
    if (buffer.length === 0) return
    
    // Look for complete packets using dynamic packet length
    const PACKET_LEN_CUR = packetLenRef.current;
    for (let i = 0; i <= buffer.length - PACKET_LEN_CUR; i++) {
      if (buffer[i] === SYNC_BYTE_1 && buffer[i + 1] === SYNC_BYTE_2) {
        const packet = buffer.slice(i, i + PACKET_LEN_CUR)

        if (packet.length === PACKET_LEN_CUR && packet[PACKET_LEN_CUR - 1] === END_BYTE) {
          // Valid packet found - extract channels dynamically
          const sampleObj: Record<string, number> = {};
          for (let ch = 0; ch < numChannelsRef.current; ch++) {
            const hi = packet[HEADER_LEN + (2 * ch)];
            const lo = packet[HEADER_LEN + (2 * ch) + 1];
            // Assemble a 16-bit word from hi/lo. We do NOT modify or
            // rescale the assembled sample here; raw numeric values are
            // passed unchanged to the provider. The provider will perform
            // centering/normalization (using `adcBits` if configured).
            let val = (hi << 8) | lo;
            // Log the raw hi/lo and assembled val for the first few samples
            if (debugSamplesLoggedRef.current < 8) {
              try {
                console.debug(`[Serial] raw bytes ch${ch}: hi=0x${hi.toString(16).padStart(2,'0')} lo=0x${lo.toString(16).padStart(2,'0')} assembled=${val}`);
              } catch (e) {}
            }
            // NOTE: No autoscaling is performed here; raw `val` is forwarded
            // unchanged to the provider. If you need provider-side
            // normalization, call `channelData.setAdcBits(bits)` from the
            // connection layer (we set this automatically for UNO-R4).
            sampleObj[`ch${ch}`] = val;
          }
          debugSamplesLoggedRef.current += 1;
          // include counter if present
          try { sampleObj.counter = packet[2]; } catch (e) {}

          // Push to global channel data context (use provider ref when available)
          try {
            const dispatchSample = providerAddSampleRef?.current ?? channelData.addSample;
            dispatchSample && dispatchSample({ ...(sampleObj as any), timestamp: Date.now() });
          } catch (err) {
            console.error('addSample error', err);
          }

          // Buffer UI updates: write into refs and schedule a debounced flush
          try {
            currentDataRef.current = sampleObj as any
            // compute a small key for this sample - prefer counter if available
            try {
              const k = (sampleObj as any).counter !== undefined ? String((sampleObj as any).counter) : JSON.stringify({ ch0: sampleObj.ch0, ch1: sampleObj.ch1, ch2: sampleObj.ch2 })
              currentSampleKeyRef.current = k
            } catch (e) { currentSampleKeyRef.current = null }
            // push into recent samples buffer
            recentSamplesRef.current.push(sampleObj as any)
            // cap buffer to MAX_DISPLAY_SAMPLES * 2 to avoid memory growth
            if (recentSamplesRef.current.length > MAX_DISPLAY_SAMPLES * 2) {
              recentSamplesRef.current = recentSamplesRef.current.slice(-MAX_DISPLAY_SAMPLES * 2)
            }
            scheduleFlushSamples()
          } catch (e) {}
          sampleIndex.current = (sampleIndex.current + 1) % 1000
          totalSamples.current += 1

          // Remove processed packet from buffer
          bufferRef.current = buffer.slice(i + PACKET_LEN_CUR)
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
        {isConnected ? 'Connected' : 'Connect to Device'}
      </button>
      
      {/* Device type badge */}
      <div className="mt-2">
        <span className={`px-2 py-1 text-xs font-medium rounded ${detectedDeviceType ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
          {detectedDeviceType ?? 'Unknown Device'}
        </span>
      </div>
    </div>
  )
}