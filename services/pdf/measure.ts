import "server-only";
import { extractTextItems, getDocumentProxy } from "unpdf";

export interface PdfMeasurement {
  pages: number;
  /** Fraction (0–1) of the last page's printable height that is used by text. */
  lastPageFill: number;
  /** Unused printable height at the bottom of the last page, in points. */
  lastPageFreePt: number;
  /** Printable height of a page, in points. */
  printableHeightPt: number;
  /** Full page width, in points. */
  pageWidthPt: number;
}

/**
 * Measure a rendered PDF by reading back its text positions. This reflects
 * the real layout (wrapping, page breaks, kept-together blocks), not an estimate.
 */
export async function measurePdf(
  pdf: Uint8Array,
  margins: { top: number; bottom: number },
): Promise<PdfMeasurement> {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  try {
    const page = await doc.getPage(1);
    const [, , pageWidth, pageHeight] = page.view as number[];
    const printable = pageHeight - margins.top - margins.bottom;

    const { totalPages, items } = await extractTextItems(doc);
    const last = (items[totalPages - 1] ?? []).filter((it) => it.str.trim() !== "");
    let lowestBottom = margins.top; // distance from page top
    for (const it of last) {
      const descent = (it.fontSize || it.height || 10) * 0.25;
      lowestBottom = Math.max(lowestBottom, pageHeight - it.y + descent);
    }
    const used = Math.min(printable, Math.max(0, lowestBottom - margins.top));
    return {
      pages: totalPages,
      lastPageFill: printable > 0 ? used / printable : 1,
      lastPageFreePt: Math.max(0, printable - used),
      printableHeightPt: printable,
      pageWidthPt: pageWidth,
    };
  } finally {
    await doc.cleanup().catch(() => undefined);
  }
}
