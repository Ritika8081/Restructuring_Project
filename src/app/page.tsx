'use client'

import BleConnection from '@/connections/BleConnection'
import SerialConnection from '@/connections/SerialConnection'
import WifiConnection from '@/connections/WifiConnection'
import Widgets from './widgets/page'

export default function Home() {

  return (
    <main className="flex flex-col items-center justify-center min-h-screen">
     
      <Widgets />
    </main>
  )
}