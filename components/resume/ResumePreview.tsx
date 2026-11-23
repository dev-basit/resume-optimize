import type { ReactNode } from "react";
import type { ResumeDocument } from "@/types/resume";

/** HTML preview mirroring the PDF layout (single column, standard headings). */
export function ResumePreview({
  resume,
  elaborated = [],
}: {
  resume: ResumeDocument;
  elaborated?: string[];
}) {
  const marked = new Set(elaborated);
  return (
    <>
      {marked.size > 0 ? (
        <p className="mx-auto mb-3 flex max-w-[8.5in] items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="inline-block h-3.5 w-1 rounded-full bg-amber-400" aria-hidden />
          {marked.size} bullet{marked.size === 1 ? "" : "s"} marked like this expand on your documented work rather
          than restate it. Review them for accuracy before sending. The mark appears only here, not in the PDF.
        </p>
      ) : null}
    <article className="paper mx-auto max-w-[8.5in] rounded-lg bg-white px-6 py-8 text-[14px] leading-[1.45] text-zinc-900 shadow-sm ring-1 ring-zinc-200 sm:px-12 sm:py-10 dark:ring-zinc-700">
      <header className="text-center">
        <h3 className="text-[28px] font-bold tracking-wide">{resume.name}</h3>
        {resume.title ? <p className="mt-0.5 text-[17px]">{resume.title}</p> : null}
        {resume.contact.length > 0 ? (
          <p className="mt-1.5 break-words text-xs text-zinc-600">{resume.contact.join("  |  ")}</p>
        ) : null}
      </header>

      {resume.summary ? (
        <Section title="Professional Summary">
          <p>{resume.summary}</p>
        </Section>
      ) : null}

      {resume.skills.length > 0 ? (
        <Section title="Technical Skills">
          <ul className="space-y-0.5">
            {resume.skills.map((group) => (
              <li key={group.category}>
                <span className="font-bold">{group.category}: </span>
                {group.items.join(", ")}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {resume.experience.length > 0 ? (
        <Section title="Professional Experience">
          <div className="space-y-3">
            {resume.experience.map((role, i) => (
              <div key={i}>
                <Row left={<span className="font-bold">{role.title}</span>} right={role.dates} />
                <Row left={<span className="italic text-zinc-600">{role.company}</span>} right={role.location} />
                <Bullets items={role.bullets} marked={marked} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {resume.projects.length > 0 ? (
        <Section title="Selected Projects">
          <div className="space-y-3">
            {resume.projects.map((project, i) => (
              <div key={i}>
                <Row
                  left={
                    <span>
                      <span className="font-bold">{project.name}</span>
                      {project.technologies.length > 0 ? ` | ${project.technologies.join(", ")}` : ""}
                    </span>
                  }
                  right={project.link}
                />
                <Bullets items={project.bullets} marked={marked} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {resume.education.length > 0 ? (
        <Section title="Education">
          <div className="space-y-2">
            {resume.education.map((edu, i) => (
              <div key={i}>
                <Row left={<span className="font-bold">{edu.credential || edu.institution}</span>} right={edu.dates} />
                {edu.credential ? (
                  <Row left={<span className="italic text-zinc-600">{edu.institution}</span>} right={edu.location} />
                ) : null}
                <Bullets items={edu.details} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {resume.certifications.length > 0 ? (
        <Section title="Certifications">
          <Bullets items={resume.certifications} />
        </Section>
      ) : null}

      {resume.additionalSections.map((section) => (
        <Section key={section.title} title={section.title}>
          <Bullets items={section.items} />
        </Section>
      ))}
    </article>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h4 className="mb-1.5 border-b border-zinc-900 pb-0.5 text-[15px] font-bold uppercase tracking-wider">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Row({ left, right }: { left: ReactNode; right?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="min-w-0">{left}</div>
      {right ? <div className="shrink-0 text-right">{right}</div> : null}
    </div>
  );
}

function Bullets({ items, marked }: { items: string[]; marked?: Set<string> }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-0.5 list-disc space-y-0.5 pl-5 marker:text-zinc-700">
      {items.map((item, i) =>
        marked?.has(item) ? (
          <li
            key={i}
            className="-ml-1 border-l-[3px] border-amber-400 bg-amber-50/70 pl-1"
            title="Expands on your documented work. Review for accuracy."
          >
            {item}
          </li>
        ) : (
          <li key={i}>{item}</li>
        ),
      )}
    </ul>
  );
}
