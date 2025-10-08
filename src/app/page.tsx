'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.push('/widgets');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="text-4xl mb-4">📊</div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Widget Dashboard</h1>
        <p className="text-gray-600">Redirecting to dashboard...</p>
      </div>
    </div>
  );
}