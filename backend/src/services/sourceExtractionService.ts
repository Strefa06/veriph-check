import { trustedPhilippineSources } from "../data/trustedSources.js";

const URL_REGEX = /https?:\/\/[^\s)]+|www\.[^\s)]+/gi;

const sourceKeywordAliases: Array<{ keyword: string; domain: string }> = [
  { keyword: "official gazette", domain: "officialgazette.gov.ph" },
  { keyword: "department of health", domain: "doh.gov.ph" },
  { keyword: "doh", domain: "doh.gov.ph" },
  { keyword: "dost", domain: "dost.gov.ph" },
  { keyword: "pna", domain: "pna.gov.ph" },
  { keyword: "comelec", domain: "comelec.gov.ph" },
  { keyword: "neda", domain: "neda.gov.ph" },
  { keyword: "bangko sentral", domain: "bsp.gov.ph" },
  { keyword: "bsp", domain: "bsp.gov.ph" },
  { keyword: "vera files", domain: "verafiles.org" },
  { keyword: "tsek", domain: "tsek.ph" },
  { keyword: "rappler", domain: "rappler.com" },
  { keyword: "factsfirst", domain: "factsfirst.ph" },
  { keyword: "pressone", domain: "pressone.ph" },
  { keyword: "philstar", domain: "philstar.com" },
  { keyword: "inquirer", domain: "inquirer.net" },
  { keyword: "abs-cbn news", domain: "news.abs-cbn.com" },
  { keyword: "abs-cbn", domain: "news.abs-cbn.com" },
  { keyword: "manila bulletin", domain: "mb.com.ph" },
  { keyword: "manila times", domain: "manilatimes.net" },
  { keyword: "businessworld", domain: "bworldonline.com" },
  { keyword: "news5", domain: "news5.com.ph" },
  { keyword: "sunstar", domain: "sunstar.com.ph" },
  { keyword: "mindanews", domain: "mindanews.com" },
  { keyword: "cnn philippines", domain: "cnnphilippines.com" },
  { keyword: "gma news", domain: "gmanetwork.com" },
  { keyword: "gmanews", domain: "gmanews.tv" }
];

export function normalizeDomain(source: string): string {
  return source
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .toLowerCase();
}

export function extractSourceDomainsFromContent(content: string): string[] {
  const domains = new Set<string>();

  const urlMatches = content.match(URL_REGEX) ?? [];
  for (const match of urlMatches) {
    const domain = normalizeDomain(match);
    if (domain.length > 3) {
      domains.add(domain);
    }
  }

  const lower = content.toLowerCase();
  for (const alias of sourceKeywordAliases) {
    if (lower.includes(alias.keyword)) {
      domains.add(alias.domain);
    }
  }

  return Array.from(domains);
}

export function mergeClaimedAndExtractedSources(
  claimedSources: string[],
  content: string
): string[] {
  const normalizedClaimed = claimedSources
    .map((source) => normalizeDomain(source))
    .filter(Boolean);

  const extracted = extractSourceDomainsFromContent(content);
  return Array.from(new Set([...normalizedClaimed, ...extracted]));
}

export function mapDomainsToTrustedSourceNames(domains: string[]): string[] {
  return Array.from(
    new Set(
      domains
        .map((domain) => {
          const trusted = trustedPhilippineSources.find(
            (source) => domain === source.domain || domain.endsWith(`.${source.domain}`)
          );
          return trusted?.name;
        })
        .filter((value): value is string => Boolean(value))
    )
  );
}
