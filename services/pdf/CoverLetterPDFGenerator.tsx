import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { CoverLetterDocument } from "@/types/resume";
import { PDF_FONT_FAMILY, getPageSize, registerPdfFonts, serializeRender } from "./fonts";
import { measurePdf } from "./measure";

const MARGINS = { top: 56, bottom: 56, horizontal: 66 } as const;

/** Body size options, largest first. The largest that keeps the letter on one page wins. */
const BODY_SIZES = [12, 11.75, 11.5] as const;

function makeStyles(body: number) {
  return StyleSheet.create({
    page: {
      fontFamily: PDF_FONT_FAMILY,
      fontSize: body,
      lineHeight: 1.45,
      color: "#111111",
      paddingTop: MARGINS.top,
      paddingBottom: MARGINS.bottom,
      paddingHorizontal: MARGINS.horizontal,
    },
    letterhead: {
      borderBottomWidth: 0.75,
      borderBottomColor: "#111111",
      paddingBottom: 8,
      marginBottom: 22,
    },
    name: { fontSize: 22, fontWeight: 700, letterSpacing: 0.3, lineHeight: 1.2 },
    contact: { fontSize: 10.5, color: "#3f3f3f", marginTop: 4, lineHeight: 1.35 },
    date: { fontSize: 11, marginBottom: 16 },
    block: { marginBottom: 16 },
    subject: { fontWeight: 700, marginBottom: 16 },
    paragraph: { marginBottom: 12 },
    closing: { marginTop: 6 },
    signature: { marginTop: 26, fontWeight: 700 },
  });
}

export function CoverLetterPDF({ letter, bodySize }: { letter: CoverLetterDocument; bodySize: number }) {
  const styles = makeStyles(bodySize);
  return (
    <Document
      title={`${letter.senderName} – Cover Letter`}
      author={letter.senderName}
      subject={letter.subject}
      creator="Resume Optimizer"
      producer="Resume Optimizer"
      language="en-US"
    >
      <Page size={getPageSize()} style={styles.page}>
        <View style={styles.letterhead}>
          <Text style={styles.name}>{letter.senderName}</Text>
          {letter.senderContact.length > 0 ? (
            <Text style={styles.contact}>{letter.senderContact.join(" | ")}</Text>
          ) : null}
        </View>

        <Text style={styles.date}>{letter.date}</Text>

        <View style={styles.block}>
          {letter.recipient.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </View>

        <Text style={styles.subject}>Re: {letter.subject}</Text>
        <Text style={styles.paragraph}>{letter.greeting}</Text>
        {letter.paragraphs.map((p, i) => (
          <Text key={i} style={styles.paragraph}>
            {p}
          </Text>
        ))}

        <View wrap={false}>
          <Text style={styles.closing}>{letter.closing}</Text>
          <Text style={styles.signature}>{letter.signature}</Text>
        </View>
      </Page>
    </Document>
  );
}

/** Render at the largest comfortable body size that keeps the letter on one page. */
export async function generateCoverLetterPdf(letter: CoverLetterDocument): Promise<Buffer> {
  registerPdfFonts();
  let pdf: Buffer | null = null;
  for (const size of BODY_SIZES) {
    pdf = await serializeRender(() => renderToBuffer(<CoverLetterPDF letter={letter} bodySize={size} />));
    const { pages } = await measurePdf(new Uint8Array(pdf), MARGINS);
    if (pages <= 1) break;
  }
  return pdf!;
}
