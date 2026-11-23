import { compactKey } from "./textMatching";

/**
 * Trailing participial clauses that assert an outcome ("…, enhancing user
 * experience and system responsiveness"). Models add these to sound impactful;
 * unless the outcome is documented they are unsupported claims.
 */
const OUTCOME_CLAUSE =
  /,\s*(?:thus\s+|thereby\s+|which\s+|significantly\s+|greatly\s+)?(?:enhancing|improving|ensuring|facilitating|contributing\s+to|enabling|streamlining|boosting|fostering|resulting\s+in|leading\s+to|increasing|driving|promoting|aiding|elevating|maximizing|minimizing|reducing|optimizing|impacting|delivering|supporting|demonstrating|showcasing|highlighting|reflecting|accelerating)\b[^;]*$/i;

/** "…to enhance operational efficiency", "…for improved reliability", "…, crucial for business operations". */
const PURPOSE_OUTCOME_CLAUSE =
  /(?:,\s*|\s+)(?:(?:in order\s+)?to\s+(?:further\s+)?(?:enhance|improve|ensure|boost|streamline|facilitate|optimize|increase|drive|maximize|elevate|promote|foster|strengthen|reduce|minimize|accelerate|speed\s+up)|for\s+(?:enhanced|improved|better|increased|greater|optimal|optimized)|(?:which\s+(?:was|is)\s+)?(?:crucial|critical|essential|vital|key)\s+(?:for|to))\b[^;]*$/i;

const VAGUE_OUTCOME_WORDS =
  /\b(times?|latency|load|environment|culture|capabilit\w*|process(?:es)?|improvements?|management|response|access|accessibility|delivery|interoperability|business|onboarding|extensibility|experience|efficiency|quality|reliability|performance|scalab\w*|responsive\w*|satisfaction|productivity|outcomes?|growth|robust\w*|consisten\w*|accuracy|speed|seamless\w*|engagement|maintainab\w*|usability|effectiveness|operations?|operational|collaboration|success|value|insights?|decision[- ]making|workflows?|agility|velocity|security|compliance|integrity|continuity)\b/i;

/** "…, which improved the responsiveness of REST APIs and reduced database load". */
const WHICH_OUTCOME_CLAUSE =
  /,\s*which\s+(?:\w+ly\s+)?(?:improved|enhanced|reduced|increased|boosted|streamlined|enabled|ensured|resulted|led|helped|allowed|made|cut|drove|accelerated)\b[^;]*$/i;

function stripOutcomeTail(text: string, sourceCompact: string): string {
  const body = text.replace(/[.!]+$/, "");
  for (const pattern of [OUTCOME_CLAUSE, PURPOSE_OUTCOME_CLAUSE, WHICH_OUTCOME_CLAUSE]) {
    const clause = body.match(pattern);
    if (!clause || clause.index === undefined) continue;
    const tail = clause[0];
    const documented =
      /\d/.test(tail) || sourceCompact.includes(compactKey(tail.replace(/^,?\s*/, "")).slice(0, 40));
    const remainder = body.slice(0, clause.index).trim();
    // Self-praise ("…, demonstrating strong skills") is never a documented fact.
    const selfPraise = /^,?\s*(?:demonstrating|showcasing|highlighting|reflecting)\b/i.test(tail);
    const words = remainder.split(/\s+/).length;
    if (!documented && ((selfPraise && words >= 5) || (VAGUE_OUTCOME_WORDS.test(tail) && words >= 7))) {
      return remainder;
    }
  }
  return text;
}

/** Résumé clichés at the start of a sentence ("Accomplished software engineer…", "Proven leader in…"). */
const CLICHE_OPENERS = /(^|[.!?]\s+)(?:Highly\s+(?:skilled|motivated|accomplished)\s+|Accomplished\s+|Results-driven\s+|Dynamic\s+|Passionate\s+|Seasoned\s+|Proven\s+)([a-z])/g;

/**
 * Normalize the professional summary: drop sentences that introduce
 * unsupported facts, strip vague outcome tails and clichés.
 */
export function normalizeSummary(
  summary: string,
  sourceCompact: string,
  isSupported: (sentence: string) => boolean,
): string {
  const sentences = summary
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .filter(Boolean);
  const kept = sentences
    .map((sentence) => {
      let text = sentence;
      for (let pass = 0; pass < 2; pass++) text = stripOutcomeTail(text, sourceCompact);
      text = text.replace(FILLER_WORDS, "").replace(/\s{2,}/g, " ").trim().replace(/[\s,;:]+$/, "");
      text = text.charAt(0).toUpperCase() + text.slice(1);
      return /[.!?]$/.test(text) ? text : `${text}.`;
    })
    .filter((sentence, i) => i === 0 || isSupported(sentence));
  return kept
    .join(" ")
    .replace(CLICHE_OPENERS, (_m, lead: string, first: string) => `${lead}${first.toUpperCase()}`)
    .replace(/^([a-z])/, (c) => c.toUpperCase());
}

/** Filler intensifiers that add no information. */
const FILLER_WORDS = /\b(significantly|seamlessly|effectively|successfully|efficiently)\s+/gi;

/**
 * Remove unsupported, vague outcome claims from a generated bullet while
 * keeping documented ones (wording present in the base resume or containing a
 * figure). Never shortens a bullet below a substantive length.
 */
export function normalizeBullet(bullet: string, sourceCompact: string): string {
  let text = bullet.trim().replace(/\s+/g, " ");

  // Strip up to two stacked outcome tails ("…, improving X to ensure Y").
  for (let pass = 0; pass < 2; pass++) {
    const stripped = stripOutcomeTail(text, sourceCompact);
    if (stripped === text) break;
    text = stripped;
  }

  text = text.replace(FILLER_WORDS, "").replace(/\s{2,}/g, " ").trim();
  text = text.replace(/[\s,;:.]+$/, "");
  if (text && !/[.!?]$/.test(text)) text += ".";
  return text.charAt(0).toUpperCase() + text.slice(1);
}
