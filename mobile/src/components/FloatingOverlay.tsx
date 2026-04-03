import React, { useMemo, useState } from "react";
import {
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { TrustScoreGauge } from "./TrustScoreGauge";

type Props = {
  visible: boolean;
  onClose: () => void;
  onStartDetection: () => void;
  onStopDetection: () => void;
  result?: {
    label: "AI" | "Fake" | "Real";
    mode: string;
    aiLikelihood: number;
    humanLikelihood: number;
    trustedMatchPercent: number;
    explanation?: string;
    sources?: string[];
    detectedText?: string;
  };
  isDetecting: boolean;
};

export function FloatingOverlay({
  visible,
  onClose,
  onStartDetection,
  onStopDetection,
  result,
  isDetecting
}: Props) {
  const { colors } = useTheme();
  const [minimized, setMinimized] = useState(false);
  const [expandedText, setExpandedText] = useState(false);
  const [pan] = useState(new Animated.ValueXY());

  const classificationColor = useMemo(() => {
    if (!result) return colors.text;
    if (result.label === "Fake") return colors.danger;
    if (result.label === "AI") return colors.warning;
    return colors.success;
  }, [colors, result]);

  const displayedText = useMemo(() => {
    if (!result?.detectedText) return "";
    return expandedText ? result.detectedText : `${result.detectedText.slice(0, 220)}${result.detectedText.length > 220 ? "..." : ""}`;
  }, [expandedText, result]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
      useNativeDriver: false
    }),
    onPanResponderRelease: () => {
      pan.flattenOffset();
    }
  });

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          backgroundColor: colors.bgSecondary,
          borderColor: colors.border,
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
          width: minimized ? 84 : 320
        }
      ]}
      {...panResponder.panHandlers}
    >
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.accent,
            borderBottomColor: colors.border
          }
        ]}
      >
        <Text style={styles.headerText}>ReAIlize</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setMinimized(!minimized)}>
            <Text style={styles.headerButton}>{minimized ? "▲" : "▼"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.headerButton}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!minimized && (
        <View style={[styles.content, { backgroundColor: colors.bgPrimary }]}>
          {!isDetecting && (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.accent }]}
              onPress={onStartDetection}
            >
              <Text style={styles.buttonText}>Start Detection</Text>
            </TouchableOpacity>
          )}

          {isDetecting && (
            <>
              <View style={styles.detectingContainer}>
                <Text style={[styles.detectingText, { color: colors.accent }]}>Detecting live...</Text>
              </View>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.danger }]}
                onPress={onStopDetection}
              >
                <Text style={styles.buttonText}>Stop Detection</Text>
              </TouchableOpacity>
            </>
          )}

          {result && (
            <View style={styles.resultsContainer}>
              <Text style={[styles.resultLabel, { color: colors.text }]}>{result.mode}</Text>
              <Text style={[styles.classification, { color: classificationColor }]}>Classification: {result.label}</Text>
              <TrustScoreGauge trustScore={result.trustedMatchPercent} />
              <View style={styles.metricsGrid}>
                <View style={styles.metricItem}>
                  <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>AI</Text>
                  <Text style={[styles.metricValue, { color: colors.danger }]}>
                    {Math.round(result.aiLikelihood * 100)}%
                  </Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Trust</Text>
                  <Text style={[styles.metricValue, { color: colors.success }]}>
                    {result.trustedMatchPercent}%
                  </Text>
                </View>
              </View>

              {result.detectedText ? (
                <View style={[styles.detectedBox, { borderColor: colors.border, backgroundColor: colors.bgSecondary }]}>
                  <View style={styles.detectedHeader}>
                    <Text style={[styles.detectedTitle, { color: colors.text }]}>Detected Text</Text>
                    <TouchableOpacity onPress={() => setExpandedText((prev) => !prev)}>
                      <Text style={[styles.expandAction, { color: colors.accent }]}>
                        {expandedText ? "Collapse" : "Expand"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={styles.detectedScroll} nestedScrollEnabled>
                    <Text style={[styles.detectedValue, { color: colors.textSecondary }]}>{displayedText}</Text>
                  </ScrollView>
                </View>
              ) : null}

              {result.explanation ? (
                <Text style={[styles.explanation, { color: colors.textSecondary }]}>{result.explanation}</Text>
              ) : null}

              {result.sources && result.sources.length ? (
                <View style={styles.sourcesBox}>
                  <Text style={[styles.sourcesTitle, { color: colors.success }]}>Sources</Text>
                  {result.sources.slice(0, 3).map((item) => (
                    <Text key={item} style={[styles.sourceItem, { color: colors.textSecondary }]}>
                      • {item}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    bottom: 20,
    right: 20,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 1000
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1
  },
  headerText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14
  },
  headerActions: {
    flexDirection: "row",
    gap: 8
  },
  headerButton: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold"
  },
  content: {
    padding: 12,
    gap: 10
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12
  },
  detectingContainer: {
    alignItems: "center",
    paddingVertical: 16
  },
  detectingText: {
    fontWeight: "700",
    fontSize: 14
  },
  resultsContainer: {
    gap: 8
  },
  resultLabel: {
    fontWeight: "800",
    fontSize: 14,
    textAlign: "center"
  },
  classification: {
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center"
  },
  metricsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 8
  },
  metricItem: {
    alignItems: "center"
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "600"
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2
  },
  explanation: {
    fontSize: 11,
    lineHeight: 16
  },
  detectedBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    marginTop: 4,
    marginBottom: 2
  },
  detectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6
  },
  detectedTitle: {
    fontSize: 11,
    fontWeight: "700"
  },
  expandAction: {
    fontSize: 11,
    fontWeight: "700"
  },
  detectedScroll: {
    maxHeight: 128
  },
  detectedValue: {
    fontSize: 11,
    lineHeight: 16
  },
  sourcesBox: {
    marginTop: 4,
    gap: 2
  },
  sourcesTitle: {
    fontSize: 11,
    fontWeight: "700"
  },
  sourceItem: {
    fontSize: 10,
    lineHeight: 14
  }
});
