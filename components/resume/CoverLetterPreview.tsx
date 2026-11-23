import type { CoverLetterDocument } from "@/types/resume";

export function CoverLetterPreview({ letter }: { letter: CoverLetterDocument }) {
  const words = letter.paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  return (
    <div>
      <article className="paper mx-auto max-w-[8.5in] rounded-lg bg-white px-6 py-8 text-[15px] leading-[1.6] text-zinc-900 shadow-sm ring-1 ring-zinc-200 sm:px-14 sm:py-12 dark:ring-zinc-700">
        <header className="border-b border-zinc-900 pb-2">
          <h3 className="text-2xl font-bold tracking-wide">{letter.senderName}</h3>
          {letter.senderContact.length > 0 ? (
            <p className="mt-0.5 break-words text-xs text-zinc-600">{letter.senderContact.join("  |  ")}</p>
          ) : null}
        </header>
        <p className="mt-6">{letter.date}</p>
        <div className="mt-4">
          {letter.recipient.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        <p className="mt-4 font-bold">Re: {letter.subject}</p>
        <p className="mt-4">{letter.greeting}</p>
        {letter.paragraphs.map((p, i) => (
          <p key={i} className="mt-3">
            {p}
          </p>
        ))}
        <p className="mt-5">{letter.closing}</p>
        <p className="mt-6 font-bold">{letter.signature}</p>
      </article>
      <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">{words} words in body</p>
    </div>
  );
}
