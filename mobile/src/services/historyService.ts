type AsyncStorageLike = {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
};

function createMemoryStorage(): AsyncStorageLike {
  const store = new Map<string, string>();
  return {
    async setItem(key: string, value: string) {
      store.set(key, value);
    },
    async getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    async removeItem(key: string) {
      store.delete(key);
    }
  };
}

function resolveStorage(): AsyncStorageLike {
  try {
    // Lazy resolve so missing native bindings do not crash app startup.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require("@react-native-async-storage/async-storage");
    if (module?.default) {
      return module.default as AsyncStorageLike;
    }
  } catch {
    // Fall back to in-memory storage if AsyncStorage native module is unavailable.
  }
  return createMemoryStorage();
}

const Storage = resolveStorage();

export type HistoryEntry = {
  id: string;
  timestamp: number;
  content: string;
  type: "text" | "audio" | "video";
  result: {
    label: "AI" | "Fake" | "Real";
    mode: "Likely Real" | "Uncertain" | "Likely Misleading";
    confidence: number;
    riskScore: number;
    aiLikelihood: number;
    fakeNewsLikelihood: number;
    humanLikelihood: number;
    trustedMatchPercent: number;
    explanation: string;
    detectedText: string;
    analysisMethod: string;
    checkedSources: string[];
    references: string[];
    evidence: Array<{
      source: string;
      trusted: boolean;
      trustWeight: number;
      reason: string;
    }>;
    notes: string[];
  };
};

const HISTORY_KEY = "realize_history";
const MAX_HISTORY = 100;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string") as string[];
}

function normalizeEntry(raw: unknown): HistoryEntry | null {
  if (!raw || typeof raw !== "object") return null;

  const entry = raw as Record<string, unknown>;
  const result = (entry.result ?? {}) as Record<string, unknown>;

  const id = typeof entry.id === "string" ? entry.id : Date.now().toString();
  const timestamp = typeof entry.timestamp === "number" ? entry.timestamp : Date.now();
  const content = typeof entry.content === "string" ? entry.content : "";
  const type = entry.type === "audio" || entry.type === "video" ? entry.type : "text";

  const label = result.label === "AI" || result.label === "Fake" ? result.label : "Real";
  const mode =
    result.mode === "Likely Real" || result.mode === "Likely Misleading"
      ? result.mode
      : "Uncertain";

  const confidence = typeof result.confidence === "number" ? result.confidence : 0;
  const riskScore = typeof result.riskScore === "number" ? result.riskScore : 0;
  const aiLikelihood = typeof result.aiLikelihood === "number" ? result.aiLikelihood : 0;
  const fakeNewsLikelihood =
    typeof result.fakeNewsLikelihood === "number" ? result.fakeNewsLikelihood : 0;
  const humanLikelihood = typeof result.humanLikelihood === "number" ? result.humanLikelihood : 0;
  const trustedMatchPercent =
    typeof result.trustedMatchPercent === "number" ? result.trustedMatchPercent : 0;
  const explanation = typeof result.explanation === "string" ? result.explanation : "";
  const detectedText = typeof result.detectedText === "string" ? result.detectedText : content;
  const analysisMethod =
    typeof result.analysisMethod === "string"
      ? result.analysisMethod
      : "Server-side AI analysis and source verification";

  const checkedSources = asStringArray(result.checkedSources);
  const references = asStringArray(result.references);
  const notes = asStringArray(result.notes);

  const evidence = Array.isArray(result.evidence)
    ? (result.evidence
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const value = item as Record<string, unknown>;
          return {
            source: typeof value.source === "string" ? value.source : "unknown",
            trusted: Boolean(value.trusted),
            trustWeight: typeof value.trustWeight === "number" ? value.trustWeight : 0,
            reason: typeof value.reason === "string" ? value.reason : "No reason provided"
          };
        })
        .slice(0, 20) as HistoryEntry["result"]["evidence"])
    : [];

  return {
    id,
    timestamp,
    content,
    type,
    result: {
      label,
      mode,
      confidence,
      riskScore,
      aiLikelihood,
      fakeNewsLikelihood,
      humanLikelihood,
      trustedMatchPercent,
      explanation,
      detectedText,
      analysisMethod,
      checkedSources,
      references,
      evidence,
      notes
    }
  };
}

export const historyService = {
  async addEntry(entry: Omit<HistoryEntry, "id" | "timestamp">): Promise<HistoryEntry> {
    const history = await this.getHistory();
    const newEntry: HistoryEntry = {
      ...entry,
      id: Date.now().toString(),
      timestamp: Date.now()
    };

    const updated = [newEntry, ...history].slice(0, MAX_HISTORY);
    await Storage.setItem(HISTORY_KEY, JSON.stringify(updated));
    return newEntry;
  },

  async getHistory(): Promise<HistoryEntry[]> {
    const data = await Storage.getItem(HISTORY_KEY);
    if (!data) return [];

    try {
      const parsed = JSON.parse(data) as unknown[];
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeEntry).filter((entry): entry is HistoryEntry => entry !== null);
    } catch {
      return [];
    }
  },

  async deleteEntry(id: string): Promise<void> {
    const history = await this.getHistory();
    const updated = history.filter((entry) => entry.id !== id);
    await Storage.setItem(HISTORY_KEY, JSON.stringify(updated));
  },

  async clearHistory(): Promise<void> {
    await Storage.removeItem(HISTORY_KEY);
  }
};
