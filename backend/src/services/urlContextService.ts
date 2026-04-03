import { trustedPhilippineSources } from "../data/trustedSources.js";
import { normalizeDomain } from "./sourceExtractionService.js";

type UrlContextEnrichment = {
  appendedText: string;
  inferredSources: string[];
  notes: string[];
};

const URL_REGEX = /https?:\/\/[^\s)\]}>"']+/gi;
const MAX_URLS = 2;
const FETCH_TIMEOUT_MS = 3500;

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function readMeta(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, "i")
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return stripHtml(match[1]).slice(0, 280);
    }
  }

  return "";
}

function readTitle(html: string): string {
  const og = readMeta(html, "og:title");
  if (og) return og;

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    return stripHtml(titleMatch[1]).slice(0, 280);
  }

  return "";
}

function readPublishedDate(html: string): string {
  const keys = [
    "article:published_time",
    "datePublished",
    "publish-date",
    "pubdate",
    "parsely-pub-date"
  ];

  for (const key of keys) {
    const value = readMeta(html, key);
    if (value) {
      return value;
    }
  }

  const timeMatch = html.match(/<time[^>]+datetime=["']([^"']+)["'][^>]*>/i);
  return timeMatch?.[1] ? stripHtml(timeMatch[1]).slice(0, 80) : "";
}

function parseRecencyNote(dateRaw: string): string {
  const timestamp = Date.parse(dateRaw);
  if (Number.isNaN(timestamp)) return "";

  const diffMs = Date.now() - timestamp;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "Publication date appears to be in the future; verify source timestamp.";
  if (diffDays <= 2) return "Article appears recent (published within the last 48 hours).";
  if (diffDays <= 30) return `Article appears recent (published about ${diffDays} day(s) ago).`;
  return `Article appears older (published about ${diffDays} day(s) ago).`;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VeriPH/1.0)",
        Accept: "text/html,application/xhtml+xml"
      }
    });

    if (!response.ok) return "";

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("text/html")) return "";

    const html = await response.text();
    return html.slice(0, 350000);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

export async function enrichClaimWithUrlContext(content: string): Promise<UrlContextEnrichment> {
  const urls = Array.from(new Set(content.match(URL_REGEX) ?? [])).slice(0, MAX_URLS);
  if (!urls.length) {
    return {
      appendedText: "",
      inferredSources: [],
      notes: []
    };
  }

  const inferredSources = new Set<string>();
  const appendedParts: string[] = [];
  const notes: string[] = [];

  for (const url of urls) {
    const normalized = normalizeDomain(url);
    if (normalized) {
      inferredSources.add(normalized);
    }

    const html = await fetchHtml(url);
    if (!html) continue;

    const title = readTitle(html);
    const description = readMeta(html, "description") || readMeta(html, "og:description");
    const published = readPublishedDate(html);

    if (title) {
      appendedParts.push(`Linked article headline: ${title}`);
    }
    if (description) {
      appendedParts.push(`Linked article summary: ${description}`);
    }

    if (published) {
      const recencyNote = parseRecencyNote(published);
      if (recencyNote) {
        notes.push(recencyNote);
      }
    }

    const lowerHtml = html.toLowerCase();
    for (const source of trustedPhilippineSources) {
      if (lowerHtml.includes(source.domain.toLowerCase())) {
        inferredSources.add(source.domain);
      }
    }
  }

  return {
    appendedText: appendedParts.join(" ").slice(0, 1800),
    inferredSources: Array.from(inferredSources),
    notes
  };
}
