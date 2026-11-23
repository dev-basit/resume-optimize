import "server-only";
import { RESUME_EXPANSION_SYSTEM, resumeExpansionUser, type ExpansionRequest } from "@/lib/prompts";
import {
  ResumeExpansionSchema,
  type JobAnalysis,
  type MatchAnalysis,
  type OptimizedContent,
  type ResumeProfile,
} from "@/lib/schemas";
import { measurePdf, type PdfMeasurement } from "@/services/pdf/measure";
import {
  RESUME_MARGINS,
  generateResumePdf,
  typographyFor,
  type ResumeTypography,
} from "@/services/pdf/ResumePDFGenerator";
import type { AIProvider } from "@/types/ai";
import type { FactCheckWarning, ResumeDocument } from "@/types/resume";
import { normalizeBullet, normalizeSummary } from "./bulletNormalizer";
import { buildSourceFacts, checkOptimizedContent, sentenceProblems, type SourceFacts } from "./FactChecker";
import {
  BULLET_RANGE,
  PROJECT_BULLET_RANGE,
  assembleResume,
  roleRelevance,
  type Relevance,
} from "./ResumeOptimizer";
import { compactKey, extractFigures, type TextIndex } from "./textMatching";

/** Page two counts as "complete" once this share of it is used. */
const TARGET_LAST_PAGE_FILL = 0.85;
const TARGET_PAGES = 2;
const MAX_EXPANSION_ROUNDS = 4;
const MAX_TRIM_ROUNDS = 30;
const MAX_BULLETS_PER_EXPANSION = 14;

/**
 * Upper bullet limits used only when the normal limits are exhausted and the
 * resume is still short (few roles in the base resume). Still within 5–8.
 */
const EXTENDED_MAX: Record<Relevance, number> = { high: 8, medium: 8, low: 5 };

/**
 * Trim floors, applied tier by tier. Low-relevance roles and projects are cut
 * first, so the most relevant roles keep their detail as long as possible.
 */
const TRIM_TIERS: { experience: Record<Relevance, number>; project: number }[] = [
  { experience: { high: 6, medium: 4, low: 2 }, project: 1 },
  { experience: { high: 5, medium: 3, low: 1 }, project: 1 },
  { experience: { high: 4, medium: 2, low: 1 }, project: 0 },
  { experience: { high: 3, medium: 1, low: 1 }, project: 0 },
];

interface Rendered {
  pdf: Uint8Array;
  typography: ResumeTypography;
  measurement: PdfMeasurement;
}

export interface FittedResume {
  resume: ResumeDocument;
  content: OptimizedContent;
  pdf: Uint8Array;
  measurement: PdfMeasurement;
  typography: ResumeTypography;
  warnings: FactCheckWarning[];
  bulletsAdded: number;
  bulletsTrimmed: number;
  bulletsRejected: number;
}

async function render(resume: ResumeDocument, density: number): Promise<Rendered> {
  const typography = typographyFor(density);
  const pdf = new Uint8Array(await generateResumePdf(resume, typography));
  const measurement = await measurePdf(pdf, RESUME_MARGINS);
  return { pdf, typography, measurement };
}

/**
 * Pick the most comfortable typography (within the readable size ranges) that
 * still fits in two pages. Larger type fills page two with real text instead of
 * blank space; smaller type is used only when content needs the room.
 */
