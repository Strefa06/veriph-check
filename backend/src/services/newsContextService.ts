import { trustedPhilippineSources } from "../data/trustedSources.js";
import { normalizeDomain } from "./sourceExtractionService.js";

type HeadlineMatch = {
  title: string;
  domain: string;
  score: number;
  pubDate?: string;
};

export type NewsContextEnrichment = {
  inferredSources: string[];
  matchedHeadlines: string[];
  notes: string[];
  strongestMatchScore: number;
};

const GOOGLE_NEWS_RSS_BASE = "https://news.google.com/rss/search";
const FETCH_TIMEOUT_MS = 3200;
const MAX_ITEMS = 24;
const MIN_MATCH_SCORE = 0.56;

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

function normalizeText(value: string): string {
  return decodeEntities(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function extractItems(rss: string): Array<{ title: string; link: string; pubDate?: string }> {
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const items: Array<{ title: string; link: string; pubDate?: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(rss)) !== null && items.length < MAX_ITEMS) {
    const block = match[1] || "";
    const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);

    const title = decodeEntities((titleMatch?.[1] || titleMatch?.[2] || "").trim());
    const link = decodeEntities((linkMatch?.[1] || "").trim());

    if (!title || !link) continue;

    items.push({
      title,
      link,
      pubDate: pubDateMatch?.[1] ? decodeEntities(pubDateMatch[1].trim()) : undefined
    });
  }

  return items;
}

function buildSearchQuery(claim: string): string {
  const top = tokenize(claim).slice(0, 12).join(" ");
  return top || claim.slice(0, 120);
}

function isTrustedDomain(domain: string): boolean {
  const normalized = normalizeDomain(domain);
  return trustedPhilippineSources.some(
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
      inferredSources: [],
      matchedHeadlines: [],
      notes: [],
      strongestMatchScore: 0
    };
  }

  const query = buildSearchQuery(trimmed);
  const rssUrl = `${GOOGLE_NEWS_RSS_BASE}?q=${encodeURIComponent(query)}&hl=en-PH&gl=PH&ceid=PH:en`;
  const rss = await fetchRss(rssUrl);

  if (!rss) {
    return {
      inferredSources: [],
      matchedHeadlines: [],
      notes: [],
      strongestMatchScore: 0
    };
  }

  const items = extractItems(rss);
  const candidates: HeadlineMatch[] = [];

  for (const item of items) {
    const domain = normalizeDomain(item.link);
    if (!isTrustedDomain(domain)) continue;

    const score = jaccardSimilarity(trimmed, item.title);
    if (score >= MIN_MATCH_SCORE) {
      candidates.push({
        title: item.title,
        domain,
        score,
        pubDate: item.pubDate
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const top = candidates.slice(0, 3);
  const inferredSources = Array.from(new Set(top.map((item) => item.domain)));
  const matchedHeadlines = top.map((item) => item.title);
  const strongest = top[0]?.score ?? 0;

  const notes: string[] = [];
  if (top.length > 0) {
    notes.push(
      `Matched ${top.length} trusted-source headline(s) from PH news feeds (best similarity ${(strongest * 100).toFixed(0)}%).`
    );
    const ageNote = toAgeNote(top[0].pubDate);
    if (ageNote) {
      notes.push(ageNote);
    }
  }

  return {
    inferredSources,
    matchedHeadlines,
    notes,
    strongestMatchScore: strongest
  };
}
