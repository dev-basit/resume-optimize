import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Short-lived, in-memory storage for generated PDFs.
 *
 * - Documents are addressed by an unguessable random UUID (122 bits of entropy).
 * - Nothing is written to disk; entries expire after DOCUMENT_TTL_MINUTES
 *   (default 30) and are swept on every access.
 * - Memory is bounded: the oldest entries are evicted beyond MAX_ENTRIES.
 *
 * This fits a single Node.js server (next start / next dev). On multi-instance
 * or serverless deployments, swap this module for a shared store (Redis, S3
 * with expiring objects) behind the same functions.
 */

export interface StoredDocumentFile {
  fileName: string;
  data: Uint8Array;
}

export interface StoredDocuments {
  resume: StoredDocumentFile;
  coverLetter: StoredDocumentFile;
  zipFileName: string;
  expiresAt: number;
}

const MAX_ENTRIES = 100;

function ttlMs(): number {
  const minutes = Number.parseInt(process.env.DOCUMENT_TTL_MINUTES ?? "", 10);
  return (Number.isFinite(minutes) && minutes > 0 && minutes <= 24 * 60 ? minutes : 30) * 60_000;
}

// Survive module re-evaluation in development (HMR) and share across route bundles.
const globalStore = globalThis as typeof globalThis & {
  __resumeDocumentStore?: Map<string, StoredDocuments>;
};
const store = (globalStore.__resumeDocumentStore ??= new Map<string, StoredDocuments>());

function sweep(now = Date.now()) {
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) store.delete(id);
  }
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function saveDocuments(docs: Omit<StoredDocuments, "expiresAt">): { id: string; expiresAt: Date } {
  sweep();
  const id = randomUUID();
  const expiresAt = Date.now() + ttlMs();
  store.set(id, { ...docs, expiresAt });
  sweep();
  return { id, expiresAt: new Date(expiresAt) };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getDocuments(id: string): StoredDocuments | null {
  if (!UUID_PATTERN.test(id)) return null;
  sweep();
  return store.get(id) ?? null;
}
