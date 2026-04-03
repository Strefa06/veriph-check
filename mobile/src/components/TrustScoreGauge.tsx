import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

type Props = {
  trustScore: number; // 0-100
};

export function TrustScoreGauge({ trustScore }: Props) {
  const { colors } = useTheme();
  const clampedScore = Math.min(100, Math.max(0, trustScore));

  let backgroundColor = colors.danger; // Red for low trust
  let label = "Low Trust";

  if (clampedScore >= 65) {
    backgroundColor = colors.success; // Green for high trust
    label = "High Trust";
  } else if (clampedScore >= 40) {
    backgroundColor = colors.warning; // Yellow for uncertain
    label = "Uncertain";
  }

  const percentage = `${Math.round(clampedScore)}%`;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.gauge,
          {
            backgroundColor: colors.bgTertiary,
            borderColor: colors.border
          }
        ]}
      >
        <View
          style={[
            styles.gaugeBar,
            {
              width: `${clampedScore}%`,
              backgroundColor: backgroundColor
            }
          ]}
        />
      </View>
      <View style={styles.labelRow}>
        <Text style={[styles.percentage, { color: backgroundColor }]}>{percentage}</Text>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8
  },
  gauge: {
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden"
  },
  gaugeBar: {
    height: "100%",
    borderRadius: 12
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    alignItems: "center"
  },
  percentage: {
    fontWeight: "800",
    fontSize: 16
  },
  label: {
    fontWeight: "600",
    fontSize: 12
  }
});
