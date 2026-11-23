const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LOOKUP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/**
 * Normalize a single resume date to "Mon YYYY" / "YYYY" / "Present" for
 * consistent formatting. Unrecognized formats are returned unchanged so no
 * factual detail is ever lost.
 */
export function formatResumeDate(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^(present|current|now|to date|till date|ongoing)$/i.test(value)) return "Present";

  let m = value.match(/^([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (m && MONTH_LOOKUP[m[1].toLowerCase()] !== undefined) {
    return `${MONTHS[MONTH_LOOKUP[m[1].toLowerCase()]]} ${m[2]}`;
  }
  m = value.match(/^(\d{1,2})\s*[/.-]\s*(\d{4})$/); // 03/2021
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${MONTHS[+m[1] - 1]} ${m[2]}`;
  m = value.match(/^(\d{4})\s*[/.-]\s*(\d{1,2})$/); // 2021-03
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${MONTHS[+m[2] - 1]} ${m[1]}`;
  if (/^\d{4}$/.test(value)) return value;
  return value;
}

export function formatDateRange(start: string, end: string): string {
  const s = formatResumeDate(start);
  const e = formatResumeDate(end);
  if (s && e) return s === e ? s : `${s} – ${e}`;
  return s || e;
}

export function joinNonEmpty(parts: (string | undefined | null)[], separator: string): string {
  return parts.map((p) => (p ?? "").trim()).filter(Boolean).join(separator);
}

/** Strip protocol and trailing slash from URLs for compact display. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");
}

export function formatLetterDate(date = new Date()): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
