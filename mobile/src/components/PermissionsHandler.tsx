import React, { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { OverlayBridge } from "../overlay/OverlayBridge";

type PermissionStatus = "granted" | "denied" | "pending";

export type PermisionsState = {
  overlay: PermissionStatus;
  microphone: PermissionStatus;
  accessibility: PermissionStatus;
  screenCapture: PermissionStatus;
};

type Props = {
  onStatusChange?: (permissions: PermisionsState) => void;
};

export function PermissionsHandler({ onStatusChange }: Props) {
  const { colors } = useTheme();
  const [permissions, setPermissions] = useState<PermisionsState>({
    overlay: "pending",
    microphone: "pending",
    accessibility: "pending",
    screenCapture: "pending"
  });

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    if (Platform.OS !== "android") {
      const next = {
        overlay: "denied" as PermissionStatus,
        microphone: "denied" as PermissionStatus,
        accessibility: "denied" as PermissionStatus,
        screenCapture: "denied" as PermissionStatus
      };
      setPermissions(next);
      onStatusChange?.(next);
      return;
    }

    const overlayStatus = await OverlayBridge.getOverlayStatus();
    const micGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );

    const next = {
      overlay: overlayStatus.hasDrawOverlayPermission ? "granted" : "denied",
      microphone: micGranted ? "granted" : "denied",
      accessibility: overlayStatus.hasAccessibilityPermission ? "granted" : "denied",
      screenCapture: overlayStatus.hasScreenCapturePermission ? "granted" : "denied"
    } as PermisionsState;

    setPermissions(next);
    onStatusChange?.(next);
  };

  const requestPermission = async (permissionName: keyof PermisionsState) => {
    if (Platform.OS !== "android") {
      return;
    }

    if (permissionName === "overlay") {
      const granted = await OverlayBridge.requestOverlayPermission();
      if (!granted) {
        Alert.alert(
          "Overlay Permission Needed",
          "Grant display-over-other-apps permission and return to ReAIlize.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => void Linking.openSettings() }
          ]
        );
      }
      await checkPermissions();
      return;
    }

    if (permissionName === "microphone") {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert("Microphone Denied", "Enable microphone permission in settings.");
      }
      await checkPermissions();
      return;
    }

    if (permissionName === "accessibility") {
      await OverlayBridge.requestAccessibilityPermission();
      Alert.alert("Accessibility", "Enable ReAIlize accessibility service and return.");
      await checkPermissions();
      return;
    }

    if (permissionName === "screenCapture") {
      const granted = await OverlayBridge.requestScreenCapturePermission();
      if (!granted) {
        Alert.alert("Screen Capture Denied", "Screen capture is needed for OCR detection.");
      }
      await checkPermissions();
    }
  };

  const getPermissionColor = (status: PermissionStatus) => {
    switch (status) {
      case "granted":
        return colors.success;
      case "denied":
        return colors.danger;
      default:
        return colors.warning;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>Permissions</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}> 
        Grant permissions for full real-time detection
      </Text>

      {(Object.keys(permissions) as Array<keyof PermisionsState>).map((perm) => (
        <View key={perm} style={styles.permissionItem}>
          <View style={styles.permissionInfo}>
            <View
              style={[
                styles.permissionIndicator,
                { backgroundColor: getPermissionColor(permissions[perm]) }
              ]}
            />
            <View>
              <Text style={[styles.permissionName, { color: colors.text }]}>
                {perm.charAt(0).toUpperCase() + perm.slice(1)}
              </Text>
              <Text style={[styles.permissionStatus, { color: colors.textTertiary }]}>
                {permissions[perm]}
              </Text>
            </View>
          </View>
          {permissions[perm] !== "granted" && (
            <TouchableOpacity
              style={[styles.permissionButton, { backgroundColor: colors.accent }]}
              onPress={() => requestPermission(perm)}
            >
              <Text style={styles.permissionButtonText}>Enable</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginVertical: 12
  },
  title: {
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 4
  },
  subtitle: {
    fontSize: 12,
    marginBottom: 12
  },
  permissionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "transparent"
  },
  permissionInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10
  },
  permissionIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6
  },
  permissionName: {
    fontWeight: "700",
    fontSize: 14
  },
  permissionStatus: {
    fontSize: 11,
    textTransform: "capitalize"
  },
  permissionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  permissionButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12
  }
});
