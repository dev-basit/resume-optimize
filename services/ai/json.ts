/**
 * Extract a JSON value from model output. Handles models that wrap JSON in
 * markdown fences or add a sentence before/after it (common when native
 * structured output is unavailable).
 */
export function extractJSON(raw: string): unknown {
  const text = raw.trim();
  try {
    return JSON.parse(text);
  } catch {
    // fall through
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return JSON.parse(text.slice(start, end + 1));
  }
  throw new SyntaxError("No JSON object found in model output.");
}
