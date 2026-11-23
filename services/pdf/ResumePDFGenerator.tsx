import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ResumeDocument } from "@/types/resume";
import { PDF_FONT_FAMILY, getPageSize, registerPdfFonts, serializeRender } from "./fonts";

const INK = "#111111";
const MUTED = "#3f3f3f";

/** Fixed page margins (pt). Layout fitting never changes these. */
export const RESUME_MARGINS = { top: 40, bottom: 40, horizontal: 46 } as const;

/**
 * Typography for one rendering of the resume. Every value interpolates between
 * a "compact" and a "comfortable" preset, both inside readable ranges:
 * name 22–26pt, title 12–14pt, headings 12–13pt, role titles 11–12pt,
 * body 10.5–11pt, contact 9.5–10.5pt. Margins stay fixed.
 */
export interface ResumeTypography {
  density: number;
  name: number;
  title: number;
  contact: number;
  heading: number;
  roleTitle: number;
  body: number;
  lineHeight: number;
  sectionGap: number;
  headingGap: number;
  entryGap: number;
  bulletGap: number;
}

const COMPACT = {
  name: 22, title: 12, contact: 9.5, heading: 12, roleTitle: 11, body: 10.5,
  lineHeight: 1.27, sectionGap: 9, headingGap: 4, entryGap: 6, bulletGap: 1.5,
};
const COMFORTABLE = {
  name: 26, title: 14, contact: 10.5, heading: 13, roleTitle: 12, body: 11,
  lineHeight: 1.38, sectionGap: 14, headingGap: 6, entryGap: 10, bulletGap: 3,
};

/** density 0 = compact, 1 = comfortable. */
export function typographyFor(density: number): ResumeTypography {
  const t = Math.min(1, Math.max(0, density));
  const lerp = (a: number, b: number) => Math.round((a + (b - a) * t) * 100) / 100;
  return {
    density: t,
    name: lerp(COMPACT.name, COMFORTABLE.name),
    title: lerp(COMPACT.title, COMFORTABLE.title),
    contact: lerp(COMPACT.contact, COMFORTABLE.contact),
    heading: lerp(COMPACT.heading, COMFORTABLE.heading),
    roleTitle: lerp(COMPACT.roleTitle, COMFORTABLE.roleTitle),
    body: lerp(COMPACT.body, COMFORTABLE.body),
    lineHeight: lerp(COMPACT.lineHeight, COMFORTABLE.lineHeight),
    sectionGap: lerp(COMPACT.sectionGap, COMFORTABLE.sectionGap),
    headingGap: lerp(COMPACT.headingGap, COMFORTABLE.headingGap),
    entryGap: lerp(COMPACT.entryGap, COMFORTABLE.entryGap),
    bulletGap: lerp(COMPACT.bulletGap, COMFORTABLE.bulletGap),
  };
}

function makeStyles(t: ResumeTypography) {
  return StyleSheet.create({
    page: {
      fontFamily: PDF_FONT_FAMILY,
      fontSize: t.body,
      lineHeight: t.lineHeight,
      color: INK,
      paddingTop: RESUME_MARGINS.top,
      paddingBottom: RESUME_MARGINS.bottom,
      paddingHorizontal: RESUME_MARGINS.horizontal,
    },
    header: { alignItems: "center", marginBottom: 2 },
    name: { fontSize: t.name, fontWeight: 700, letterSpacing: 0.3, lineHeight: 1.15 },
    title: { fontSize: t.title, marginTop: 3, lineHeight: 1.2 },
    contact: { fontSize: t.contact, color: MUTED, marginTop: 4, textAlign: "center", lineHeight: 1.3 },
    section: { marginTop: t.sectionGap },
    sectionTitle: {
      fontSize: t.heading,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      lineHeight: 1.2,
      borderBottomWidth: 0.75,
      borderBottomColor: INK,
      paddingBottom: 2,
      marginBottom: t.headingGap,
    },
    skillLine: { marginBottom: t.bulletGap },
    bold: { fontWeight: 700 },
    entry: { marginBottom: t.entryGap },
    entryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    entryTitle: { fontWeight: 700, fontSize: t.roleTitle, flex: 1, paddingRight: 8 },
    entryDates: { textAlign: "right" },
    entrySub: { fontStyle: "italic", color: MUTED, flex: 1, paddingRight: 8 },
    bulletRow: { flexDirection: "row", marginTop: t.bulletGap, paddingLeft: 4 },
    bulletMark: { width: 11 },
    bulletText: { flex: 1 },
  });
}

type Styles = ReturnType<typeof makeStyles>;

