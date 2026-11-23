import { zipSync } from "fflate";
import { jsonError } from "@/lib/http";
import { getDocuments } from "@/services/documents/DocumentStore";

const FILE_TYPES = ["resume", "cover-letter", "zip"] as const;
type FileType = (typeof FILE_TYPES)[number];

/** Download a generated document: ?file=resume | cover-letter | zip */
export async function GET(request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  const file = new URL(request.url).searchParams.get("file") as FileType | null;
  if (!file || !FILE_TYPES.includes(file)) {
    return jsonError("INVALID_REQUEST", "Specify file=resume, cover-letter, or zip.", 400);
  }

  const docs = getDocuments(id);
  if (!docs) {
    return jsonError(
      "DOCUMENT_EXPIRED",
      "These documents have expired or no longer exist. Generate them again to download.",
      404,
    );
  }

  let data: Uint8Array;
  let fileName: string;
  let contentType: string;

  if (file === "zip") {
    data = zipSync(
      {
        [docs.resume.fileName]: [docs.resume.data, { level: 0 }],
        [docs.coverLetter.fileName]: [docs.coverLetter.data, { level: 0 }],
      },
      { mtime: new Date() },
    );
    fileName = docs.zipFileName;
    contentType = "application/zip";
  } else {
    const doc = file === "resume" ? docs.resume : docs.coverLetter;
    data = doc.data;
    fileName = doc.fileName;
    contentType = "application/pdf";
  }

  return new Response(new Blob([data as BlobPart], { type: contentType }), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(data.byteLength),
      // File names are generated server-side from [A-Za-z0-9-] only.
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
