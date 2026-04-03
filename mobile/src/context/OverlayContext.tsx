import React, { createContext, useContext, useMemo, useState } from "react";

type OverlayContextType = {
  overlayActive: boolean;
  detectionActive: boolean;
  setOverlayActive: (active: boolean) => void;
  setDetectionActive: (active: boolean) => void;
};

const OverlayContext = createContext<OverlayContextType | undefined>(undefined);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [overlayActive, setOverlayActive] = useState(false);
  const [detectionActive, setDetectionActive] = useState(false);

  const value = useMemo(
    () => ({
      overlayActive,
      detectionActive,
      setOverlayActive,
      setDetectionActive
    }),
    [overlayActive, detectionActive]
  );

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

export function useOverlay() {
  const context = useContext(OverlayContext);
  if (!context) {
    throw new Error("useOverlay must be used within OverlayProvider");
  }
  return context;
}
