import { trustedPhilippineSources } from "../data/trustedSources.js";
import { analyzeWithProvider } from "./providerNlpService.js";
import { mergeClaimedAndExtractedSources, normalizeDomain } from "./sourceExtractionService.js";
import { enrichClaimWithUrlContext } from "./urlContextService.js";

type AnalyzeInput = {
  type: "text" | "audio" | "video";
  content: string;
  claimedSources?: string[];
};

type Evidence = {
  source: string;
  trusted: boolean;
  trustWeight: number;
  reason: string;
  matchedSourceName?: string;
};

export type AnalyzeResult = {
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
  evidence: Evidence[];
  notes: string[];
};

const suspiciousPhrases = [
  "share now",
  "this is 100% true",
  "hidden by media",
  "urgent forward",
  "secret cure",
  "guaranteed"
];

const deathClaimVerbs = ["patay", "namatay", "pumanaw", "dead", "died", "passed away"];
const prominentPeople = [
  "duterte",
  "digong",
  "rodrigo duterte",
  "marcos",
  "bbm",
  "leni",
  "robredo",
  "sara duterte"
];

function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

function scoreContentRisk(content: string): number {
  const lower = content.toLowerCase();
  let score = 0.24;

  for (const phrase of suspiciousPhrases) {
    if (lower.includes(phrase)) {
      score += 0.12;
    }
  }

  if (!/[0-9]/.test(content) && content.length > 240) {
    score += 0.08;
  }

  if ((content.match(/!/g) || []).length > 3) {
    score += 0.1;
  }

  const mentionsDeathClaim = deathClaimVerbs.some((verb) => lower.includes(verb));
  const mentionsProminentPerson = prominentPeople.some((name) => lower.includes(name));
  if (mentionsDeathClaim && mentionsProminentPerson) {
    score += 0.38;
  }

  return clamp(score, 0, 1);
}

function evaluateSources(claimedSources: string[]): {
  evidence: Evidence[];
  sourceRisk: number;
  trustedMatchPercent: number;
  matchedTrustedSources: string[];
} {
  if (!claimedSources.length) {
    return {
      evidence: [
        {
          source: "No sources provided",
          trusted: false,
          trustWeight: 0,
          reason: "No link or publisher was provided for verification."
        }
      ],
      sourceRisk: 0.42,
      trustedMatchPercent: 0,
      matchedTrustedSources: []
    };
  }

  const evidence: Evidence[] = claimedSources.map((raw) => {
    const domain = normalizeDomain(raw);
    const trusted = trustedPhilippineSources.find(
      (s) => domain === s.domain || domain.endsWith(`.${s.domain}`)
    );

    if (trusted) {
      return {
        source: domain,
        trusted: true,
        trustWeight: trusted.trustWeight,
        reason: `Matched trusted PH source: ${trusted.name}`,
        matchedSourceName: trusted.name
      };
    }

    return {
      source: domain,
      trusted: false,
      trustWeight: 0.45,
      reason: "Source not in trusted PH source list."
    };
  });

  const avgTrust = evidence.reduce((acc, item) => acc + item.trustWeight, 0) / evidence.length;
  const sourceRisk = clamp(1 - avgTrust, 0, 1);
  const trustedCount = evidence.filter((item) => item.trusted).length;
  const trustedMatchPercent = Math.round((trustedCount / evidence.length) * 100);
  const matchedTrustedSources = Array.from(
    new Set(evidence.map((item) => item.matchedSourceName).filter((name): name is string => Boolean(name)))
  );

  return { evidence, sourceRisk, trustedMatchPercent, matchedTrustedSources };
}

