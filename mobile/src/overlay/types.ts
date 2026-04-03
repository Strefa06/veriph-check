export type OverlayFramePayload = {
  appPackage: string;
  timestamp: number;
  visibleText: string;
  speechTranscript?: string;
  mediaUrl?: string;
};

export type OverlayMetrics = {
  aiPercent: number;
  authenticPercent: number;
  trustedMatchPercent: number;
  verdict: "Likely Real" | "Uncertain" | "Likely Misleading";
};

export type OverlayStatus = {
  active: boolean;
  hasAccessibilityPermission: boolean;
  hasDrawOverlayPermission: boolean;
  hasMicrophonePermission?: boolean;
  hasScreenCapturePermission?: boolean;
  detectionActive?: boolean;
};

export type DetectionSource = "screen" | "audio";

export type DetectionPayload = {
  text: string;
  source: DetectionSource;
  timestamp: number;
};

export type OverlayLiveResultPayload = {
  label: "AI" | "Fake" | "Real";
  mode?: "Likely Real" | "Uncertain" | "Likely Misleading";
  confidence: number;
  trustPercent: number;
  explanation: string;
  detectedText?: string;
  summarizedText?: string;
  sourceLinks: string[];
};
