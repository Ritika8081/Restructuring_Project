'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

const Header: React.FC = () => {
    const router = useRouter();

    const handleNavigateToWidgets = () => {
        router.push('/widgets');
    };

    const handleNavigateToHome = () => {
        router.push('/');
    };

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
                        <button
                            onClick={handleNavigateToHome}
                            className="flex items-center justify-center px-3 py-2 rounded-md border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 hover:border-blue-400 transition-colors duration-150 font-medium"
                        >
                            <span className="text-lg mr-2">🏠</span>
                            <span className="hidden sm:inline">Home</span>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;