import Constants from "expo-constants";

export type AnalyzeType = "text" | "audio" | "video";

export type AnalyzeResponse = {
  label: "AI" | "Fake" | "Real";
  mode: "Likely Real" | "Uncertain" | "Likely Misleading";
  confidence: number;
  riskScore: number;
  aiLikelihood: number;
  fakeNewsLikelihood: number;
  humanLikelihood: number;
  explanation: string;
  sourceVerification: {
    trustedMatchPercent: number;
    matchedTrustedSources: string[];
    checkedSources: string[];
    verifiedAgainstCatalog: string[];
  };
  evidence: Array<{
    source: string;
    trusted: boolean;
    trustWeight: number;
    reason: string;
  }>;
  notes: string[];
};

const EXTRA_API_BASE =
  typeof Constants.expoConfig?.extra?.apiBaseUrl === "string"
    ? Constants.expoConfig.extra.apiBaseUrl
    : "";
const ENV_API_BASE =
  typeof (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.EXPO_PUBLIC_API_BASE_URL === "string"
    ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process!.env!
        .EXPO_PUBLIC_API_BASE_URL!
    : "";
const API_BASE =
  (ENV_API_BASE || EXTRA_API_BASE || "http://10.0.2.2:4000/api").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 6000;
const MAX_RETRIES = 2;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function createNetworkErrorMessage(originalError?: string): string {
  const hint =
    "Set EXPO_PUBLIC_API_BASE_URL to your backend host (for example http://192.168.x.x:4000/api on real devices).";
  return `Cannot reach backend at ${API_BASE}. ${hint}${originalError ? ` Details: ${originalError}` : ""}`;
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  options?: {
    retries?: number;
    timeoutMs?: number;
    retryOn4xx?: boolean;
  }
): Promise<T> {
  const retries = options?.retries ?? MAX_RETRIES;
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const retryOn4xx = options?.retryOn4xx ?? false;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`${API_BASE}${path}`, init, timeoutMs);

      if (!response.ok) {
        const body = await response.text();
        const retriable = response.status >= 500 || retryOn4xx;
        if (!retriable || attempt === retries) {
          throw new Error(body || `Request failed with status ${response.status}`);
        }
        await delay(220 * attempt);
        continue;
      }

      return (await response.json()) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      lastError = new Error(createNetworkErrorMessage(message));

      if (attempt === retries) {
        break;
      }

      await delay(220 * attempt);
    }
  }

  throw lastError ?? new Error(createNetworkErrorMessage());
}

export type RealtimeTickResponse = {
  sessionId: string;
  chunkCount: number;
  mergedContent: string;
  result: AnalyzeResponse | null;
};

export type RealtimeChunkPayload = {
  text: string;
  source: "screen" | "audio";
  timestamp: number;
};

export async function analyzeContent(
  type: AnalyzeType,
  content: string,
  claimedSources: string[] = []
): Promise<AnalyzeResponse> {
  return requestJson<AnalyzeResponse>(`/analyze/${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, claimedSources })
  }, {
    retries: 1,
    timeoutMs: 5200
  });
}

export async function startRealtimeSession(
  type: AnalyzeType,
  claimedSources: string[] = []
): Promise<string> {
  const data = await requestJson<{ sessionId: string }>("/realtime/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, claimedSources })
  }, {
    retries: 1,
    timeoutMs: 4200
  });

  return data.sessionId;
}

export async function pushRealtimeChunk(
  sessionId: string,
  payload: RealtimeChunkPayload
): Promise<RealtimeTickResponse> {
  return requestJson<RealtimeTickResponse>(`/realtime/session/${sessionId}/chunk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }, {
    retries: 1,
    timeoutMs: 3600
  });
}

export async function stopRealtimeSession(sessionId: string): Promise<void> {
  try {
    await fetchWithTimeout(`${API_BASE}/realtime/session/${sessionId}`, { method: "DELETE" }, 4000);
  } catch {
    // Ignore stop failures because session cleanup also happens server-side by expiry.
  }
}
