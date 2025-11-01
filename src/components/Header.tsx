"use client";

/**
 * src/components/Header.tsx
 *
 * Purpose: Top navigation header used across the app. Provides a button to
 * open the flow configuration modal and displays branding.
 *
 * Exports: default Header component
 */
import React from 'react';
import { useRouter } from 'next/navigation';

const Header: React.FC = () => {
    const router = useRouter();
    // Use FlowModalContext for modal control
    const { setShowFlowModal } = require('@/context/FlowModalContext').useFlowModal();

    return (
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
            <div className="max-w-full mx-auto">
                <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
                    {/* Left Section - Logo/Heading */}
                    <div className="flex items-center">
                        <h1 className="text-2xl font-bold text-gray-900">upsidedownlabs</h1>
                    </div>

                    {/* Right Section - Navigation Buttons */}
                    <div className="flex items-center space-x-2">
                        {/* Configure Flow Button in Navbar - uses context */}
                        <button
                            onClick={() => setShowFlowModal(true)}
                            className="flex items-center justify-center px-3 py-2 rounded-md border border-blue-500 bg-blue-600 text-white hover:bg-blue-700 transition-colors duration-150 font-medium"
                            style={{ marginLeft: '8px' }}
                        >
                            <span className="text-lg mr-2">⚙️</span>
                            <span className="hidden sm:inline">Configure Flow</span>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;