function Section({ title, styles, children }: { title: string; styles: Styles; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {/* Never leave a heading stranded at the bottom of a page. */}
      <Text style={styles.sectionTitle} minPresenceAhead={60}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Bullets({ items, styles }: { items: string[]; styles: Styles }) {
  return (
    <>
      {items.map((item, i) => (
        // Bullets never split across pages.
        <View key={i} style={styles.bulletRow} wrap={false}>
          <Text style={styles.bulletMark}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </>
  );
}

export function ResumePDF({ resume, typography }: { resume: ResumeDocument; typography: ResumeTypography }) {
  const styles = makeStyles(typography);
  return (
    <Document
      title={`${resume.name} – Resume`}
      author={resume.name}
      subject={resume.title}
      keywords={resume.skills.flatMap((s) => s.items).slice(0, 40).join(", ")}
      creator="Resume Optimizer"
      producer="Resume Optimizer"
      language="en-US"
    >
      <Page size={getPageSize()} style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.name}>{resume.name}</Text>
          {resume.title ? <Text style={styles.title}>{resume.title}</Text> : null}
          {resume.contact.length > 0 ? <Text style={styles.contact}>{resume.contact.join(" | ")}</Text> : null}
        </View>

        {resume.summary ? (
          <Section title="Professional Summary" styles={styles}>
            <Text>{resume.summary}</Text>
          </Section>
        ) : null}

        {resume.skills.length > 0 ? (
          <Section title="Technical Skills" styles={styles}>
            {resume.skills.map((group) => (
              <Text key={group.category} style={styles.skillLine}>
                <Text style={styles.bold}>{group.category}: </Text>
                {group.items.join(", ")}
              </Text>
            ))}
          </Section>
        ) : null}

        {resume.experience.length > 0 ? (
          <Section title="Professional Experience" styles={styles}>
            {resume.experience.map((role, i) => (
              <View key={i} style={styles.entry}>
                {/* Role header stays with its first bullet (no orphaned headers, minimal gaps). */}
                <View wrap={false}>
                  <View style={styles.entryRow}>
                    <Text style={styles.entryTitle}>{role.title}</Text>
                    <Text style={styles.entryDates}>{role.dates}</Text>
                  </View>
                  <View style={styles.entryRow}>
                    <Text style={styles.entrySub}>{role.company}</Text>
                    {role.location ? <Text style={styles.entryDates}>{role.location}</Text> : null}
                  </View>
                  <Bullets items={role.bullets.slice(0, 1)} styles={styles} />
                </View>
                <Bullets items={role.bullets.slice(1)} styles={styles} />
              </View>
            ))}
          </Section>
        ) : null}

        {resume.projects.length > 0 ? (
          <Section title="Selected Projects" styles={styles}>
            {resume.projects.map((project, i) => (
              <View key={i} style={styles.entry}>
                <View wrap={false}>
                  <View style={styles.entryRow}>
                    <Text style={styles.entryTitle}>
                      {project.name}
                      {project.technologies.length > 0 ? (
                        <Text style={{ fontWeight: 400, fontSize: typography.body }}>
                          {" "}
                          | {project.technologies.join(", ")}
                        </Text>
                      ) : null}
                    </Text>
                    {project.link ? <Text style={styles.entryDates}>{project.link}</Text> : null}
                  </View>
                  <Bullets items={project.bullets.slice(0, 1)} styles={styles} />
                </View>
                <Bullets items={project.bullets.slice(1)} styles={styles} />
              </View>
            ))}
          </Section>
        ) : null}

        {resume.education.length > 0 ? (
          <Section title="Education" styles={styles}>
            {resume.education.map((edu, i) => (
              <View key={i} style={styles.entry} wrap={false}>
                <View style={styles.entryRow}>
                  <Text style={styles.entryTitle}>{edu.credential || edu.institution}</Text>
                  <Text style={styles.entryDates}>{edu.dates}</Text>
                </View>
                {edu.credential ? (
                  <View style={styles.entryRow}>
                    <Text style={styles.entrySub}>{edu.institution}</Text>
                    {edu.location ? <Text style={styles.entryDates}>{edu.location}</Text> : null}
                  </View>
                ) : null}
                <Bullets items={edu.details} styles={styles} />
              </View>
            ))}
          </Section>
        ) : null}

        {resume.certifications.length > 0 ? (
          <Section title="Certifications" styles={styles}>
            <Bullets items={resume.certifications} styles={styles} />
          </Section>
        ) : null}

        {resume.additionalSections.map((section) => (
          <Section key={section.title} title={section.title} styles={styles}>
            <Bullets items={section.items} styles={styles} />
          </Section>
        ))}
      </Page>
    </Document>
  );
}

export async function generateResumePdf(
  resume: ResumeDocument,
  typography: ResumeTypography = typographyFor(0.5),
): Promise<Buffer> {
  registerPdfFonts();
  return serializeRender(() => renderToBuffer(<ResumePDF resume={resume} typography={typography} />));
}
