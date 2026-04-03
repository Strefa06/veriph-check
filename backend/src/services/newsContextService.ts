import { trustedPhilippineSources } from "../data/trustedSources.js";
import { normalizeDomain } from "./sourceExtractionService.js";

type MatchProvider = "newsapi" | "gnews" | "rss";

type RawNewsItem = {
  title: string;
  url: string;
  sourceName: string;
  timestamp?: string;
  provider: MatchProvider;
};

export type NewsMatch = {
  headline: string;
  sourceName: string;
  url: string;
  timestamp?: string;
  domain: string;
  provider: MatchProvider;
  similarity: number;
  trusted: boolean;
  reliability: number;
};

export type NewsContextEnrichment = {
  matchedSources: NewsMatch[];
  rssMatches: NewsMatch[];
  inferredSources: string[];
  matchedHeadlines: string[];
  matchedLinks: string[];
  trustScore: number;
  explanation: string;
  usedPrimaryApis: boolean;
  primaryApiErrors: string[];
  notes: string[];
  strongestMatchScore: number;
};

const GOOGLE_NEWS_RSS_BASE = "https://news.google.com/rss/search";
const NEWSAPI_BASE = "https://newsapi.org/v2/everything";
const GNEWS_BASE = "https://gnews.io/api/v4/search";
const FETCH_TIMEOUT_MS = 3200;
const MAX_ITEMS = 30;
const MIN_MATCH_SCORE_STRONG = 0.5;
const MIN_MATCH_SCORE_WEAK = 0.35;
const MIN_MATCH_SCORE_PARTIAL = 0.3;

const trustedDomainAliases: Record<string, string> = {
  "abs-cbnnews.com": "news.abs-cbn.com",
  "www.abs-cbnnews.com": "news.abs-cbn.com",
  "www.gmanetwork.com": "gmanetwork.com",
  "www.gmanews.tv": "gmanews.tv",
  "www.inquirer.net": "inquirer.net",
  "www.rappler.com": "rappler.com"
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value: string): string {
  return decodeEntities(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDomainForTrust(domain: string): string {
  const normalized = normalizeDomain(domain);
  if (trustedDomainAliases[normalized]) {
    return trustedDomainAliases[normalized];
  }
  return normalized;
}

function tokenize(value: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "to",
    "for",
    "of",
    "in",
    "on",
    "and",
    "with",
    "by",
    "is",
    "are",
    "at",
    "from",
    "that",
    "this",
    "it",
    "be",
    "or",
    "as",
    "will",
    "was",
    "were",
    "than",
    "about",
    "into"
  ]);

  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

function jaccardSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));

  if (!leftTokens.size || !rightTokens.size) return 0;

  let intersection = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  });

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function extractItems(rss: string): RawNewsItem[] {
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const items: RawNewsItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(rss)) !== null && items.length < MAX_ITEMS) {
    const block = match[1] || "";
    const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const sourceNameMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    const sourceUrlMatch = block.match(/<source[^>]*url=["']([^"']+)["'][^>]*>/i);

    const title = decodeEntities((titleMatch?.[1] || titleMatch?.[2] || "").trim());
    const link = decodeEntities((linkMatch?.[1] || "").trim());
    const sourceName = decodeEntities((sourceNameMatch?.[1] || "").trim());
    const sourceUrl = decodeEntities((sourceUrlMatch?.[1] || "").trim());

    if (!title || !link) continue;

    let normalizedSourceName = sourceName;
    if (!normalizedSourceName && title.includes(" - ")) {
      const maybeSource = title.split(" - ").pop() || "";
      if (maybeSource && maybeSource.length <= 40) {
        normalizedSourceName = maybeSource;
      }
    }

    const resolvedUrl = sourceUrl || link;

    items.push({
      title,
      url: resolvedUrl,
      sourceName: normalizedSourceName || normalizeDomain(resolvedUrl),
      timestamp: pubDateMatch?.[1] ? decodeEntities(pubDateMatch[1].trim()) : undefined,
      provider: "rss"
    });
  }

  return items;
}

function buildSearchQuery(claim: string): string {
  const top = tokenize(claim).slice(0, 12).join(" ");
  return top || claim.slice(0, 120);
}

function getTrustedSourceByDomain(domain: string) {
  const normalized = normalizeDomainForTrust(domain);
  return trustedPhilippineSources.find(
    (source) => normalized === source.domain || normalized.endsWith(`.${source.domain}`)
  );
}