async function fitTypography(resume: ResumeDocument): Promise<Rendered & { overflow: boolean }> {
  const compact = await render(resume, 0);
  if (compact.measurement.pages > TARGET_PAGES) return { ...compact, overflow: true };

  const comfortable = await render(resume, 1);
  if (comfortable.measurement.pages <= TARGET_PAGES) return { ...comfortable, overflow: false };

  let best = compact;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 5; i++) {
    const mid = (lo + hi) / 2;
    const attempt = await render(resume, mid);
    if (attempt.measurement.pages <= TARGET_PAGES) {
      best = attempt;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return { ...best, overflow: false };
}

/**
 * Height of an average bullet at the given typography, estimated from the
 * real bullet lengths (Carlito averages ~0.47em per character).
 */
function bulletHeight(t: ResumeTypography, content: OptimizedContent, pageWidth: number): number {
  const bullets = [...content.experience.flatMap((e) => e.bullets), ...content.projects.flatMap((p) => p.bullets)];
  const textWidth = pageWidth - 2 * RESUME_MARGINS.horizontal - 15; // minus bullet indent
  const charsPerLine = Math.max(40, textWidth / (t.body * 0.47));
  const avgLines = bullets.length
    ? bullets.reduce((sum, b) => sum + Math.max(1, Math.ceil(b.length / charsPerLine)), 0) / bullets.length
    : 2;
  return avgLines * t.body * t.lineHeight + t.bulletGap;
}

// ---------------------------------------------------------------------------
// Normalization & fact guarding
// ---------------------------------------------------------------------------

/**
 * Give every role an entry, strip vague unsupported outcome claims, and remove
 * bullets that introduce figures or technologies absent from the base resume
 * (as long as the entry keeps at least two bullets; otherwise they stay and are
 * reported as warnings).
 */
function normalizeContent(
  content: OptimizedContent,
  profile: ResumeProfile,
  facts: SourceFacts,
  sourceCompact: string,
): { content: OptimizedContent; rejected: number } {
  let rejected = 0;
  const clean = (bullets: string[]) => {
    const normalized = bullets.map((b) => normalizeBullet(b, sourceCompact)).filter(Boolean);
    const supported = normalized.filter((b) => {
      const p = sentenceProblems(b, facts);
      return p.figures.length === 0 && p.terms.length === 0;
    });
    if (supported.length >= 2 || supported.length === normalized.length) {
      rejected += normalized.length - supported.length;
      return supported;
    }
    return normalized;
  };

  const experience = profile.experience.map((role, i) => {
    const entry = content.experience.find((e) => e.experienceIndex === i);
    return { experienceIndex: i, bullets: clean(entry?.bullets.length ? entry.bullets : role.bullets) };
  });
  const seen = new Set<number>();
  const projects = content.projects
    .filter((p) => p.projectIndex < profile.projects.length && !seen.has(p.projectIndex) && seen.add(p.projectIndex))
    .map((p) => ({ projectIndex: p.projectIndex, bullets: clean(p.bullets) }));

  return {
    content: {
      ...content,
      summary: normalizeSummary(content.summary, sourceCompact, (sentence) => {
        const p = sentenceProblems(sentence, facts);
        return p.figures.length === 0 && p.terms.length === 0;
      }),
      experience,
      projects,
    },
    rejected,
  };
}

// ---------------------------------------------------------------------------
// Trimming (content does not fit in two pages even with compact typography)
// ---------------------------------------------------------------------------

type TrimEntry = { bullets: string[]; relevance: Relevance | "project"; order: number };

/**
 * Remove one bullet at a time, tier by tier: within a tier, lower relevance and
 * older entries go first. Inside an entry, the last bullet without a documented
 * figure is removed, so documented achievements are kept longest.
 */
function trimBullets(content: OptimizedContent, relevance: Relevance[], count: number, sourceFigures: Set<string>): number {
  const entries: TrimEntry[] = [
    ...content.experience.map((e) => ({
      bullets: e.bullets,
      relevance: relevance[e.experienceIndex] ?? ("medium" as Relevance),
      order: e.experienceIndex,
    })),
    ...content.projects.map((p, i) => ({ bullets: p.bullets, relevance: "project" as const, order: 100 + i })),
  ];
  const priority = { project: 0, low: 1, medium: 2, high: 3 } as const;

  let removed = 0;
  for (const tier of TRIM_TIERS) {
    while (removed < count) {
      const candidate = entries
        .filter((e) => e.bullets.length > (e.relevance === "project" ? tier.project : tier.experience[e.relevance]))
        .sort((a, b) => priority[a.relevance] - priority[b.relevance] || b.order - a.order)[0];
      if (!candidate) break;
      removeLeastDocumented(candidate.bullets, sourceFigures);
      removed++;
    }
    if (removed >= count) break;
  }

  // Projects trimmed to zero bullets are dropped entirely.
  content.projects = content.projects.filter((p) => p.bullets.length > 0);
  return removed;
}

function removeLeastDocumented(bullets: string[], sourceFigures: Set<string>) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const hasDocumentedFigure = extractFigures(bullets[i]).some((f) => sourceFigures.has(f));
    if (!hasDocumentedFigure) {
      bullets.splice(i, 1);
      return;
    }
  }
  bullets.pop();
}

// ---------------------------------------------------------------------------
// Expansion (content too short to fill two pages)
// ---------------------------------------------------------------------------

