import "server-only";
import {
  RESUME_OPTIMIZATION_SYSTEM,
  resumeOptimizationRepairUser,
  resumeOptimizationUser,
  type BulletPlan,
} from "@/lib/prompts";
import {
  OptimizedContentSchema,
  type JobAnalysis,
  type MatchAnalysis,
  type OptimizedContent,
  type ResumeProfile,
} from "@/lib/schemas";
import type { AIProvider } from "@/types/ai";
import type { FactCheckWarning, ResumeDocument } from "@/types/resume";
import { checkOptimizedContent } from "./FactChecker";
import { displayUrl, formatDateRange, joinNonEmpty } from "./formatting";
import type { TextIndex } from "./textMatching";

export interface OptimizationOutcome {
  content: OptimizedContent;
  warnings: FactCheckWarning[];
}

/**
 * Generate job-specific resume content, then run a deterministic fact check.
 * If unsupported figures or skills are detected, the model gets one chance to
 * correct them; anything left is surfaced to the user as a warning.
 */
export async function optimizeResume(
  ai: AIProvider,
  input: {
    job: JobAnalysis;
    profile: ResumeProfile;
    match: MatchAnalysis;
    resumeText: string;
    sourceIndex: TextIndex;
  },
  signal?: AbortSignal,
): Promise<OptimizationOutcome> {
  const { job, profile, match, resumeText, sourceIndex } = input;
  const plan = planBullets(profile, match);
  const user = resumeOptimizationUser(job, profile, match, resumeText, plan);

  let content = await ai.generateJSON({
    name: "optimized_resume",
    system: RESUME_OPTIMIZATION_SYSTEM,
    user,
    schema: OptimizedContentSchema,
    signal,
  });
  let warnings = checkOptimizedContent(content, resumeText, sourceIndex, job);

  if (warnings.length > 0) {
    const repaired = await ai.generateJSON({
      name: "optimized_resume",
      system: RESUME_OPTIMIZATION_SYSTEM,
      user: [
        user,
        `<previous_output>\n${JSON.stringify(content)}\n</previous_output>`,
        resumeOptimizationRepairUser(warnings.map((w) => w.message)),
        "If an item is in fact supported by the base resume (for example the same technology under a different name), you may keep it.",
      ].join("\n\n"),
      schema: OptimizedContentSchema,
      signal,
    });
    const repairedWarnings = checkOptimizedContent(repaired, resumeText, sourceIndex, job);
    if (repairedWarnings.length <= warnings.length && hasAllRoles(repaired, profile)) {
      content = repaired;
      warnings = repairedWarnings;
    }
  }

  return { content, warnings };
}

export type Relevance = "high" | "medium" | "low";

/** Bullet range per role by relevance: [minimum, maximum]. */
export const BULLET_RANGE: Record<Relevance, [number, number]> = {
  high: [5, 8],
  medium: [3, 6],
  low: [2, 4],
};
export const PROJECT_BULLET_RANGE: [number, number] = [1, 3];

/**
 * Relevance per role from the match analysis. The most recent role is always
 * treated as at least "high" so it carries the most detail.
 */
export function roleRelevance(profile: ResumeProfile, match: MatchAnalysis): Relevance[] {
  return profile.experience.map((_, i) => {
    const rated = match.relevantExperience.find((r) => r.experienceIndex === i)?.relevance ?? "medium";
    return i === 0 ? "high" : rated;
  });
}

/**
 * Rough two-page content budget (in points of a Letter/A4 page at middle
 * density). Only used to give the model a sensible starting target; the
 * layout fitter measures the real PDF afterwards and corrects in either direction.
 */
const TWO_PAGE_HEIGHT = 2 * 712;
const BULLET_HEIGHT = 31; // ~2 lines of 10.75pt text plus spacing
const LINE_HEIGHT = 15;