async function fetchRss(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VeriPH/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml"
      }
    });

    if (!response.ok) return "";
    return (await response.text()).slice(0, 450000);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VeriPH/1.0)",
        Accept: "application/json",
        ...(headers ?? {})
      }
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchNewsApiItems(query: string): Promise<{ items: RawNewsItem[]; error?: string }> {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    return { items: [], error: "NEWSAPI_KEY missing" };
  }

  const url = `${NEWSAPI_BASE}?q=${encodeURIComponent(query)}&language=en&pageSize=20&sortBy=publishedAt&searchIn=title,description`;
  const data = (await fetchJson(url, { "X-Api-Key": apiKey })) as
    | {
        status?: string;
        articles?: Array<{ title?: string; url?: string; publishedAt?: string }>;
      }
    | null;

  if (!data || data.status !== "ok" || !Array.isArray(data.articles)) {
    return { items: [], error: "NewsAPI request failed" };
  }

  const items = data.articles
    .map((article) => ({
      title: decodeEntities((article.title || "").trim()),
      url: decodeEntities((article.url || "").trim()),
      sourceName: normalizeDomain(decodeEntities((article.url || "").trim())),
      timestamp: article.publishedAt,
      provider: "newsapi" as const
    }))
    .filter((item) => item.title && item.url)
    .slice(0, MAX_ITEMS);

  return { items };
}

async function fetchGNewsItems(query: string): Promise<{ items: RawNewsItem[]; error?: string }> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    return { items: [], error: "GNEWS_API_KEY missing" };
  }

  const url = `${GNEWS_BASE}?q=${encodeURIComponent(query)}&lang=en&country=ph&max=20&token=${encodeURIComponent(apiKey)}`;
  const data = (await fetchJson(url)) as
    | {
        articles?: Array<{
          title?: string;
          url?: string;
          publishedAt?: string;
          source?: { name?: string; url?: string };
        }>;
      }
    | null;

  if (!data || !Array.isArray(data.articles)) {
    return { items: [], error: "GNews request failed" };
  }

  const items = data.articles
    .map((article) => ({
      title: decodeEntities((article.title || "").trim()),
      url: decodeEntities((article.url || "").trim()),
      sourceName: decodeEntities((article.source?.name || "").trim()) || normalizeDomain(article.source?.url || article.url || ""),
      timestamp: article.publishedAt,
      provider: "gnews" as const
    }))
    .filter((item) => item.title && item.url)
    .slice(0, MAX_ITEMS);

  return { items };
}

function recencyScore(timestamp?: string): number {
  if (!timestamp) return 0.45;
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return 0.45;

  const diffHours = Math.max(0, (Date.now() - t) / (1000 * 60 * 60));
  if (diffHours <= 24) return 1;
  if (diffHours <= 72) return 0.85;
  if (diffHours <= 24 * 7) return 0.7;
  if (diffHours <= 24 * 30) return 0.5;
  return 0.3;
}

function computeTrustScore(matches: NewsMatch[]): number {
  if (!matches.length) return 0;

  const trustedCount = matches.filter((item) => item.trusted).length;
  const trustedRatio = trustedCount / matches.length;
  const avgReliability =
    matches.reduce((sum, item) => sum + item.reliability / 100, 0) / matches.length;
  const avgRecency =
    matches.reduce((sum, item) => sum + recencyScore(item.timestamp), 0) / matches.length;

  const blended = trustedRatio * 0.45 + avgReliability * 0.35 + avgRecency * 0.2;
  return Math.round(Math.max(0, Math.min(1, blended)) * 100);
}

function buildTrustExplanation(trustScore: number, strongest: number, matches: NewsMatch[]): string {
  if (!matches.length) {
    return "No strong matching PH news records were found from APIs/RSS for this text claim.";
  }

  if (trustScore >= 70 && strongest >= MIN_MATCH_SCORE_WEAK) {
    return "Claim is likely real because it aligns with recent trusted PH news matches with strong source reliability.";
  }
  if (trustScore >= 45 && strongest >= MIN_MATCH_SCORE_PARTIAL) {
    return "Claim is uncertain: there are partial matches in PH news sources, but evidence is not strong enough for high confidence.";
  }
  return "Claim is uncertain or potentially misleading due to weak trusted-source alignment and low news match confidence.";
}

function mapToNewsMatches(items: RawNewsItem[], claim: string): NewsMatch[] {
  const matches: NewsMatch[] = [];

  for (const item of items) {
    const domain = normalizeDomainForTrust(item.url);
    const trusted = getTrustedSourceByDomain(domain);
    const similarity = jaccardSimilarity(claim, item.title);
    if (similarity < MIN_MATCH_SCORE_PARTIAL) continue;

    matches.push({
      headline: item.title,
      sourceName: item.sourceName || (trusted?.name ?? domain),
      url: item.url,
      timestamp: item.timestamp,
      domain,
      provider: item.provider,
      similarity: Number(similarity.toFixed(3)),
      trusted: Boolean(trusted),
      reliability: Math.round((trusted?.trustWeight ?? 0.45) * 100)
    });
  }

  return matches.sort((a, b) => b.similarity - a.similarity).slice(0, 6);
}

function toAgeNote(pubDate?: string): string {
  if (!pubDate) return "";
  const timestamp = Date.parse(pubDate);
  if (Number.isNaN(timestamp)) return "";

  const diffHours = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60));
  if (diffHours < 0) return "Matched article has a future timestamp; verify publication time.";
  if (diffHours <= 24) return "Matched trusted-source article appears very recent (within 24 hours).";
  if (diffHours <= 24 * 7) return "Matched trusted-source article appears recent (within 7 days).";
  return "Matched trusted-source article appears older than 7 days.";
}

