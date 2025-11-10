"use client";
import React, { createContext, useContext, useState, ReactNode } from 'react';

/**
 * src/context/FlowModalContext.tsx
 *
 * Purpose: Provides a small React context to control visibility of the
 * flow configuration modal. Intended to be wrapped around the app so any
 * component can open/close the flow modal.
 *
 * Exports: FlowModalProvider, useFlowModal()
 */

interface FlowModalContextType {
  showFlowModal: boolean;
  setShowFlowModal: (show: boolean) => void;
  // markFlowSeen: record that user has seen/handled the initial flowchart
  // and should not be forced to see it again on subsequent visits.
  markFlowSeen: () => void;
}

const FlowModalContext = createContext<FlowModalContextType | undefined>(undefined);

export const useFlowModal = () => {
  const context = useContext(FlowModalContext);
  if (!context) {
    throw new Error('useFlowModal must be used within a FlowModalProvider');
  }
  return context;
};

export const FlowModalProvider = ({ children }: { children: ReactNode }) => {
  // Always show the flow modal on load. The consumer can call markFlowSeen
  // to close it for the current session; we intentionally do NOT persist
  // this choice so the modal will reappear on every subsequent page load.
  const [showFlowModal, setShowFlowModal] = useState(true);

  const markFlowSeen = () => {
    // Close modal for current session only (no localStorage persistence)
    setShowFlowModal(false);
  };

  return (
    <FlowModalContext.Provider value={{ showFlowModal, setShowFlowModal, markFlowSeen }}>
      {children}
    </FlowModalContext.Provider>
  );
};
