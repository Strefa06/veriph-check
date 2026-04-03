import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { historyService, HistoryEntry } from "../services/historyService";

type Props = {
};

export function HistoryScreen({}: Props) {
  const { colors } = useTheme();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    const data = await historyService.getHistory();
    setHistory(data);
    setLoading(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert("Delete Entry", "Are you sure you want to delete this entry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        onPress: async () => {
          await historyService.deleteEntry(id);
          await loadHistory();
        },
        style: "destructive"
      }
    ]);
  };

  const handleClearAll = () => {
    Alert.alert("Clear All", "Delete all history entries?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear All",
        onPress: async () => {
          await historyService.clearHistory();
          await loadHistory();
        },
        style: "destructive"
      }
    ]);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getClassificationColor = (label: HistoryEntry["result"]["label"]) => {
    switch (label) {
      case "AI":
        return colors.warning;
      case "Fake":
        return colors.danger;
      default:
        return colors.success;
    }
  };

  const getResultColor = (mode: string) => {
    switch (mode) {
      case "Likely Real":
        return colors.success;
      case "Likely Misleading":
        return colors.danger;
      default:
        return colors.warning;
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bgPrimary }]}>
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        {history.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.text }]}>
              No analysis history yet
            </Text>
            <Text style={[styles.emptySubText, { color: colors.text }]}>
              Your analysis results will appear here
            </Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.clearButton, { backgroundColor: colors.danger }]}
              onPress={handleClearAll}
            >
              <Text style={styles.clearButtonText}>Clear All History</Text>
            </TouchableOpacity>

            <View style={styles.listContent}>
              {history.map((item) => (
                <View
                  key={item.id}
                  style={[
                    styles.item,
                    { backgroundColor: colors.bgSecondary, borderColor: colors.accent }
                  ]}
                >
                  <TouchableOpacity style={styles.itemContent} onPress={() => setSelectedEntry(item)}>
                    <Text style={[styles.itemDate, { color: colors.text }]}>{formatDate(item.timestamp)}</Text>
                    <Text style={[styles.itemText, { color: colors.text }]} numberOfLines={2}>
                      {item.content}
                    </Text>
                    <View style={styles.resultRow}>
                      <View style={styles.resultBadge}>
                        <Text style={[styles.resultLabel, { color: getResultColor(item.result.mode) }]}>
                          {item.result.mode}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.classification,
                          { color: getClassificationColor(item.result.label) }
                        ]}
                      >
                        {item.result.label}
                      </Text>
                      <Text style={[styles.confidence, { color: colors.text }]}> 
                        {Math.round(item.result.confidence * 100)}%
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(item.id)}>
                    <Text style={[styles.deleteButton, { color: colors.danger }]}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={Boolean(selectedEntry)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedEntry(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.bgSecondary, borderColor: colors.accent }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Detection Details</Text>
              <TouchableOpacity onPress={() => setSelectedEntry(null)}>
                <Text style={[styles.modalClose, { color: colors.danger }]}>Close</Text>
              </TouchableOpacity>
            </View>

            {selectedEntry ? (
              <ScrollView style={styles.modalBody}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Detected At</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  {formatDate(selectedEntry.timestamp)}
                </Text>

                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Classification</Text>
                <Text
                  style={[
                    styles.detailValue,
                    { color: getClassificationColor(selectedEntry.result.label), fontWeight: "800" }
                  ]}
                >
                  {selectedEntry.result.label} ({selectedEntry.result.mode})
                </Text>

                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Detected Content</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  {selectedEntry.result.detectedText || selectedEntry.content}
                </Text>

                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>How Analysis Was Performed</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  {selectedEntry.result.analysisMethod}
                </Text>

                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Why This Result</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  {selectedEntry.result.explanation || "No explanation available."}
                </Text>

                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Confidence and Scores</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  Confidence: {Math.round(selectedEntry.result.confidence * 100)}%{"\n"}
                  Risk: {Math.round(selectedEntry.result.riskScore * 100)}%{"\n"}
                  AI Likelihood: {Math.round(selectedEntry.result.aiLikelihood * 100)}%{"\n"}
                  Fake Likelihood: {Math.round(selectedEntry.result.fakeNewsLikelihood * 100)}%{"\n"}
                  Trust Match: {selectedEntry.result.trustedMatchPercent}%
                </Text>

                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Checked Sources</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}> 
                  {selectedEntry.result.checkedSources.length
                    ? selectedEntry.result.checkedSources.join("\n")
                    : "No sources were extracted."}
                </Text>

                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>References Used</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}> 
                  {selectedEntry.result.references.length
                    ? selectedEntry.result.references.join("\n")
                    : "No trusted references matched."}
                </Text>

                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Evidence</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}> 
                  {selectedEntry.result.evidence.length
                    ? selectedEntry.result.evidence
                        .map(
                          (item) =>
                            `${item.source} (${item.trusted ? "trusted" : "untrusted"}, ${Math.round(item.trustWeight * 100)}%): ${item.reason}`
                        )
                        .join("\n")
                    : "No evidence items captured."}
                </Text>

                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Notes</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}> 
                  {selectedEntry.result.notes.length
                    ? selectedEntry.result.notes.join("\n")
                    : "No additional notes."}
                </Text>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1
  },
  container: {
    padding: 16,
    paddingBottom: 40
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8
  },
  emptySubText: {
    fontSize: 14,
    textAlign: "center"
  },
  clearButton: {
    marginBottom: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center"
  },
  clearButtonText: {
    color: "#fff",
    fontWeight: "700"
  },
  listContent: {
    gap: 8
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1
  },
  itemContent: {
    flex: 1,
    marginRight: 8
  },
  itemDate: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 4
  },
  itemText: {
    fontSize: 13,
    marginBottom: 8
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  resultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  resultLabel: {
    fontSize: 11,
    fontWeight: "700"
  },
  classification: {
    fontSize: 11,
    fontWeight: "800"
  },
  confidence: {
    fontSize: 12,
    fontWeight: "700"
  },
  deleteButton: {
    fontSize: 18,
    fontWeight: "700",
    padding: 8
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    padding: 16
  },
  modalCard: {
    maxHeight: "88%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 12
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800"
  },
  modalClose: {
    fontSize: 13,
    fontWeight: "700"
  },
  modalBody: {
    paddingTop: 4
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 4
  },
  detailValue: {
    fontSize: 13,
    lineHeight: 19
  }
});
