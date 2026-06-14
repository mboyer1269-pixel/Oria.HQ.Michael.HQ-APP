import "server-only";

import fs from "fs/promises";
import path from "path";
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

export type DocumentBriefSnapshot = {
  totalCount: number;
  byHat: Record<string, number>;
  recent: Array<{
    id: string;
    filename: string;
    hat: string;
  }>;
};

async function readDocumentIndex(
  dbPath = path.join(process.cwd(), "db", "documents.json"),
): Promise<DocumentIndexEntry[]> {
  // db/documents.json is a dev/test fixture, never a production datastore. In
  // production this is fail-closed (returns empty without reading the file)
  // unless the explicit unsafe break-glass flag is set.
  if (!isFileDocumentStoreAllowed()) {
    return [];
  }
  warnIfUnsafeFileDocumentStore();

  try {
    const content = await fs.readFile(dbPath, "utf-8");
    const parsed: unknown = JSON.parse(content);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter((doc): doc is DocumentIndexEntry => {
      if (!doc || typeof doc !== "object") return false;

      const candidate = doc as Partial<DocumentIndexEntry>;

      return (
        typeof candidate.id === "string" &&
        typeof candidate.filename === "string" &&
        typeof candidate.hat === "string" &&
        typeof candidate.created_at === "string"
      );
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;

    if (code !== "ENOENT") {
      console.error("Document index read failed:", error);
    }

    return [];
  }
}

export async function getDocumentBriefSnapshot(limit = 3, dbPath?: string): Promise<DocumentBriefSnapshot> {
  const documents = await readDocumentIndex(dbPath);
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
    totalCount: documents.length,
    byHat,
    recent,
  };
}
