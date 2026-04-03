import { AnalyzeResponse, AnalyzeType } from "../api/client";

type OfflineAnalyzeInput = {
  type: AnalyzeType;
  content: string;
  claimedSources?: string[];
};

const suspiciousPhrases = [
  "share now",
  "100% true",
  "hidden by media",
  "urgent",
  "secret",
  "guaranteed",
  "breaking"
];

const trustedDomains = [
  "gov.ph",
  "dost.gov.ph",
  "who.int",
  "verafiles.org",
  "rappler.com",
  "inquirer.net",
  "gmanetwork.com"
];

function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

function normalizeDomain(source: string): string {
  return source
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .toLowerCase();
}

function scoreLanguageRisk(content: string): number {
  const lower = content.toLowerCase();
  let score = 0.3;

  for (const phrase of suspiciousPhrases) {
    if (lower.includes(phrase)) score += 0.11;
  }

  const exclamations = (content.match(/!/g) || []).length;
  if (exclamations > 3) score += 0.1;

  if (content.length > 220 && !/[0-9]/.test(content)) score += 0.07;

  return clamp(score, 0, 1);
}

function scoreSourceTrust(claimedSources: string[]): {
  trustedMatchPercent: number;
  matchedTrustedSources: string[];
  sourceRisk: number;
} {
  if (!claimedSources.length) {
    return {
      trustedMatchPercent: 0,
      matchedTrustedSources: [],
      sourceRisk: 0.62
    };
  }

  const normalized = claimedSources.map(normalizeDomain);
  const matched = normalized.filter((domain) =>
    trustedDomains.some((trusted) => domain === trusted || domain.endsWith(`.${trusted}`))
  );

  const trustedMatchPercent = Math.round((matched.length / normalized.length) * 100);
  const sourceRisk = clamp(1 - trustedMatchPercent / 100, 0, 1);

  return {
    trustedMatchPercent,
    matchedTrustedSources: Array.from(new Set(matched)),
    sourceRisk
  };
}

export function analyzeOfflineClaim(input: OfflineAnalyzeInput): AnalyzeResponse {
  const claimedSources = input.claimedSources ?? [];
  const languageRisk = scoreLanguageRisk(input.content);
  const { trustedMatchPercent, matchedTrustedSources, sourceRisk } = scoreSourceTrust(claimedSources);

  let modalityRisk = 0.24;
  if (input.type === "audio") modalityRisk = 0.35;
  if (input.type === "video") modalityRisk = 0.42;

  const riskScore = clamp(languageRisk * 0.48 + sourceRisk * 0.37 + modalityRisk * 0.15, 0, 1);
  const confidence = clamp(1 - riskScore, 0, 1);
  const aiLikelihood = clamp(riskScore * 0.86 + modalityRisk * 0.14, 0, 1);
  const fakeNewsLikelihood = clamp(riskScore * 0.8 + sourceRisk * 0.2, 0, 1);
  const humanLikelihood = clamp(1 - aiLikelihood, 0, 1);

  let label: AnalyzeResponse["label"] = "Real";
  let mode: AnalyzeResponse["mode"] = "Uncertain";
  let explanation = "Offline heuristic analysis only; connect to internet for higher-confidence scoring.";

  if (riskScore <= 0.35) {
    label = "Real";
    mode = "Likely Real";
    explanation = "Offline heuristic found low-risk language patterns and acceptable source signals.";
  } else if (riskScore >= 0.65) {
    label = aiLikelihood >= fakeNewsLikelihood ? "AI" : "Fake";
    mode = "Likely Misleading";
    explanation = "Offline heuristic detected high-risk linguistic/source patterns.";
  } else {
    label = fakeNewsLikelihood >= 0.5 ? "Fake" : "AI";
    mode = "Uncertain";
  }

  return {
    label,
    mode,
    confidence: Number(confidence.toFixed(2)),
    riskScore: Number(riskScore.toFixed(2)),
    aiLikelihood: Number(aiLikelihood.toFixed(2)),
    fakeNewsLikelihood: Number(fakeNewsLikelihood.toFixed(2)),
    humanLikelihood: Number(humanLikelihood.toFixed(2)),
    explanation,
    sourceVerification: {
      trustedMatchPercent,
      matchedTrustedSources,
      checkedSources: claimedSources.map(normalizeDomain),
      verifiedAgainstCatalog: trustedDomains
    },
    evidence: [
      {
        source: "offline-heuristic",
        trusted: trustedMatchPercent > 0,
        trustWeight: Number((trustedMatchPercent / 100).toFixed(2)),
        reason: "Offline fallback mode uses local language and source heuristics."
      }
    ],
    notes: [
      "Offline mode is heuristic and less accurate than backend/provider scoring.",
      "Reconnect internet to use provider-backed NLP and source verification enhancements."
    ]
  };
}
