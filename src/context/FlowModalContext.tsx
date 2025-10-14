"use client";
import React, { createContext, useContext, useState, ReactNode } from 'react';

interface FlowModalContextType {
  showFlowModal: boolean;
  setShowFlowModal: (show: boolean) => void;
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
  const [showFlowModal, setShowFlowModal] = useState(false);
  return (
    <FlowModalContext.Provider value={{ showFlowModal, setShowFlowModal }}>
      {children}
    </FlowModalContext.Provider>
  );
};
