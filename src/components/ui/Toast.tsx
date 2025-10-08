import React, { useEffect } from 'react';
import { ToastState } from '@/types/widget.types';

/**
 * Toast notification component for user feedback
 * Auto-dismisses after 4 seconds with smooth animations
 */
const Toast: React.FC<{ toast: ToastState; onClose: () => void }> = ({ toast, onClose }) => {
    // Auto-dismiss timer
    useEffect(() => {
        if (toast.show) {
            const timer = setTimeout(onClose, 4000);
            return () => clearTimeout(timer);
        }
    }, [toast.show, onClose]);

    if (!toast.show) return null;

    // Dynamic styling based on toast type
    const bgColor = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500'
    }[toast.type];

    return (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[200] ${bgColor} text-white px-4 py-2 rounded-lg shadow-lg transition-all duration-300`}>
            <div className="flex items-center gap-2">
                <span className="text-sm">{toast.message}</span>
                <button onClick={onClose} className="text-white hover:text-gray-200">×</button>
            </div>
        </div>
    );
};

export default Toast;