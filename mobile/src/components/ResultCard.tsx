import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AnalyzeResponse } from "../api/client";
import { useTheme } from "../context/ThemeContext";
import { TrustScoreGauge } from "./TrustScoreGauge";

type Props = {
  result: AnalyzeResponse;
};

export function ResultCard({ result }: Props) {
  const { colors, isDark } = useTheme();

  const modeColor =
    result.mode === "Likely Real"
      ? colors.success
      : result.mode === "Likely Misleading"
        ? colors.danger
        : colors.warning;

  return (
    <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
      <Text style={[styles.mode, { color: modeColor }]}>{result.mode}</Text>

      {/* Gauge */}
      <View style={styles.gaugeSection}>
        <TrustScoreGauge trustScore={result.sourceVerification.trustedMatchPercent} />
      </View>

      {/* Metrics */}
      <View style={styles.metricsRow}>
        <View style={[styles.metricItem, { backgroundColor: colors.bgPrimary }]}>
          <Text style={[styles.metricLabel, { color: colors.text }]}>Confidence</Text>
          <Text style={[styles.metricValue, { color: colors.accent }]}>
            {Math.round(result.confidence * 100)}%
          </Text>
        </View>
        <View style={[styles.metricItem, { backgroundColor: colors.bgPrimary }]}>
          <Text style={[styles.metricLabel, { color: colors.text }]}>Risk</Text>
          <Text style={[styles.metricValue, { color: colors.danger }]}>
            {Math.round(result.riskScore * 100)}%
          </Text>
        </View>
      </View>

      {/* Explanation */}
      {result.explanation && (
        <View style={[styles.explanationBox, { backgroundColor: colors.bgPrimary, borderColor: colors.accent }]}>
          <Text style={[styles.explanationTitle, { color: colors.accent }]}>💡 Why?</Text>
          <Text style={[styles.explanationText, { color: colors.text }]}>{result.explanation}</Text>
        </View>
      )}

      {/* Verified Sources */}
      {result.sourceVerification.matchedTrustedSources && result.sourceVerification.matchedTrustedSources.length > 0 && (
        <View style={[styles.verifyBox, { backgroundColor: colors.bgPrimary, borderColor: colors.success }]}>
          <Text style={[styles.verifyTitle, { color: colors.success }]}>✓ Verified Against Sources</Text>
          <Text style={[styles.verifyText, { color: colors.text }]}>
            Match: {result.sourceVerification.trustedMatchPercent}%
          </Text>
          {result.sourceVerification.matchedTrustedSources.map((source: string, idx: number) => (
            <Text key={`${source}-${idx}`} style={[styles.verifyItem, { color: colors.text }]}>
              • {source}
            </Text>
          ))}
        </View>
      )}

      {(!result.sourceVerification.matchedTrustedSources || result.sourceVerification.matchedTrustedSources.length === 0) &&
        result.sourceVerification.checkedSources &&
        result.sourceVerification.checkedSources.length > 0 && (
          <View style={[styles.verifyBox, { backgroundColor: colors.bgPrimary, borderColor: colors.warning }]}>
            <Text style={[styles.verifyTitle, { color: colors.warning }]}>Detected Source Domains</Text>
            {result.sourceVerification.checkedSources.slice(0, 8).map((source: string, idx: number) => (
              <Text key={`${source}-${idx}`} style={[styles.verifyItem, { color: colors.text }]}>
                • {source}
              </Text>
            ))}
          </View>
        )}

      {/* Evidence */}
      {result.evidence && result.evidence.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>📋 Evidence</Text>
          {result.evidence.map((item, idx) => (
            <View key={`${item.source}-${idx}`} style={[styles.evidenceRow, { backgroundColor: colors.bgPrimary }]}>
              <Text style={[styles.evidenceSource, { color: colors.accent }]}>{item.source}</Text>
              <Text style={[styles.evidenceMeta, { color: colors.text }]}>{item.reason}</Text>
            </View>
          ))}
        </>
      )}

      {/* Notes */}
      {result.notes && result.notes.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>📝 Notes</Text>
          {result.notes.map((note, idx) => (
            <Text key={`${note}-${idx}`} style={[styles.note, { color: colors.text }]}>
              • {note}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  card: {
    marginTop: 0,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16
  },
  mode: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12
  },
  gaugeSection: {
    alignItems: "center",
    marginBottom: 16
  },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16
  },
  metricItem: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center"
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "700"
  },
  explanationBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 4
  },
  explanationTitle: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6
  },
  explanationText: {
    fontSize: 13,
    lineHeight: 20,
    fontStyle: "italic"
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "700"
  },
  verifyBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 4
  },
  verifyTitle: {
    fontWeight: "800",
    marginBottom: 6,
    fontSize: 13
  },
  verifyText: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4
  },
  verifyItem: {
    fontSize: 12,
    marginBottom: 2
  },
  evidenceRow: {
    marginBottom: 8,
    padding: 10,
    borderRadius: 10
  },
  evidenceSource: {
    fontWeight: "600",
    marginBottom: 4
  },
  evidenceMeta: {
    fontSize: 12
  },
  note: {
    marginBottom: 6,
    fontSize: 12
  }
});
