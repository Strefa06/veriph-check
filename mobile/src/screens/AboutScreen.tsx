import React from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useTheme } from "../context/ThemeContext";

type Props = {};

export function AboutScreen({}: Props) {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bgPrimary }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { backgroundColor: colors.bgPrimary }]}
      >
        {/* App Title */}
        <View style={[styles.section, { backgroundColor: colors.bgSecondary, borderColor: colors.accent }]}>
          <Text style={[styles.title, { color: colors.text }]}>ReAIlize</Text>
          <Text style={[styles.version, { color: colors.text }]}>Version 2.0.0</Text>
          <Text style={[styles.tagline, { color: colors.accent }]}>AI & Fake News Detection</Text>
        </View>

        {/* Description */}
        <View style={[styles.section, { backgroundColor: colors.bgSecondary, borderColor: colors.accent }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>About ReAIlize</Text>
          <Text style={[styles.sectionText, { color: colors.text }]}>
            ReAIlize is a real-time AI and fake news detection app designed to help users identify
            misleading or AI-generated content while browsing social media, watching videos, or reading
            online news. Protect yourself from misinformation.
          </Text>
        </View>

        {/* Key Purpose */}
        <View style={[styles.section, { backgroundColor: colors.bgSecondary, borderColor: colors.accent }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>🎯 Our Mission</Text>
          <View style={styles.bulletList}>
            <Text style={[styles.bullet, { color: colors.text }]}>
              • Promote digital literacy and awareness
            </Text>
            <Text style={[styles.bullet, { color: colors.text }]}>
              • Help users verify information instantly
            </Text>
            <Text style={[styles.bullet, { color: colors.text }]}>
              • Combat misinformation and AI misuse
            </Text>
            <Text style={[styles.bullet, { color: colors.text }]}>
              • Build trust in Philippine communities
            </Text>
          </View>
        </View>

        {/* Features */}
        <View style={[styles.section, { backgroundColor: colors.bgSecondary, borderColor: colors.accent }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>✨ Key Features</Text>
          <View style={styles.bulletList}>
            <Text style={[styles.bullet, { color: colors.text }]}>
              • Real-time overlay detection on social apps
            </Text>
            <Text style={[styles.bullet, { color: colors.text }]}>
              • AI/Fake news probability scoring (0-100%)
            </Text>
            <Text style={[styles.bullet, { color: colors.text }]}>
              • Verification against trusted Philippine sources
            </Text>
            <Text style={[styles.bullet, { color: colors.text }]}>
              • Detailed confidence explanations
            </Text>
            <Text style={[styles.bullet, { color: colors.text }]}>
              • Analysis history tracking
            </Text>
            <Text style={[styles.bullet, { color: colors.text }]}>
              • Light and dark mode support
            </Text>
          </View>
        </View>

        {/* Supported Sources */}
        <View style={[styles.section, { backgroundColor: colors.bgSecondary, borderColor: colors.accent }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>🏛️ Trusted Sources</Text>
          <Text style={[styles.bullet, { color: colors.text }]}>
            Verified against 16+ Philippine trusted outlets including VERA Files, Rappler, Philippine Star,
            Philippine Inquirer, ABS-CBN News, GMA News, and government official sources.
          </Text>
        </View>

        {/* Disclaimer */}
        <View
          style={[
            styles.section,
            styles.disclaimerSection,
            { backgroundColor: colors.bgSecondary, borderColor: colors.warning }
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.warning }]}>⚠️ Important Disclaimer</Text>
          <Text style={[styles.disclaimerText, { color: colors.text }]}>
            Results are based on AI analysis and heuristic patterns. They may not be 100% accurate. Users are
            strongly encouraged to verify information independently using multiple trusted sources. We recommend
            critical thinking and cross-checking before sharing or acting on information.
          </Text>
        </View>

        {/* Developed For */}
        <View style={[styles.section, { backgroundColor: colors.bgSecondary, borderColor: colors.accent }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>🇵🇭 Developed For</Text>
          <Text style={[styles.sectionText, { color: colors.text }]}>
            The Philippines - Fighting misinformation and AI misuse across social media and digital platforms.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.text }]}>
            © 2025 ReAIlize. All rights reserved.
          </Text>
          <Text style={[styles.footerText, { color: colors.text }]}>
            v2.0.0 • Made with ❤️ for the Philippines
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14
  },
  disclaimerSection: {
    borderTopWidth: 2
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 4
  },
  version: {
    fontSize: 12,
    textAlign: "center",
    fontWeight: "600"
  },
  tagline: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
    fontWeight: "700"
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8
  },
  sectionText: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 20
  },
  disclaimerText: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18
  },
  bulletList: {
    gap: 6
  },
  bullet: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 20
  },
  footer: {
    alignItems: "center",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)"
  },
  footerText: {
    fontSize: 11,
    textAlign: "center",
    marginBottom: 4,
    fontWeight: "500"
  }
});
