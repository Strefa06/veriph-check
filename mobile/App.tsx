import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import debounce from "lodash.debounce";
import { StatusBar } from "expo-status-bar";
import {
  analyzeContent,
  AnalyzeResponse,
  AnalyzeType,
  RealtimeChunkPayload,
  pushRealtimeChunk,
  startRealtimeSession,
  stopRealtimeSession
} from "./src/api/client";
import { ResultCard } from "./src/components/ResultCard";
import { FloatingOverlay } from "./src/components/FloatingOverlay";
import { PermissionsHandler, PermisionsState } from "./src/components/PermissionsHandler";
import { TrustScoreGauge } from "./src/components/TrustScoreGauge";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { OverlayProvider, useOverlay } from "./src/context/OverlayContext";
import { AboutScreen } from "./src/screens/AboutScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { historyService } from "./src/services/historyService";
import { analyzeOfflineClaim } from "./src/services/offlineHeuristicService";
import {
  detectTrustedSourceMatches,
  extractSourceDomains,
  mergeSourceDomains
} from "./src/services/sourceExtractionService";
import { OverlayBridge } from "./src/overlay/OverlayBridge";
import { DetectionPayload } from "./src/overlay/types";

const modes: AnalyzeType[] = ["text", "audio", "video"];

type Screen = "analyze" | "history" | "about";

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function textSimilarity(a: string, b: string): number {
  const left = normalizeForCompare(a);
  const right = normalizeForCompare(b);
  if (!left || !right) return 0;

  const maxLen = Math.max(left.length, right.length);
  if (!maxLen) return 1;

  const distance = levenshteinDistance(left, right);
  return Math.max(0, 1 - distance / maxLen);
}

function tokenizeForNovelty(text: string): Set<string> {
  return new Set(
    normalizeForCompare(text)
      .split(" ")
      .map((part) => part.trim())
      .filter((part) => part.length >= 4)
  );
}

function hasMeaningfulNewText(nextText: string, previousText: string): boolean {
  if (!previousText.trim()) return true;

  const nextTokens = tokenizeForNovelty(nextText);
  const previousTokens = tokenizeForNovelty(previousText);
  if (!nextTokens.size) return false;

  let newTokenCount = 0;
  nextTokens.forEach((token) => {
    if (!previousTokens.has(token)) {
      newTokenCount += 1;
    }
  });

  return newTokenCount >= 3;
}

async function probeInternet(timeoutMs = 2600): Promise<boolean> {
  try {
    const timeoutResult = await Promise.race([
      fetch("https://connectivitycheck.gstatic.com/generate_204", {
        method: "GET",
        cache: "no-store"
      })
        .then(() => true)
        .catch(() => false),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), timeoutMs);
      })
    ]);

    return timeoutResult;
  } catch {
    return false;
  }
}