function planExpansion(
  content: OptimizedContent,
  profile: ResumeProfile,
  relevance: Relevance[],
  needed: number,
  extended: boolean,
): ExpansionRequest {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const roles = content.experience
    .map((e) => {
      const rel = relevance[e.experienceIndex] ?? "medium";
      const max = extended ? EXTENDED_MAX[rel] : BULLET_RANGE[rel][1];
      const role = profile.experience[e.experienceIndex];
      return {
        experienceIndex: e.experienceIndex,
        label: [role.title, role.company].filter(Boolean).join(" at "),
        capacity: max - e.bullets.length,
        relevance: rel,
        add: 0,
      };
    })
    .sort((a, b) => rank[a.relevance] - rank[b.relevance] || a.experienceIndex - b.experienceIndex);
  const projects = content.projects.map((p) => ({
    projectIndex: p.projectIndex,
    name: profile.projects[p.projectIndex].name,
    capacity: PROJECT_BULLET_RANGE[1] - p.bullets.length,
    add: 0,
  }));

  let remaining = needed;
  let progressed = true;
  while (remaining > 0 && progressed) {
    progressed = false;
    for (const role of roles) {
      if (remaining > 0 && role.add < role.capacity) {
        role.add++;
        remaining--;
        progressed = true;
      }
    }
    // Projects only once roles are full (experience carries more weight).
    if (!progressed) {
      for (const project of projects) {
        if (remaining > 0 && project.add < project.capacity) {
          project.add++;
          remaining--;
          progressed = true;
        }
      }
    }
  }

  return {
    experience: roles.filter((r) => r.add > 0).map(({ experienceIndex, label, add }) => ({ experienceIndex, label, add })),
    projects: projects.filter((p) => p.add > 0).map(({ projectIndex, name, add }) => ({ projectIndex, name, add })),
  };
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 2));
}

function isNearDuplicate(candidate: string, existing: string[]): boolean {
  const a = words(candidate);
  return existing.some((other) => {
    const b = words(other);
    let shared = 0;
    for (const w of a) if (b.has(w)) shared++;
    const union = a.size + b.size - shared;
    return union > 0 && shared / union > 0.55;
  });
}

/** Accept only new bullets that are substantive, novel, and introduce no unsupported facts. */
function acceptNewBullets(
  proposed: string[],
  existing: string[],
  limit: number,
  facts: SourceFacts,
  sourceCompact: string,
): { accepted: string[]; rejected: Record<string, number> } {
  const accepted: string[] = [];
  const rejected: Record<string, number> = {};
  const reject = (reason: string) => (rejected[reason] = (rejected[reason] ?? 0) + 1);
  for (const raw of proposed) {
    if (accepted.length >= limit) break;
    const text = normalizeBullet(raw, sourceCompact);
    const problems = sentenceProblems(text, facts);
    if (text.split(/\s+/).length < 12) reject("too_short");
    else if (problems.figures.length > 0) reject("new_figure");
    else if (problems.terms.length > 0) reject(`unsupported:${problems.terms[0]}`);
    else if (isNearDuplicate(text, [...existing, ...accepted])) reject("duplicate");
    else accepted.push(text);
  }
  return { accepted, rejected };
}

