/**
 * src/components/ui/ConfirmModal.tsx
 *
 * Purpose: Reusable confirmation modal used for destructive or critical
 * user actions. The modal accepts a ConfirmState and provides confirm/cancel
 * callbacks.
 *
 * Exports: default ConfirmModal component
 */
import React from 'react';
import { ConfirmState } from '@/types/widget.types';
const ConfirmModal: React.FC<{ confirm: ConfirmState }> = ({ confirm }) => {
    if (!confirm.show) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[300]">
            <div className="bg-white rounded-lg p-6 max-w-md mx-4">
                <p className="text-gray-800 mb-4">{confirm.message}</p>
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={confirm.onCancel}
                        className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={confirm.onConfirm}
                        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;