export function planBullets(profile: ResumeProfile, match: MatchAnalysis): BulletPlan {
  const relevance = roleRelevance(profile, match);
  const projectIndexes = match.relevantProjectIndexes.filter((i, k, all) => all.indexOf(i) === k).slice(0, 3);

  let fixed = 80; // header
  fixed += 30 + 5 * LINE_HEIGHT; // summary
  fixed += 30 + 6 * (LINE_HEIGHT + 2); // skills
  fixed += 30 + profile.experience.length * 40; // experience heading + role headers
  if (projectIndexes.length) fixed += 30 + projectIndexes.length * 22;
  if (profile.education.length) fixed += 30 + profile.education.length * 36;
  if (profile.certifications.length) fixed += 30 + profile.certifications.length * LINE_HEIGHT;
  for (const section of profile.additionalSections) fixed += 30 + section.items.length * LINE_HEIGHT;

  const budget = Math.max(0, Math.floor((TWO_PAGE_HEIGHT - fixed) / BULLET_HEIGHT));

  const experience = profile.experience.map((role, i) => ({
    experienceIndex: i,
    label: [role.title, role.company].filter(Boolean).join(" at "),
    relevance: relevance[i],
    // Never plan fewer bullets than the role documents (documented facts first), within the range.
    target: Math.min(BULLET_RANGE[relevance[i]][1], Math.max(BULLET_RANGE[relevance[i]][0], role.bullets.length)),
  }));
  const projects = projectIndexes.map((projectIndex) => ({
    projectIndex,
    name: profile.projects[projectIndex].name,
    target: 2,
  }));

  // Fill the remaining budget round-robin: high relevance and recent roles first.
  const order = experience
    .map((e) => e)
    .sort((a, b) => rank(a.relevance) - rank(b.relevance) || a.experienceIndex - b.experienceIndex);
  let used = experience.reduce((n, e) => n + e.target, 0) + projects.reduce((n, p) => n + p.target, 0);
  let progressed = true;
  while (used < budget && progressed) {
    progressed = false;
    for (const entry of order) {
      if (used >= budget) break;
      if (entry.target < BULLET_RANGE[entry.relevance as Relevance][1]) {
        entry.target++;
        used++;
        progressed = true;
      }
    }
    for (const project of projects) {
      if (used >= budget) break;
      if (project.target < PROJECT_BULLET_RANGE[1]) {
        project.target++;
        used++;
        progressed = true;
      }
    }
  }

  return { experience, projects, total: used };
}

function rank(relevance: string): number {
  return relevance === "high" ? 0 : relevance === "medium" ? 1 : 2;
}

function hasAllRoles(content: OptimizedContent, profile: ResumeProfile): boolean {
  const covered = new Set(content.experience.map((e) => e.experienceIndex));
  return profile.experience.every((_, i) => covered.has(i));
}

/**
 * Merge AI-written content with verbatim facts from the parsed resume. Company
 * names, titles, dates, education, and certifications always come from the
 * profile, never from the rewriting step.
 */
export function assembleResume(profile: ResumeProfile, content: OptimizedContent): ResumeDocument {
  const { contact } = profile;
  const contactLine = [
    contact.email,
    contact.phone,
    contact.location,
    contact.linkedin && displayUrl(contact.linkedin),
    contact.github && displayUrl(contact.github),
    contact.website && displayUrl(contact.website),
    ...contact.other.map(displayUrl),
  ].filter((v): v is string => Boolean(v && v.trim()));

  const experience = profile.experience.map((role, i) => {
    const rewritten = content.experience.find((e) => e.experienceIndex === i);
    const bullets = rewritten?.bullets.length ? rewritten.bullets : role.bullets;
    return {
      company: role.company,
      title: role.title,
      location: role.location,
      dates: formatDateRange(role.startDate, role.endDate),
      bullets,
    };
  });

  const usedProjects = new Set<number>();
  const projects = content.projects
    .filter((p) => {
      if (p.projectIndex >= profile.projects.length || usedProjects.has(p.projectIndex)) return false;
      usedProjects.add(p.projectIndex);
      return true;
    })
    .map((p) => {
      const source = profile.projects[p.projectIndex];
      return {
        name: source.name,
        link: source.link ? displayUrl(source.link) : "",
        technologies: source.technologies,
        bullets: p.bullets.length ? p.bullets : source.bullets,
      };
    });

  return {
    name: profile.fullName,
    title: content.professionalTitle || profile.headline,
    contact: contactLine,
    summary: content.summary || profile.summary,
    skills: content.skillCategories
      .filter((c) => c.category && c.skills.length > 0)
      .map((c) => ({ category: c.category, items: dedupe(c.skills) })),
    experience,
    projects,
    education: profile.education.map((e) => ({
      institution: e.institution,
      credential:
        e.field && !e.degree.toLowerCase().includes(e.field.toLowerCase())
          ? joinNonEmpty([e.degree, e.field], ", ")
          : e.degree || e.field,
      location: e.location,
      dates: formatDateRange(e.startDate, e.endDate),
      details: e.details,
    })),
    certifications: profile.certifications
      .filter((c) => c.name)
      .map((c) => joinNonEmpty([c.name, c.issuer, c.date], " – ")),
    additionalSections: profile.additionalSections.filter((s) => s.title && s.items.length > 0),
  };
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