async function expandContent(
  ai: AIProvider,
  args: {
    content: OptimizedContent;
    request: ExpansionRequest;
    job: JobAnalysis;
    profile: ResumeProfile;
    resumeText: string;
    facts: SourceFacts;
    sourceCompact: string;
  },
  signal?: AbortSignal,
): Promise<{ added: number; rejected: Record<string, number> }> {
  const { content, request, job, profile, resumeText, facts, sourceCompact } = args;
  // Ask for a few extra candidates so guard rejections don't leave gaps; only `add` are kept.
  const withSpares: ExpansionRequest = {
    experience: request.experience.map((e) => ({ ...e, add: e.add + Math.max(1, Math.ceil(e.add / 2)) })),
    projects: request.projects.map((p) => ({ ...p, add: p.add + 1 })),
  };
  const expansion = await ai.generateJSON({
    name: "resume_expansion",
    system: RESUME_EXPANSION_SYSTEM,
    user: resumeExpansionUser(job, profile, content, resumeText, withSpares),
    schema: ResumeExpansionSchema,
    signal,
  });

  const allBullets = () => [
    ...content.experience.flatMap((e) => e.bullets),
    ...content.projects.flatMap((p) => p.bullets),
  ];

  let added = 0;
  const rejected: Record<string, number> = {};
  const apply = (target: { bullets: string[] } | undefined, proposal: string[] | undefined, want: number) => {
    if (!target || !proposal) return;
    const result = acceptNewBullets(proposal, allBullets(), want, facts, sourceCompact);
    target.bullets.push(...result.accepted);
    added += result.accepted.length;
    for (const [reason, n] of Object.entries(result.rejected)) rejected[reason] = (rejected[reason] ?? 0) + n;
  };

  for (const want of request.experience) {
    apply(
      content.experience.find((e) => e.experienceIndex === want.experienceIndex),
      expansion.experience.find((e) => e.experienceIndex === want.experienceIndex)?.newBullets,
      want.add,
    );
  }
  for (const want of request.projects) {
    apply(
      content.projects.find((p) => p.projectIndex === want.projectIndex),
      expansion.projects.find((p) => p.projectIndex === want.projectIndex)?.newBullets,
      want.add,
    );
  }
  return { added, rejected };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Produce a resume that fills two pages: measure the real rendered PDF, adjust
 * typography within readable ranges, ask the model for more grounded detail
 * when page two is short, and trim the least relevant bullets on overflow.
 * If the source genuinely cannot support two full pages, the result stays
 * shorter rather than padded with invented content.
 */
export async function fitResumeToTwoPages(
  ai: AIProvider,
  input: {
    content: OptimizedContent;
    profile: ResumeProfile;
    job: JobAnalysis;
    match: MatchAnalysis;
    resumeText: string;
    sourceIndex: TextIndex;
  },
  signal?: AbortSignal,
): Promise<FittedResume> {
  const { profile, job, match, resumeText, sourceIndex } = input;
  const relevance = roleRelevance(profile, match);
  const facts = buildSourceFacts(resumeText, sourceIndex, job);
  const sourceCompact = compactKey(resumeText);
  const normalized = normalizeContent(input.content, profile, facts, sourceCompact);
  const content = normalized.content;

  let bulletsAdded = 0;
  let bulletsTrimmed = 0;
  let bulletsRejected = normalized.rejected;
  const rejectionReasons: Record<string, number> = {};
  let expansionRounds = 0;
  let trimRounds = 0;
  let extended = false;

  for (;;) {
    const resume = assembleResume(profile, content);
    const fitted = await fitTypography(resume);
    const { measurement, typography } = fitted;

    if (fitted.overflow) {
      if (trimRounds >= MAX_TRIM_ROUNDS) return finish(resume, fitted);
      trimRounds++;
      const overflowPt =
        (measurement.pages - TARGET_PAGES - 1) * measurement.printableHeightPt +
        measurement.lastPageFill * measurement.printableHeightPt;
      const count = Math.max(1, Math.ceil(overflowPt / bulletHeight(typography, content, measurement.pageWidthPt)));
      const removed = trimBullets(content, relevance, count, facts.figures);
      if (removed === 0) return finish(resume, fitted); // nothing left to trim
      bulletsTrimmed += removed;
      continue;
    }

    const complete = measurement.pages === TARGET_PAGES && measurement.lastPageFill >= TARGET_LAST_PAGE_FILL;
    if (complete || expansionRounds >= MAX_EXPANSION_ROUNDS) return finish(resume, fitted);

    // Free space to fill, measured at the chosen typography. Aim slightly over:
    // typography can tighten to absorb a small surplus, while a deficit leaves blank space.
    const freePt =
      measurement.lastPageFreePt + (TARGET_PAGES - measurement.pages) * measurement.printableHeightPt;
    const needed = Math.min(
      MAX_BULLETS_PER_EXPANSION,
      Math.ceil((freePt * 1.1) / bulletHeight(typography, content, measurement.pageWidthPt)),
    );
    let request = planExpansion(content, profile, relevance, needed, extended);
    if (request.experience.length === 0 && request.projects.length === 0 && !extended) {
      extended = true;
      request = planExpansion(content, profile, relevance, needed, extended);
    }
    if (request.experience.length === 0 && request.projects.length === 0) return finish(resume, fitted);

    expansionRounds++;
    const result = await expandContent(
      ai,
      { content, request, job, profile, resumeText, facts, sourceCompact },
      signal,
    );
    for (const [reason, n] of Object.entries(result.rejected)) {
      rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + n;
      bulletsRejected += n;
    }
    if (result.added === 0) {
      if (extended) return finish(resume, fitted);
      extended = true; // try once more with the extended limits
      continue;
    }
    bulletsAdded += result.added;
  }

  function finish(resume: ResumeDocument, rendered: Rendered): FittedResume {
    if (bulletsAdded || bulletsTrimmed || bulletsRejected) {
      console.info(
        `[layout] pages=${rendered.measurement.pages} fill=${Math.round(rendered.measurement.lastPageFill * 100)}% ` +
          `body=${rendered.typography.body}pt added=${bulletsAdded} trimmed=${bulletsTrimmed} rejected=${bulletsRejected} ` +
          JSON.stringify(rejectionReasons),
      );
    }
    return {
      resume,
      content,
      pdf: rendered.pdf,
      measurement: rendered.measurement,
      typography: rendered.typography,
      warnings: checkOptimizedContent(content, resumeText, sourceIndex, job),
      bulletsAdded,
      bulletsTrimmed,
      bulletsRejected,
    };
  }
}
