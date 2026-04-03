const URL_REGEX = /https?:\/\/[^\s)]+|www\.[^\s)]+/gi;

const trustedDomains = [
  "officialgazette.gov.ph",
  "doh.gov.ph",
  "psa.gov.ph",
  "dost.gov.ph",
  "pna.gov.ph",
  "verafiles.org",
  "rappler.com",
  "factsfirst.ph",
  "pressone.ph",
  "philstar.com",
  "inquirer.net",
  "news.abs-cbn.com",
  "gmanetwork.com",
  "gmanews.tv"
];

const sourceKeywordAliases: Array<{ keyword: string; domain: string }> = [
  { keyword: "official gazette", domain: "officialgazette.gov.ph" },
  { keyword: "department of health", domain: "doh.gov.ph" },
  { keyword: "doh", domain: "doh.gov.ph" },
  { keyword: "dost", domain: "dost.gov.ph" },
  { keyword: "pna", domain: "pna.gov.ph" },
  { keyword: "vera files", domain: "verafiles.org" },
  { keyword: "rappler", domain: "rappler.com" },
  { keyword: "factsfirst", domain: "factsfirst.ph" },
  { keyword: "philstar", domain: "philstar.com" },
  { keyword: "inquirer", domain: "inquirer.net" },
  { keyword: "abs-cbn", domain: "news.abs-cbn.com" },
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

export function extractSourceDomains(content: string): string[] {
  const domains = new Set<string>();

  const links = content.match(URL_REGEX) ?? [];
  for (const link of links) {
    const domain = normalizeDomain(link);
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

export function mergeSourceDomains(...lists: string[][]): string[] {
  return Array.from(
    new Set(
      lists
        .flat()
        .map((value) => normalizeDomain(value))
        .filter(Boolean)
    )
  );
}

export function detectTrustedSourceMatches(domains: string[]): string[] {
  const normalized = domains.map((value) => normalizeDomain(value));
  return Array.from(
    new Set(
      normalized.filter((domain) =>
        trustedDomains.some((trusted) => domain === trusted || domain.endsWith(`.${trusted}`))
      )
    )
  );
}
