import "server-only";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * Carlito (SIL OFL) is metrically compatible with Calibri: a standard,
 * ATS-safe resume face with broad Latin, Greek, and Cyrillic Unicode coverage.
 * Fonts are embedded so every PDF has real, selectable, searchable text.
 */
export const PDF_FONT_FAMILY = "Carlito";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts", "carlito");

let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;
  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: path.join(FONT_DIR, "Carlito_400Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "Carlito_400Regular_Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: path.join(FONT_DIR, "Carlito_700Bold.ttf"), fontWeight: 700 },
      { src: path.join(FONT_DIR, "Carlito_700Bold_Italic.ttf"), fontWeight: 700, fontStyle: "italic" },
    ],
  });
  // Never hyphenate: split words hurt ATS keyword matching.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

export function getPageSize(): "LETTER" | "A4" {
  return process.env.PDF_PAGE_SIZE?.trim().toUpperCase() === "A4" ? "A4" : "LETTER";
}

let renderQueue: Promise<unknown> = Promise.resolve();

/**
 * react-pdf shares font/glyph-subset state between documents, so concurrent
 * renders can corrupt glyph mappings. Serialize all PDF rendering in-process.
 */
export function serializeRender<T>(render: () => Promise<T>): Promise<T> {
  const run = renderQueue.then(render, render);
  renderQueue = run.catch(() => undefined);
  return run;
}
