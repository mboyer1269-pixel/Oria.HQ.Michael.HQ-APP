import "server-only";

import fs from "fs/promises";
import path from "path";
import type { DocumentSourceObservation } from "@/core/types";
import {
  isFileDocumentStoreAllowed,
  warnIfUnsafeFileDocumentStore,
} from "@/server/documents/file-document-store-guard";

export type DocumentIndexEntry = {
  id: string;
  filename: string;
  hat: string;
  created_at: string;
};

export type DocumentBriefSnapshot = DocumentSourceObservation & {
  byHat: Record<string, number>;
  recent: Array<Pick<DocumentIndexEntry, "id" | "filename" | "hat">>;
};

type ReadResult = { status: "available"; documents: DocumentIndexEntry[] } | {
  status: "unavailable"; reason: "disabled" | "missing" | "read_error" | "invalid_data";
};

// Keep the filesystem path statically traceable. Tests inject a reader, not an
// arbitrary path that would make the deployment bundle include the whole repo.
async function readDocumentIndex(
  readContent = () => fs.readFile(path.join(process.cwd(), "db", "documents.json"), "utf-8"),
): Promise<ReadResult> {
  // db/documents.json is a dev/test fixture, never a production datastore. In
  // production this is fail-closed (unavailable without reading the file)
  // unless the explicit unsafe break-glass flag is set.
  if (!isFileDocumentStoreAllowed()) {
    return { status: "unavailable", reason: "disabled" };
  }
  warnIfUnsafeFileDocumentStore();

  try {
    const content = await readContent();
    const parsed: unknown = JSON.parse(content);

    if (!Array.isArray(parsed)) return { status: "unavailable", reason: "invalid_data" };

    const valid = parsed.every((doc): doc is DocumentIndexEntry => {
      if (!doc || typeof doc !== "object") return false;

      const candidate = doc as Partial<DocumentIndexEntry>;

      return (
        typeof candidate.id === "string" &&
        typeof candidate.filename === "string" &&
        typeof candidate.hat === "string" &&
        typeof candidate.created_at === "string"
      );
    });
    return valid ? { status: "available", documents: parsed as DocumentIndexEntry[] } : { status: "unavailable", reason: "invalid_data" };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;

    // Do not expose paths, fixture contents or parser excerpts in logs/API.
    return { status: "unavailable", reason: code === "ENOENT" ? "missing" : error instanceof SyntaxError ? "invalid_data" : "read_error" };
  }
}

export async function getDocumentBriefSnapshot(limit = 3, readContent?: () => Promise<string>): Promise<DocumentBriefSnapshot> {
  const result = await readDocumentIndex(readContent);
  if (result.status === "unavailable") return { source: "local_fixture", status: "unavailable", reason: result.reason, totalCount: null, byHat: {}, recent: [] };
  const documents = result.documents;
  const byHat = documents.reduce<Record<string, number>>((acc, doc) => {
    acc[doc.hat] = (acc[doc.hat] || 0) + 1;
    return acc;
  }, {});

  const recent = [...documents]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, limit)
    .map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      hat: doc.hat,
    }));

  return {
    source: "local_fixture", status: "available", reason: null,
    totalCount: documents.length,
    byHat,
    recent,
  };
}
