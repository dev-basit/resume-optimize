/**
 * Deterministic text matching used for keyword coverage and fact checking.
 * Designed to be conservative and explainable rather than clever.
 */

const ALIASES: Record<string, string[]> = {
  postgresql: ["postgres"],
  postgres: ["postgresql"],
  kubernetes: ["k8s"],
  k8s: ["kubernetes"],
  javascript: ["js", "ecmascript"],
  typescript: ["ts"],
  golang: ["go"],
  go: ["golang"],
  aws: ["amazonwebservices"],
  amazonwebservices: ["aws"],
  gcp: ["googlecloud", "googlecloudplatform"],
  googlecloud: ["gcp"],
  googlecloudplatform: ["gcp", "googlecloud"],
  azure: ["microsoftazure"],
  dotnet: ["net", "netcore", "aspnet", "aspnetcore"],
  net: ["dotnet"],
  csharp: ["c#"],
  "c#": ["csharp"],
  restapis: ["rest", "restful", "restfulapis", "restapi"],
  restapi: ["rest", "restful", "restfulapis", "restapis"],
  restful: ["rest", "restapi", "restapis"],
  restfulapis: ["rest", "restapi", "restapis", "restful"],
  cicd: ["ci", "continuousintegration", "continuousdelivery", "githubactions", "gitlabci", "jenkins", "circleci"],
  llm: ["llms", "largelanguagemodel", "largelanguagemodels"],
  llms: ["llm", "largelanguagemodels"],
  ml: ["machinelearning"],
  machinelearning: ["ml"],
  ai: ["artificialintelligence"],
  reactjs: ["react"],
  react: ["reactjs"],
  vuejs: ["vue"],
  vue: ["vuejs"],
  nextjs: ["next"],
  nodejs: ["node"],
  node: ["nodejs"],
  expressjs: ["express"],
  express: ["expressjs"],
  nestjs: ["nest"],
  mongodb: ["mongo"],
  springboot: ["spring"],
};

/** Lowercase, strip accents, and compact a term: "Node.js" -> "nodejs", "CI/CD" -> "cicd". */
export function compactKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/c#/g, "csharp")
    .replace(/\.net/g, "dotnet")
    .replace(/[^a-z0-9+]/g, "");
}

export interface TextIndex {
  compact: string;
  words: Set<string>;
}

export function buildTextIndex(text: string): TextIndex {
  const lowered = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/c#/g, "csharp")
    .replace(/\.net/g, "dotnet");
  const words = new Set(
    lowered
      .split(/[^a-z0-9+]+/)
      .filter(Boolean),
  );
  return { compact: compactKey(lowered), words };
}

function keyPresent(key: string, index: TextIndex): boolean {
  if (!key) return false;
  // Short keys ("go", "ai", "r", "c++") must match a whole word to avoid false positives.
  if (key.length <= 3) return index.words.has(key);
  return index.compact.includes(key);
}

/** True when a term (or a known alias) appears in the indexed text. */
export function containsTerm(term: string, index: TextIndex): boolean {
  const key = compactKey(term);
  if (keyPresent(key, index)) return true;
  if ((ALIASES[key] ?? []).some((alias) => keyPresent(compactKey(alias), index))) return true;

  // Multi-word phrases: accept when every significant word is present.
  const words = term
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map(compactKey)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  if (words.length > 1) {
    return words.every(
      (w) => keyPresent(w, index) || (ALIASES[w] ?? []).some((a) => keyPresent(compactKey(a), index)),
    );
  }
  return false;
}

const STOP_WORDS = new Set([
  "and",
  "or",
  "the",
  "of",
  "with",
  "for",
  "in",
  "to",
  "experience",
  "skills",
  "knowledge",
  "using",
  "based",
]);

const NUMBER_PATTERN = /(?<![A-Za-z0-9.])\$?\d[\d,]*(?:\.\d+)?\s*(?:%|\+|x\b|k\b|m\b|b\b|ms\b)?/gi;

/** Numeric figures (excluding 4-digit years) found in a piece of text. */
export function extractFigures(text: string): string[] {
  const figures = new Set<string>();
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const core = match[0].replace(/[$,\s%+]/g, "").replace(/[a-z]+$/i, "");
    if (!core) continue;
    if (/^(19|20)\d{2}$/.test(core)) continue; // years
    figures.add(core.replace(/\.0+$/, ""));
  }
  return [...figures];
}
