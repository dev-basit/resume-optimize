# ATS Resume Optimizer

Upload your base resume (PDF, DOCX, TXT, or pasted text), paste a job description, and generate:

- a job-specific, ATS-friendly resume PDF (single column, embedded fonts, selectable text)
- a tailored cover letter PDF
- a job-match and keyword-coverage analysis, plus fact-check warnings for anything that can't be traced to your base resume

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in your provider, key, and model
npm run dev
```

### AI provider

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `openai` (default; the only provider currently) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI credentials and model (optional `OPENAI_BASE_URL`) |
| `OPENAI_STRUCTURED_OUTPUT` | `json_schema` / `json_object` / `prompt`. Unsupported modes fall back automatically |
| `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_TEMPERATURE` | Optional tuning |
| `PDF_PAGE_SIZE`, `DOCUMENT_TTL_MINUTES` | `LETTER`/`A4`; how long generated PDFs stay downloadable |

The app starts without any keys. Generation then returns a clear configuration error.

To add a provider (Anthropic, Gemini, …): implement `AIProvider` (`types/ai.ts`), add its config in `lib/env.ts`, and register it in `services/ai/AIService.ts`. The resume logic doesn't change.

## How it works

`POST /api/resume/generate` streams real workflow stages as NDJSON:

1. **Reading base resume**: structured, verbatim extraction of your resume (runs concurrently with 2)
2. **Analyzing job description**: title, seniority, requirements by importance, ATS keywords
3. **Matching technical skills**: matching, transferable, and missing skills; relevance of each role
4. **Optimizing resume content**: rewrite with per-role bullet targets for two pages, a deterministic fact check with one correction pass, then **two-page fitting**:
   - The resume PDF is rendered and measured from its real text positions (page count, fill of page 2).
   - Typography is chosen within readable ranges (body 10.5–11pt, name 22–26pt, headings 12–13pt) as large as still fits in two pages. Margins never change.
   - If page 2 is under 85% full, the model writes additional grounded bullets for specific roles (up to 3 rounds). On overflow, the least relevant bullets are trimmed, older/low-relevance roles first and documented figures last.
   - Every bullet passes code guards: vague claimed outcomes ("…, enhancing user experience") are stripped, and bullets with figures, technologies or domain claims absent from the base resume are rejected.
   - A resume whose source genuinely can't support two full pages ends up shorter rather than padded.
   - The preview marks bullets that elaborate on documented work (not in the PDF) so you can review them.
5. **Writing cover letter**
6. **Generating PDF documents**: `@react-pdf/renderer` with embedded Carlito (Calibri-metric, OFL)

Company names, job titles, dates, education, and certifications are copied from the parsed resume, never from the rewriting step. Keyword coverage is computed deterministically from the final document. It is an indicator, not an ATS score.

### Code layout

```
app/api/resume/parse      upload → text extraction (PDF/DOCX/TXT)
app/api/resume/generate   streaming optimization workflow
app/api/documents/[id]    PDF / ZIP downloads (random UUID, expiring)
app/api/health            liveness check (request-time, no-store): {status, ai, uptimeSeconds, timestamp}
components/resume/        UI
lib/prompts/              all prompts, separate from logic
lib/schemas.ts            zod schemas for every AI response
services/ai/              provider abstraction (AIProvider interface + OpenAI implementation)
services/resume/          parser, analyzer, optimizer, two-page layout fitter, bullet normalizer, fact checker, workflow
services/pdf/             resume + cover letter PDF templates, PDF measurement
services/documents/       in-memory expiring document store
```

### Server startup

On a visitor's first load in a browser session, a modal ("Starting the server… about 1 minute") covers the page and polls `GET /api/health` every 3 seconds until it responds, which handles hosts that sleep idle servers. After a success it is skipped for the rest of the session. After 90 seconds it offers a manual retry and keeps polling.

### Privacy

Resumes are processed in memory and never written to disk. Generated PDFs are kept in server memory for `DOCUMENT_TTL_MINUTES` and then discarded. Logs record only error codes and stages, never document content, contact details, or keys. The document store runs in a single process. For multi-instance or serverless hosting, replace `services/documents/DocumentStore.ts` with a shared store (Redis, or S3 with expiring objects).
