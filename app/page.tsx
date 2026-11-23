import { ResumeOptimizer } from "@/components/resume/ResumeOptimizer";
import { ServerStartupModal } from "@/components/ServerStartupModal";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <ServerStartupModal />
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h4" />
            </svg>
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">ATS Resume Optimizer</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Tailor your real experience to any engineering role, with a matching cover letter.
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <ResumeOptimizer />
      </main>
      <footer className="border-t border-zinc-200 py-5 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
        Documents are generated server-side and are not stored permanently. Always review AI output before applying.
      </footer>
    </div>
  );
}
