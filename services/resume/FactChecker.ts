import type { JobAnalysis, OptimizedContent, ResumeProfile } from "@/lib/schemas";
import type { FactCheckWarning } from "@/types/resume";
import { mentionsTerm, unsupportedTechnologies } from "./techTerms";
import { buildTextIndex, compactKey, containsTerm, extractFigures, type TextIndex } from "./textMatching";

/** Requirement categories that name concrete technologies (fabrication risk). */
const TECH_CATEGORIES = new Set([
  "language",
  "frontend",
  "backend",
  "database",
  "cloud",
  "devops",
  "ai_ml",
  "testing",
]);

/**
 * Technologies the job asks for that never appear in the base resume. These
 * are the terms a model is most tempted to slip into generated bullets.
 */
export function unsupportedJobTerms(job: JobAnalysis | undefined, sourceIndex: TextIndex): string[] {
  if (!job) return [];
  // Only concrete technologies; role titles and practices ("Agile", "mentoring") are not checked.
  const candidates = job.requirements
    .filter((r) => TECH_CATEGORIES.has(r.category))
    .map((r) => r.name)
    .filter((t) => t && t.split(/\s+/).length <= 3);

  const seen = new Set<string>();
  return candidates.filter((term) => {
    const key = compactKey(term);
    if (!key || key.length < 2 || seen.has(key)) return false;
    seen.add(key);
    return !containsTerm(term, sourceIndex);
  });
}

/**
 * Industry/domain terms the job mentions (e.g. "healthcare", "HIPAA", "fintech")
 * that the base resume never mentions. Claiming them would invent background.
 */
export function unsupportedDomainTerms(job: JobAnalysis | undefined, sourceIndex: TextIndex): string[] {
  if (!job) return [];
  const phrases = [job.domain, ...job.requirements.filter((r) => r.category === "domain").map((r) => r.name)];
  const STOP = new Set(["experience", "knowledge", "industry", "domain", "with", "and", "the", "plus", "data", "systems", "software", "background", "understanding", "familiarity", "preferred", "required"]);
  const terms = new Set<string>();
  for (const phrase of phrases) {
    for (const word of (phrase ?? "").split(/[^A-Za-z0-9+&-]+/)) {
      const w = word.trim();
      if (w.length < 4 || STOP.has(w.toLowerCase())) continue;
      if (!containsTerm(w, sourceIndex)) terms.add(w);
    }
  }
  return [...terms];
}

export interface SourceFacts {
  figures: Set<string>;
  unsupportedTerms: string[];
  sourceIndex: TextIndex;
}

export function buildSourceFacts(sourceText: string, sourceIndex: TextIndex, job?: JobAnalysis): SourceFacts {
  return {
    figures: new Set(extractFigures(sourceText)),
    unsupportedTerms: [...unsupportedJobTerms(job, sourceIndex), ...unsupportedDomainTerms(job, sourceIndex)],
    sourceIndex,
  };
}

/** Problems with a single generated sentence, judged against the base resume. */
export function sentenceProblems(text: string, facts: SourceFacts): { figures: string[]; terms: string[] } {
  const figures = extractFigures(text).filter((f) => !facts.figures.has(f));
  const terms = new Set(facts.unsupportedTerms.filter((t) => mentionsTerm(t, text)));
  for (const tech of unsupportedTechnologies(text, facts.sourceIndex)) terms.add(tech);
  return { figures, terms: [...terms] };
}

/**
 * Deterministic safety net on top of the prompts: flags content in the
 * generated resume that cannot be traced back to the base resume.
 */
export function checkOptimizedContent(
  content: OptimizedContent,
  sourceText: string,
  sourceIndex: TextIndex = buildTextIndex(sourceText),
  job?: JobAnalysis,
): FactCheckWarning[] {
  const facts = buildSourceFacts(sourceText, sourceIndex, job);
  const warnings: FactCheckWarning[] = [];

  const sentences = [
    content.professionalTitle,
    content.summary,
    ...content.experience.flatMap((e) => e.bullets),
    ...content.projects.flatMap((p) => p.bullets),
  ];

  const figures = new Set<string>();
  const terms = new Set<string>();
  for (const sentence of sentences) {
    const problems = sentenceProblems(sentence, facts);
    problems.figures.forEach((f) => figures.add(f));
    problems.terms.forEach((t) => terms.add(t));
  }

  for (const figure of figures) {
    warnings.push({
      kind: "metric",
      message: `The figure "${figure}" does not appear in your base resume. Verify it is accurate.`,
    });
  }
  for (const term of terms) {
    warnings.push({
      kind: "skill",
      message: `"${term}" is mentioned in the experience text but not in your base resume. Verify you have this experience.`,
    });
  }

  const seen = new Set<string>([...terms].map(compactKey));
  for (const skill of content.skillCategories.flatMap((c) => c.skills)) {
    const key = compactKey(skill);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!containsTerm(skill, sourceIndex)) {
      warnings.push({
        kind: "skill",
        message: `"${skill}" is listed as a skill but was not found in your base resume. Verify you have this experience.`,
      });
    }
  }

  return warnings;
}

/** Verify that employment facts extracted by the AI are present in the source text. */
export function checkEmploymentFacts(profile: ResumeProfile, sourceText: string): FactCheckWarning[] {
  const sourceCompact = compactKey(sourceText);
  const warnings: FactCheckWarning[] = [];
  for (const role of profile.experience) {
    for (const [label, value] of [
      ["Company", role.company],
      ["Job title", role.title],
    ] as const) {
      if (value && !sourceCompact.includes(compactKey(value))) {
        warnings.push({
          kind: "employment",
          message: `${label} "${value}" could not be matched exactly to your base resume. Check it before sending.`,
        });
      }
    }
  }
  return warnings;
}

const STOP_WORDS = new Set([
  "with", "using", "used", "from", "into", "that", "this", "their", "across", "through", "within", "while",
  "built", "developed", "designed", "implemented", "created", "worked", "work", "also", "over", "under",
]);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9+#.%]+/)
      .map((w) => w.replace(/^\.+|\.+$/g, ""))
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w)),
  );
}

/**
 * Bullets that do not closely correspond to any statement in the base resume:
 * reasonable elaborations the user should review before sending. A bullet
 * counts as documented if it carries a figure from the source or shares enough
 * vocabulary with a single source line.
 */
export function findElaborations(bullets: string[], sourceText: string): string[] {
  const sourceFigures = new Set(extractFigures(sourceText));
  const sourceLines = sourceText
    .split(/\n|(?<=[.;])\s+(?=[A-Z•\-])/)
    .map(significantWords)
    .filter((w) => w.size >= 3);

  return bullets.filter((bullet) => {
    if (extractFigures(bullet).some((f) => sourceFigures.has(f))) return false;
    const words = significantWords(bullet);
    if (words.size === 0) return false;
    let best = 0;
    for (const line of sourceLines) {
      let shared = 0;
      for (const w of words) if (line.has(w)) shared++;
      // Share of the source line's content that the bullet carries over.
      best = Math.max(best, shared / Math.min(line.size, words.size));
    }
    return best < 0.5;
  });
}
