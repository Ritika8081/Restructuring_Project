'use client'

import BleConnection from '@/connections/BleConnection'
import SerialConnection from '@/connections/SerialConnection'
import WifiConnection from '@/connections/WifiConnection'

export default function Home() {

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Device Connection Hub</h1>
        <p className="text-gray-600 mt-2">Choose your connection type</p>
      </div>

      <div className="flex gap-8">
        <div className="flex flex-col items-center gap-4 p-6 border rounded-lg">
          <h2 className="text-xl font-semibold">BLE</h2>
          <BleConnection />

        </div>

        <div className="flex flex-col items-center gap-4 p-6 border rounded-lg">
          <h2 className="text-xl font-semibold">Serial Port</h2>
          <SerialConnection />

        </div>

         <div className="flex flex-col items-center gap-4 p-6 border rounded-lg">
          <h2 className="text-xl font-semibold">Wifi</h2>
          <WifiConnection />

        </div>

      </div>
    </main>
  )
}