function ReAIlizeApp() {
  const { isDark, toggleTheme, colors } = useTheme();
  const { overlayActive, detectionActive, setOverlayActive, setDetectionActive } = useOverlay();
  const [activeScreen, setActiveScreen] = useState<Screen>("analyze");
  const [mode, setMode] = useState<AnalyzeType>("text");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [liveStatus, setLiveStatus] = useState("Live mode off");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState(0);
  const [showPermissions, setShowPermissions] = useState(false);
  const [permissionState, setPermissionState] = useState<PermisionsState | null>(null);
  const [offlineFallbackActive, setOfflineFallbackActive] = useState(false);
  const [detectedSourceDomains, setDetectedSourceDomains] = useState<string[]>([]);
  const [networkLabel, setNetworkLabel] = useState("Checking internet...");

  const lastSentChunkRef = useRef("");
  const pendingChunksRef = useRef<DetectionPayload[]>([]);
  const liveSourceDomainsRef = useRef<string[]>([]);
  const lastOverlaySignatureRef = useRef("");
  const localRealtimeChunksRef = useRef<string[]>([]);
  const latestDetectedTextRef = useRef("");

  const canRunNativeRealtime = useMemo(() => {
    if (!permissionState) return false;
    return (
      permissionState.overlay === "granted" &&
      permissionState.microphone === "granted" &&
      permissionState.screenCapture === "granted"
    );
  }, [permissionState]);

  const hasInternetConnection = async (): Promise<boolean> => {
    const online = await probeInternet();
    setNetworkLabel(online ? "Online AI mode" : "Offline only - no internet");
    return online;
  };

  const saveResultToHistory = async (
    nextResult: AnalyzeResponse,
    previewText: string,
    detectedText: string,
    analysisMethod: string,
    checkedSources: string[]
  ) => {
    await historyService.addEntry({
      content: previewText.substring(0, 140),
      type: mode,
      result: {
        label: nextResult.label,
        mode: nextResult.mode,
        confidence: nextResult.confidence,
        riskScore: nextResult.riskScore,
        aiLikelihood: nextResult.aiLikelihood,
        fakeNewsLikelihood: nextResult.fakeNewsLikelihood,
        humanLikelihood: nextResult.humanLikelihood,
        trustedMatchPercent: nextResult.sourceVerification.trustedMatchPercent,
        explanation: nextResult.explanation,
        detectedText,
        analysisMethod,
        checkedSources,
        references: nextResult.sourceVerification.matchedTrustedSources,
        evidence: nextResult.evidence,
        notes: nextResult.notes
      }
    });
  };

  const syncDetectedSources = (text: string, extraSources: string[] = []): string[] => {
    const extracted = extractSourceDomains(text);
    const merged = mergeSourceDomains(liveSourceDomainsRef.current, extracted, extraSources);
    liveSourceDomainsRef.current = merged;

    const trustedMatches = detectTrustedSourceMatches(merged);
    setDetectedSourceDomains(trustedMatches.length > 0 ? trustedMatches : merged.slice(0, 6));

    return merged;
  };

  const updateOverlayResultIfChanged = async (nextResult: AnalyzeResponse, detectedText: string) => {
    const signature = [
      nextResult.label,
      nextResult.mode,
      nextResult.confidence.toFixed(2),
      nextResult.sourceVerification.trustedMatchPercent,
      nextResult.explanation.slice(0, 120),
      detectedText.slice(0, 80)
    ].join("|");

    if (signature === lastOverlaySignatureRef.current) {
      return;
    }

    lastOverlaySignatureRef.current = signature;
    await OverlayBridge.updateOverlayResult({
      label: nextResult.label,
      mode: nextResult.mode,
      confidence: nextResult.confidence,
      trustPercent: nextResult.sourceVerification.trustedMatchPercent,
      explanation: nextResult.explanation,
      detectedText,
      summarizedText: `${nextResult.mode} (${Math.round(nextResult.confidence * 100)}%)`,
      sourceLinks: nextResult.sourceVerification.matchedTrustedSources
    });
  };

  const onAnalyze = async () => {
    const manualSources = syncDetectedSources(content);
    const manualText = content.trim();

    try {
      setLoading(true);
      setError(null);
      setResult(null);
      const online = await hasInternetConnection();
      if (!online) {
        throw new Error("Internet connection is required for manual AI analysis.");
      }

      const data = await analyzeContent(mode, manualText, manualSources);
      latestDetectedTextRef.current = manualText;
      setResult(data);
      setOfflineFallbackActive(false);
      await saveResultToHistory(
        data,
        manualText,
        manualText,
        "Online AI API analysis (manual mode)",
        manualSources
      );
      await updateOverlayResultIfChanged(data, manualText);
    } catch (err) {
      setOfflineFallbackActive(false);
      setError(err instanceof Error ? err.message : "Online analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const stopLive = async () => {
    try {
      if (sessionId) {
        await stopRealtimeSession(sessionId);
      }
      await OverlayBridge.stopRealtimeDetection();
      await OverlayBridge.stopOverlayService();
    } finally {
      setLiveMode(false);
      setOverlayActive(false);
      setDetectionActive(false);
      setSessionId(null);
      setOfflineFallbackActive(false);
      setLiveStatus("Live mode off");
      setChunkCount(0);
      lastSentChunkRef.current = "";
      pendingChunksRef.current = [];
      liveSourceDomainsRef.current = [];
      setDetectedSourceDomains([]);
      lastOverlaySignatureRef.current = "";
      localRealtimeChunksRef.current = [];
    }
  };

  const startNativeDetection = async () => {
    await OverlayBridge.startOverlayService();
    await OverlayBridge.startRealtimeDetection();
    setOverlayActive(true);
    setDetectionActive(true);
    setLiveStatus("Native overlay detection running");
  };

  const onStartLive = async () => {
    const initialSources = syncDetectedSources(content);

    try {
      setError(null);
      const online = await hasInternetConnection();
      if (!online) {
        setSessionId(null);
        setLiveMode(true);
        setOfflineFallbackActive(true);
        setChunkCount(0);
        setLiveStatus("Offline local detection only (no internet)");

        if (!OverlayBridge.isSupported()) {
          setLiveStatus("Native overlay unsupported on this device. Use manual mode fallback.");
          return;
        }

        if (!canRunNativeRealtime) {
          setShowPermissions(true);
          setLiveStatus("Grant permissions to enable native realtime detection");
          return;
        }

        await startNativeDetection();
        return;
      }

      const id = await startRealtimeSession(mode, initialSources);
      setSessionId(id);
      setOfflineFallbackActive(false);
      setLiveMode(true);
      setChunkCount(0);
      setLiveStatus("Live session started");

      if (!OverlayBridge.isSupported()) {
        setLiveStatus("Native overlay unsupported on this device. Use manual mode fallback.");
        return;
      }

      if (!canRunNativeRealtime) {
        setShowPermissions(true);
        setLiveStatus("Grant permissions to enable native realtime detection");
        return;
      }

      await startNativeDetection();
    } catch (err) {
      const online = await hasInternetConnection();
      if (!online) {
        setSessionId(null);
        setLiveMode(true);
        setOfflineFallbackActive(true);
        setChunkCount(0);
        setLiveStatus("Offline local detection only (no internet)");

        if (!OverlayBridge.isSupported()) {
          setLiveStatus("Native overlay unsupported on this device. Use manual mode fallback.");
          return;
        }

        if (!canRunNativeRealtime) {
          setShowPermissions(true);
          setLiveStatus("Grant permissions to enable native realtime detection");
          return;
        }

        await startNativeDetection();
        return;
      }

      setSessionId(null);
      setLiveMode(false);
      setOfflineFallbackActive(false);
      setLiveStatus("Live session failed to connect to online API");
      setError(err instanceof Error ? err.message : "Unable to start online live session");
    }
  };

  const applyOfflineRealtimeResult = async (normalized: string, sourceDomains: string[]) => {
    localRealtimeChunksRef.current.push(normalized);
    if (localRealtimeChunksRef.current.length > 30) {
      localRealtimeChunksRef.current = localRealtimeChunksRef.current.slice(-30);
    }

    const merged = localRealtimeChunksRef.current.join(" ");
    latestDetectedTextRef.current = merged;
    const offlineResult = analyzeOfflineClaim({
      type: mode,
      content: merged,
      claimedSources: sourceDomains
    });

    setOfflineFallbackActive(true);
    setResult(offlineResult);
    setChunkCount(localRealtimeChunksRef.current.length);
    setLiveStatus("Offline local detection only (no internet)");

    await updateOverlayResultIfChanged(offlineResult, merged);

    await saveResultToHistory(
      offlineResult,
      normalized,
      merged,
      "Offline heuristic analysis (internet unavailable)",
      sourceDomains
    );
  };

  const sendDetectedBatch = async (batch: DetectionPayload[]) => {
    if (!batch.length) {
      return;
    }

    const newest = batch[batch.length - 1];
    const mergedText = Array.from(
      new Set(
        batch
          .map((item) => item.text.trim())
          .filter((text) => text.length >= 5)
      )
    ).join(" ");

    if (!mergedText) {
      return;
    }

    const normalized = `[${newest.source}] ${mergedText}`;
    const similarityScore = textSimilarity(normalized, lastSentChunkRef.current);
    const hasNewInfo = hasMeaningfulNewText(normalized, lastSentChunkRef.current);
    if (similarityScore > 0.9 && !hasNewInfo) {
      return;
    }
    lastSentChunkRef.current = normalized;

    const sourceDomains = syncDetectedSources(mergedText);

    const chunkPayload: RealtimeChunkPayload = {
      text: mergedText,
      source: newest.source,
      timestamp: newest.timestamp
    };

    if (!sessionId) {
      const online = await hasInternetConnection();
      if (online) {
        setLiveStatus("Waiting for online session restore...");
        setError("Online mode detected. Reconnecting session; offline fallback paused.");
        return;
      }
      await applyOfflineRealtimeResult(normalized, sourceDomains);
      return;
    }

    try {
      latestDetectedTextRef.current = mergedText;
      const tick = await pushRealtimeChunk(sessionId, chunkPayload);
      setOfflineFallbackActive(false);
      setChunkCount(tick.chunkCount);
      setLiveStatus(`Live: ${tick.chunkCount} chunks analyzed (${newest.source})`);

      if (tick.result) {
        setResult(tick.result);
        await updateOverlayResultIfChanged(tick.result, mergedText);
        await saveResultToHistory(
          tick.result,
          normalized,
          mergedText,
          "Online realtime AI API analysis",
          sourceDomains
        );
      }
    } catch {
      const online = await hasInternetConnection();
      if (online) {
        setOfflineFallbackActive(false);
        setLiveStatus("Realtime chunk failed while online. Retrying next chunk...");
        setError("Online API temporarily unavailable for realtime chunk.");
        return;
      }
      await applyOfflineRealtimeResult(normalized, sourceDomains);
    }
  };

  const debouncedDetectedChunk = useMemo(
    () =>
      debounce(() => {
        const queued = pendingChunksRef.current.splice(0, pendingChunksRef.current.length);
        void sendDetectedBatch(queued).catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Live detection chunk failed");
        });
      }, 700),
    [sessionId, mode]
  );

  useEffect(() => {
    const unsubscribe = OverlayBridge.addDetectionListener((payload) => {
      if (!liveMode || !detectionActive) return;
      if (!payload.text?.trim()) return;
      pendingChunksRef.current.push(payload);
      debouncedDetectedChunk();
    });

    return () => {
      unsubscribe();
      debouncedDetectedChunk.cancel();
    };
  }, [liveMode, detectionActive, debouncedDetectedChunk]);

  useEffect(() => {
    return () => {
      void stopLive();
    };
  }, []);

  useEffect(() => {
    void hasInternetConnection();

    const timer = setInterval(() => {
      void hasInternetConnection();
    }, 7000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!liveMode || sessionId) return;

    let cancelled = false;

    const reconnectSession = async () => {
      const online = await hasInternetConnection();
      if (!online || cancelled) return;

      try {
        const id = await startRealtimeSession(mode, liveSourceDomainsRef.current);
        if (cancelled) return;
        setSessionId(id);
        setOfflineFallbackActive(false);
        setLiveStatus("Connection restored. Realtime online analysis resumed.");
        setError(null);
      } catch {
        if (!cancelled) {
          setLiveStatus("Online reconnect pending...");
        }
      }
    };

    const reconnectTimer = setInterval(() => {
      void reconnectSession();
    }, 6000);

    void reconnectSession();

    return () => {
      cancelled = true;
      clearInterval(reconnectTimer);
    };
  }, [liveMode, mode, sessionId]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bgPrimary }]}> 
      <StatusBar style={isDark ? "light" : "dark"} />

      <View style={[styles.header, { backgroundColor: colors.bgSecondary }]}> 
        <Text style={[styles.headerTitle, { color: colors.text }]}>ReAIlize</Text>
        <TouchableOpacity onPress={toggleTheme} style={styles.headerIconWrap}>
          <Text style={[styles.headerIcon, { color: colors.accent }]}>{isDark ? "Light" : "Dark"}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.navTabs, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.accent }]}>
        {(["analyze", "history", "about"] as Screen[]).map((screen) => (
          <TouchableOpacity
            key={screen}
            onPress={() => setActiveScreen(screen)}
            style={[
              styles.navTab,
              activeScreen === screen && [styles.navTabActive, { borderBottomColor: colors.accent }]
            ]}
          >
            <Text style={[styles.navTabText, { color: activeScreen === screen ? colors.accent : colors.text }]}>
              {screen.charAt(0).toUpperCase() + screen.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeScreen === "analyze" && (
        <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.bgPrimary }]}> 
          {showPermissions ? (
            <PermissionsHandler
              onStatusChange={(nextState) => {
                setPermissionState(nextState);
                if (
                  nextState.overlay === "granted" &&
                  nextState.microphone === "granted" &&
                  nextState.screenCapture === "granted"
                ) {
                  setShowPermissions(false);
                  if (liveMode) {
                    void startNativeDetection();
                  }
                }
              }}
            />
          ) : null}

          <View style={[styles.hero, { backgroundColor: colors.bgSecondary, borderColor: colors.accent }]}> 
            <Text style={[styles.title, { color: colors.text }]}>Real-time AI and Fake News Detection</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}> 
              Live overlay mode uses native Android permissions for speech + OCR pipeline.
              Manual mode remains available when permissions are denied.
            </Text>
            <Text style={[styles.networkText, { color: offlineFallbackActive ? colors.warning : colors.success }]}>
              {networkLabel}
            </Text>
          </View>

          <View style={styles.row}>
            {modes.map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                style={[
                  styles.modeBtn,
                  { backgroundColor: mode === m ? colors.accent : colors.bgSecondary, borderColor: colors.accent }
                ]}
              >
                <Text style={[styles.modeText, { color: mode === m ? "#fff" : colors.text }]}>{m.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.text }]}>Manual mode input (online AI required)</Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Paste transcript, caption, claim, or summary"
            multiline
            style={[
              styles.inputLarge,
              { backgroundColor: colors.bgSecondary, color: colors.text, borderColor: colors.accent }
            ]}
            placeholderTextColor={colors.textTertiary}
          />

          <View style={[styles.autoSourceBox, { backgroundColor: colors.bgSecondary, borderColor: colors.accent }]}>
            <Text style={[styles.label, { color: colors.text }]}>Detected sources (automatic)</Text>
            <Text style={[styles.autoSourceText, { color: colors.textSecondary }]}>
              {detectedSourceDomains.length
                ? detectedSourceDomains.join(", ")
                : "No trusted source detected yet. Links and known publishers are extracted automatically."}
            </Text>
          </View>

          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.accent }]} onPress={onAnalyze} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Analyze Manual Input</Text>}
          </TouchableOpacity>

          <View style={[styles.livePanel, { backgroundColor: colors.bgSecondary, borderColor: colors.accent }]}> 
            <Text style={[styles.liveTitle, { color: colors.text }]}>Realtime Overlay Mode</Text>
            <Text style={[styles.liveText, { color: colors.textSecondary }]}>{liveStatus}</Text>
            <Text style={[styles.liveText, { color: colors.textSecondary }]}>Chunks: {chunkCount}</Text>
            {offlineFallbackActive ? (
              <Text style={[styles.liveText, { color: colors.warning }]}>Using offline detection (limited accuracy)</Text>
            ) : null}

            {!liveMode ? (
              <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.accent }]} onPress={onStartLive}>
                <Text style={[styles.secondaryBtnText, { color: colors.accent }]}>Start Live Session</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.stopBtn, { borderColor: colors.danger }]} onPress={() => void stopLive()}>
                <Text style={[styles.secondaryBtnText, { color: colors.danger }]}>Stop Live Session</Text>
              </TouchableOpacity>
            )}
          </View>

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          {result ? (
            <View style={[styles.resultSection, { backgroundColor: colors.bgSecondary }]}> 
              <Text style={[styles.resultTitle, { color: colors.text }]}>Latest Detection</Text>
              <TrustScoreGauge trustScore={result.sourceVerification.trustedMatchPercent} />
              <ResultCard result={result} />
            </View>
          ) : null}
        </ScrollView>
      )}

      {activeScreen === "history" && <HistoryScreen />}
      {activeScreen === "about" && <AboutScreen />}

      <FloatingOverlay
        visible={overlayActive}
        onClose={() => void stopLive()}
        onStartDetection={() => void startNativeDetection()}
        onStopDetection={() => void OverlayBridge.stopRealtimeDetection().then(() => setDetectionActive(false))}
        isDetecting={detectionActive}
        result={
          result
            ? {
                label: result.label,
                mode: result.mode,
                aiLikelihood: result.aiLikelihood,
                humanLikelihood: result.humanLikelihood,
                trustedMatchPercent: result.sourceVerification.trustedMatchPercent,
                explanation: result.explanation,
                sources: result.sourceVerification.matchedTrustedSources,
                detectedText: latestDetectedTextRef.current
              }
            : undefined
        }
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <OverlayProvider>
        <ReAIlizeApp />
      </OverlayProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb"
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800"
  },
  headerIconWrap: {
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  headerIcon: {
    fontSize: 13,
    fontWeight: "700"
  },
  navTabs: {
    flexDirection: "row",
    borderBottomWidth: 2
  },
  navTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent"
  },
  navTabActive: {
    borderBottomWidth: 3
  },
  navTabText: {
    fontSize: 14,
    fontWeight: "600"
  },
  container: {
    padding: 16,
    paddingBottom: 40
  },
  hero: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    marginBottom: 16
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 8
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20
  },
  networkText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700"
  },
  row: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 8
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center"
  },
  modeText: {
    fontWeight: "700",
    fontSize: 12
  },
  label: {
    marginBottom: 8,
    fontWeight: "700",
    fontSize: 14
  },
  inputLarge: {
    minHeight: 130,
    borderRadius: 12,
    borderWidth: 2,
    padding: 12,
    textAlignVertical: "top",
    marginBottom: 16,
    fontSize: 14
  },
  autoSourceBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16
  },
  autoSourceText: {
    fontSize: 12,
    lineHeight: 18
  },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  },
  livePanel: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16
  },
  liveTitle: {
    fontWeight: "800",
    marginBottom: 8,
    fontSize: 16
  },
  liveText: {
    fontSize: 12,
    marginBottom: 6
  },
  secondaryBtn: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 2,
    paddingVertical: 10,
    alignItems: "center"
  },
  stopBtn: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 2,
    paddingVertical: 10,
    alignItems: "center"
  },
  secondaryBtnText: {
    fontWeight: "700",
    fontSize: 14
  },
  error: {
    marginBottom: 16,
    fontWeight: "600"
  },
  resultSection: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8
  }
});