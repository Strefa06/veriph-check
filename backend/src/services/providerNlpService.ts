type ProviderLabel = "AI" | "Fake" | "Real";

export type ProviderAnalysis = {
  label: ProviderLabel;
  confidence: number;
  aiLikelihood: number;
  fakeNewsLikelihood: number;
  explanation: string;
  provider: "openai" | "huggingface";
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

function tryParseProviderJson(raw: string): ProviderAnalysis | null {
  const jsonCandidate = (() => {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
      return trimmed;
    }

    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return trimmed.slice(start, end + 1);
    }
    return trimmed;
  })();

  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<ProviderAnalysis>;
    if (!parsed.label || !parsed.explanation || !parsed.provider) {
      return null;
    }

    if (!["AI", "Fake", "Real"].includes(parsed.label)) {
      return null;
    }

    if (!["openai", "huggingface"].includes(parsed.provider)) {
      return null;
    }

    return {
      label: parsed.label as ProviderLabel,
      confidence: clamp(Number(parsed.confidence ?? 0.5), 0, 1),
      aiLikelihood: clamp(Number(parsed.aiLikelihood ?? 0.5), 0, 1),
      fakeNewsLikelihood: clamp(Number(parsed.fakeNewsLikelihood ?? 0.5), 0, 1),
      explanation: String(parsed.explanation).slice(0, 600),
      provider: parsed.provider as "openai" | "huggingface"
    };
  } catch {
    return null;
  }
}

function buildPrompt(content: string, type: "text" | "audio" | "video", claimedSources: string[]): string {
  return [
    "You are a misinformation and AI-generated-content analyst.",
    "Classify the content into one label: AI, Fake, or Real.",
    "Use source reliability, claim verifiability, manipulative language, and synthetic-writing signals.",
    "Avoid generic explanations. Mention concrete reasons from the content.",
    "Return STRICT JSON only with keys:",
    '{"label":"AI|Fake|Real","confidence":0-1,"aiLikelihood":0-1,"fakeNewsLikelihood":0-1,"explanation":"short reason","provider":"openai|huggingface"}',
    `type: ${type}`,
    `claimedSources: ${claimedSources.join(", ") || "none"}`,
    `content: ${content.slice(0, 5000)}`
  ].join("\n");
}

async function queryOpenAI(
  content: string,
  type: "text" | "audio" | "video",
  claimedSources: string[]
): Promise<ProviderAnalysis | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const prompt = buildPrompt(content, type, claimedSources);

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return valid JSON only." },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const contentRaw = data.choices?.[0]?.message?.content;
  if (!contentRaw) return null;

  const parsed = tryParseProviderJson(contentRaw);
  if (!parsed) return null;

  return {
    ...parsed,
    provider: "openai"
  };
}

async function queryHuggingFace(
  content: string,
  type: "text" | "audio" | "video",
  claimedSources: string[]
): Promise<ProviderAnalysis | null> {
  const apiKey = process.env.HF_API_KEY;
  if (!apiKey) return null;

  const model = process.env.HF_MODEL ?? "google/flan-t5-base";
  const prompt = buildPrompt(content, type, claimedSources);

  const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: 220,
        temperature: 0.1,
        return_full_text: false
      }
    })
  });

  if (!res.ok) return null;

  const data = (await res.json()) as
    | Array<{ generated_text?: string }>
    | { generated_text?: string }
    | { error?: string };

  const generated = Array.isArray(data)
    ? data[0]?.generated_text
    : "generated_text" in data
      ? data.generated_text
      : undefined;
  if (!generated) return null;

  const parsed = tryParseProviderJson(generated);
  if (!parsed) return null;

  return {
    ...parsed,
    provider: "huggingface"
  };
}

export async function analyzeWithProvider(
  content: string,
  type: "text" | "audio" | "video",
  claimedSources: string[]
): Promise<ProviderAnalysis | null> {
  const timeoutMs = Number(process.env.PROVIDER_TIMEOUT_MS ?? 4500);

  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });

  const providerCall = (async () => {
    const openAi = await queryOpenAI(content, type, claimedSources);
    if (openAi) return openAi;

    const hf = await queryHuggingFace(content, type, claimedSources);
    if (hf) return hf;

    return null;
  })();

  return Promise.race([providerCall, timeout]);
}