export async function enrichClaimWithTrustedNews(claim: string): Promise<NewsContextEnrichment> {
  const trimmed = claim.trim();
  if (trimmed.length < 20) {
    return {
      matchedSources: [],
      rssMatches: [],
      inferredSources: [],
      matchedHeadlines: [],
      matchedLinks: [],
      trustScore: 0,
      explanation: "Claim is too short for reliable external news matching.",
      usedPrimaryApis: false,
      primaryApiErrors: [],
      notes: [],
      strongestMatchScore: 0
    };
  }

  const query = buildSearchQuery(trimmed);

  const hasPrimaryKeys = Boolean(process.env.NEWSAPI_KEY || process.env.GNEWS_API_KEY);
  let usedPrimaryApis = false;
  const primaryApiErrors: string[] = [];
  let primaryItems: RawNewsItem[] = [];

  if (hasPrimaryKeys) {
    const [newsApiResult, gnewsResult] = await Promise.all([
      fetchNewsApiItems(query),
      fetchGNewsItems(query)
    ]);

    if (newsApiResult.error && newsApiResult.error !== "NEWSAPI_KEY missing") {
      primaryApiErrors.push(newsApiResult.error);
    }
    if (gnewsResult.error && gnewsResult.error !== "GNEWS_API_KEY missing") {
      primaryApiErrors.push(gnewsResult.error);
    }

    primaryItems = [...newsApiResult.items, ...gnewsResult.items];
    usedPrimaryApis = primaryItems.length > 0;
  }

  let rssItems: RawNewsItem[] = [];
  const rssUrl = `${GOOGLE_NEWS_RSS_BASE}?q=${encodeURIComponent(query)}&hl=en-PH&gl=PH&ceid=PH:en`;
  if (!usedPrimaryApis) {
    const rss = await fetchRss(rssUrl);
    rssItems = rss ? extractItems(rss) : [];
  }

  const selectedItems = usedPrimaryApis ? primaryItems : rssItems;

  if (!selectedItems.length) {
    return {
      matchedSources: [],
      rssMatches: [],
      inferredSources: [],
      matchedHeadlines: [],
      matchedLinks: [],
      trustScore: 0,
      explanation: "No usable results from primary news APIs or RSS fallback.",
      usedPrimaryApis,
      primaryApiErrors,
      notes: [],
      strongestMatchScore: 0
    };
  }

  const dedupedItems = Array.from(
    new Map(
      selectedItems.map((item) => {
        const domain = normalizeDomain(item.url);
        return [`${normalizeText(item.title)}|${domain}`, item];
      })
    ).values()
  );
  const matches = mapToNewsMatches(dedupedItems, trimmed);
  const strongest = matches[0]?.similarity ?? 0;
  const matchedSources = matches;
  const rssMatches = matches.filter((item) => item.provider === "rss");
  const inferredSources = Array.from(
    new Set(matches.filter((item) => item.similarity >= MIN_MATCH_SCORE_WEAK).map((item) => item.domain))
  );
  const matchedHeadlines = matches.slice(0, 3).map((item) => item.headline);
  const matchedLinks = matches.slice(0, 3).map((item) => item.url);
  const trustScore = computeTrustScore(matches);
  const explanation = buildTrustExplanation(trustScore, strongest, matches);

  const notes: string[] = [];
  if (matches.length > 0) {
    if (strongest >= MIN_MATCH_SCORE_STRONG) {
      notes.push(
        `Matched ${matches.length} PH news headline(s) (best similarity ${(strongest * 100).toFixed(0)}%).`
      );
    } else if (strongest >= MIN_MATCH_SCORE_WEAK) {
      notes.push(
        `Found partial trusted-source headline match(es) from PH feeds (best similarity ${(strongest * 100).toFixed(0)}%).`
      );
    } else {
      notes.push(
        `Weak trusted-source lexical overlap detected from PH feeds (best similarity ${(strongest * 100).toFixed(0)}%).`
      );
    }
    if (usedPrimaryApis) {
      notes.push("Primary news APIs (NewsAPI/GNews) were used before RSS fallback.");
    } else {
      notes.push("Used Google News RSS fallback for PH filtering.");
    }
    const ageNote = toAgeNote(matches[0].timestamp);
    if (ageNote) {
      notes.push(ageNote);
    }
  }

  if (primaryApiErrors.length) {
    notes.push(`Primary API warnings: ${primaryApiErrors.join("; ")}`);
  }

  return {
    matchedSources,
    rssMatches,
    inferredSources,
    matchedHeadlines,
    matchedLinks,
    trustScore,
    explanation,
    usedPrimaryApis,
    primaryApiErrors,
    notes,
    strongestMatchScore: strongest
  };
}