export function analyzeClaim(input: AnalyzeInput): AnalyzeResult {
  const consolidatedSources = mergeClaimedAndExtractedSources(input.claimedSources ?? [], input.content);
  const lowerContent = input.content.toLowerCase();
  const contentRisk = scoreContentRisk(input.content);
  const { evidence, sourceRisk, trustedMatchPercent, matchedTrustedSources } = evaluateSources(
    consolidatedSources
  );

  let modalityRisk = 0.25;
  if (input.type === "audio") {
    modalityRisk = 0.35;
  }
  if (input.type === "video") {
    modalityRisk = 0.42;
  }

  let riskScore = clamp(contentRisk * 0.45 + sourceRisk * 0.4 + modalityRisk * 0.15, 0, 1);
  const hasDeathClaim = deathClaimVerbs.some((verb) => lowerContent.includes(verb));
  const hasProminentPerson = prominentPeople.some((name) => lowerContent.includes(name));
  const deathHoaxPattern = hasDeathClaim && hasProminentPerson;
  const hasStrongTrustedCoverage = trustedMatchPercent >= 50;
  const lowManipulationRisk = contentRisk <= 0.42;
  if (hasStrongTrustedCoverage && lowManipulationRisk && !deathHoaxPattern) {
    riskScore = Math.min(riskScore, 0.32);
  }
  if (deathHoaxPattern && trustedMatchPercent < 40) {
    riskScore = Math.max(riskScore, 0.8);
  }

  const confidence = clamp(1 - riskScore, 0, 1);
  let aiLikelihood = clamp(riskScore * 0.88 + modalityRisk * 0.12, 0, 1);
  let fakeNewsLikelihood = clamp(riskScore * 0.82 + (1 - trustedMatchPercent / 100) * 0.18, 0, 1);
  if (deathHoaxPattern && trustedMatchPercent < 40) {
    fakeNewsLikelihood = Math.max(fakeNewsLikelihood, 0.9);
    aiLikelihood = Math.min(aiLikelihood, 0.45);
  }
  const humanLikelihood = clamp(1 - aiLikelihood, 0, 1);

  let label: AnalyzeResult["label"] = "Real";
  let mode: AnalyzeResult["mode"] = "Uncertain";
  let explanation = "";

  if (deathHoaxPattern && trustedMatchPercent < 40) {
    label = "Fake";
    mode = "Likely Misleading";
    explanation =
      "High-risk claim detected: a public-figure death statement without credible source backing. Treat as likely fake until verified by official outlets.";
  } else if (riskScore <= 0.35) {
    label = "Real";
    mode = "Likely Real";
    if (trustedMatchPercent > 60) {
      explanation = `Content appears authentic based on trusted source alignment (${trustedMatchPercent}% match rate) and natural language patterns.`;
    } else if (contentRisk < 0.4) {
      explanation =
        "Content has natural language patterns and lacks red flags typical of AI-generated text.";
    } else {
      explanation =
        "No strong indicators of misinformation detected, but verify independently for critical claims.";
    }
  } else if (riskScore >= 0.65) {
    label = aiLikelihood >= fakeNewsLikelihood ? "AI" : "Fake";
    mode = "Likely Misleading";
    if (trustedMatchPercent < 20) {
      explanation =
        "Content lacks credible source backing and shows patterns commonly found in misinformation.";
    } else if (aiLikelihood > 0.7) {
      explanation =
        "High likelihood of AI-generated or synthesized content based on linguistic anomalies and media inconsistencies.";
    } else {
      explanation =
        "Multiple risk indicators detected: unnatural phrasing, lack of trusted sources, or urgent language patterns.";
    }
  } else {
    label = fakeNewsLikelihood >= 0.5 ? "Fake" : "AI";
    mode = "Uncertain";
    explanation =
      "Mixed signals detected. Recommend verifying through multiple trusted sources before sharing.";
  }

  const notes = [
    "This score is advisory, not a final fact-check verdict.",
    "Use at least one official Philippine government source for strong confidence.",
    "For viral videos, combine transcript analysis with frame-level deepfake tools.",
    "AI likelihood is a risk indicator, not conclusive forensic proof."
  ];

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
      checkedSources: consolidatedSources,
      verifiedAgainstCatalog: Array.from(new Set(trustedPhilippineSources.map((source) => source.name)))
    },
    evidence,
    notes
  };
}

export async function analyzeClaimWithProvider(input: AnalyzeInput): Promise<AnalyzeResult> {
  const enrichment = await enrichClaimWithUrlContext(input.content);
  const enrichedContent = [input.content, enrichment.appendedText].filter(Boolean).join("\n\n").slice(0, 7000);
  const enrichedSources = mergeClaimedAndExtractedSources(
    [...(input.claimedSources ?? []), ...enrichment.inferredSources],
    enrichedContent
  );

  const local = analyzeClaim({
    ...input,
    content: enrichedContent,
    claimedSources: enrichedSources
  });

  try {
    const provider = await analyzeWithProvider(enrichedContent, input.type, enrichedSources);
    if (!provider) {
      return {
        ...local,
        notes: [...enrichment.notes, ...local.notes]
      };
    }

    const mode: AnalyzeResult["mode"] =
      provider.label === "Real"
        ? "Likely Real"
        : provider.confidence >= 0.65
          ? "Likely Misleading"
          : "Uncertain";

    const localStrongReal =
      local.label === "Real" &&
      local.sourceVerification.trustedMatchPercent >= 50 &&
      local.riskScore <= 0.38;

    if (localStrongReal && provider.label !== "Real" && provider.confidence < 0.75) {
      return {
        ...local,
        notes: [
          "Provider output conflicted with strong trusted-source signals; local trusted-source decision retained.",
          ...local.notes
        ]
      };
    }

    return {
      ...local,
      label: provider.label,
      mode,
      confidence: Number(Math.max(provider.confidence, localStrongReal && provider.label === "Real" ? 0.78 : 0).toFixed(2)),
      aiLikelihood: Number(provider.aiLikelihood.toFixed(2)),
      fakeNewsLikelihood: Number(provider.fakeNewsLikelihood.toFixed(2)),
      humanLikelihood: Number((1 - provider.aiLikelihood).toFixed(2)),
      explanation: provider.explanation,
      notes: [
        ...enrichment.notes,
        `Primary inference provider: ${provider.provider}`,
        ...local.notes
      ]
    };
  } catch {
    return {
      ...local,
      notes: [...enrichment.notes, ...local.notes]
    };
  }
}
