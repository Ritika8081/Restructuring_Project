"use client";

/**
 * src/components/Header.tsx
 *
 * Purpose: Top navigation header used across the app. Provides a button to
 * open the flow configuration modal and displays branding.
 *
 * Exports: default Header component
 */
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import DocModal from './ui/DocModal';
import { useFlowModal } from '@/context/FlowModalContext';

const Header: React.FC = () => {
    const router = useRouter();
    // Use FlowModalContext for modal control
    const { showFlowModal, setShowFlowModal } = useFlowModal();

    // Local state for showing the project documentation modal
    const [showDocs, setShowDocs] = useState(false);

    // If the flow modal is open, hide the global header so the flow's header is the only visible header.
    if (showFlowModal) return null;

    return (
        <header className="sticky top-0 z-50" style={{ background: 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)', borderBottom: '1px solid rgba(15,23,42,0.04)' }}>
            <div className="max-w-full mx-auto">
                <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
                    {/* Left Section - Logo/Heading */}
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-md text-white font-bold shadow" style={{ background: 'linear-gradient(135deg,#2563eb,#06b6d4)' }}>
                            <span className="text-lg">CP</span>
                        </div>
                        <div className="hidden sm:block">
                            <h1 className="text-lg font-semibold" style={{ color: '#0f172a' }}>Chords Playground</h1>
                            <p className="text-xs" style={{ color: '#6b7280' }}>Realtime signal dashboard</p>
                        </div>
                    </div>


                    {/* Right Section - Navigation Buttons */}
                    <div className="flex items-center space-x-3">
                        {/* Configure Flow Button in Navbar - uses context */}
                        <button
                            onClick={() => setShowFlowModal(true)}
                            className="flex items-center justify-center px-3 py-2 rounded-md text-white"
                            aria-label="Edit Flow"
                            style={{ background: '#2563eb', boxShadow: '0 6px 18px rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.12)' }}
                        >
                            <span className="text-sm font-medium hidden sm:inline">Edit Flow</span>
                            <span className="text-lg sm:ml-2">⚙️</span>
                        </button>

                        {/* Docs button - opens the documentation modal for contributors */}
                        <button
                            onClick={() => setShowDocs(true)}
                            className="px-3 py-2 rounded-md bg-white text-sm"
                            aria-label="Open documentation"
                            style={{ border: '1px solid rgba(15,23,42,0.06)', color: '#0f172a' }}
                        >
                            <span className="hidden sm:inline">Docs</span>
                            <span className="sm:hidden">📄</span>
                        </button>

                        {/* Documentation modal rendered from header */}
                        <DocModal show={showDocs} onClose={() => setShowDocs(false)} />
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;