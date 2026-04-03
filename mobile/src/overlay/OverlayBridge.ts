import { DeviceEventEmitter, NativeModules, Platform } from "react-native";
import {
  DetectionPayload,
  OverlayFramePayload,
  OverlayLiveResultPayload,
  OverlayStatus
} from "./types";

type OverlayNativeModule = {
  requestOverlayPermission(): Promise<boolean>;
  requestAccessibilityPermission(): Promise<boolean>;
  requestScreenCapturePermission(): Promise<boolean>;
  requestMicrophonePermission(): Promise<boolean>;
  startOverlayService(): Promise<void>;
  stopOverlayService(): Promise<void>;
  startRealtimeDetection(): Promise<void>;
  stopRealtimeDetection(): Promise<void>;
  getOverlayStatus(): Promise<OverlayStatus>;
  pushFrame(payload: OverlayFramePayload): Promise<void>;
  updateOverlayResult(payload: OverlayLiveResultPayload): Promise<void>;
};

const nativeOverlay = NativeModules.RealizeOverlay as OverlayNativeModule | undefined;
const overlayEventEmitter = Platform.OS === "android" ? DeviceEventEmitter : null;

export const OverlayBridge = {
  isSupported(): boolean {
    return Platform.OS === "android" && Boolean(nativeOverlay);
  },

  async requestOverlayPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    return nativeOverlay!.requestOverlayPermission();
  },

  async requestAccessibilityPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    return nativeOverlay!.requestAccessibilityPermission();
  },

  async requestScreenCapturePermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    return nativeOverlay!.requestScreenCapturePermission();
  },

  async requestMicrophonePermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    return nativeOverlay!.requestMicrophonePermission();
  },

  async startOverlayService(): Promise<void> {
    if (!this.isSupported()) return;
    await nativeOverlay!.startOverlayService();
  },

  async stopOverlayService(): Promise<void> {
    if (!this.isSupported()) return;
    await nativeOverlay!.stopOverlayService();
  },

  async startRealtimeDetection(): Promise<void> {
    if (!this.isSupported()) return;
    await nativeOverlay!.startRealtimeDetection();
  },

  async stopRealtimeDetection(): Promise<void> {
    if (!this.isSupported()) return;
    await nativeOverlay!.stopRealtimeDetection();
  },

  async getOverlayStatus(): Promise<OverlayStatus> {
    if (!this.isSupported()) {
      return {
        active: false,
        hasAccessibilityPermission: false,
        hasDrawOverlayPermission: false
      };
    }

    return nativeOverlay!.getOverlayStatus();
  },

  async pushFrame(payload: OverlayFramePayload): Promise<void> {
    if (!this.isSupported()) return;
    await nativeOverlay!.pushFrame(payload);
  },

  async updateOverlayResult(payload: OverlayLiveResultPayload): Promise<void> {
    if (!this.isSupported()) return;
    await nativeOverlay!.updateOverlayResult(payload);
  },

  addDetectionListener(listener: (payload: DetectionPayload) => void): () => void {
    if (!overlayEventEmitter) {
      return () => {};
    }

    const subscription = overlayEventEmitter.addListener("onTextDetected", (event) => {
      listener({
        source: event.source,
        text: event.text,
        timestamp: Number(event.timestamp) || Date.now()
      });
    });

    return () => subscription.remove();
  }
};
