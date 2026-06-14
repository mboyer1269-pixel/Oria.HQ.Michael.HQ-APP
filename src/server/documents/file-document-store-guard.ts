// src/server/documents/file-document-store-guard.ts
//
// Guard for the local file-backed document store (db/documents.json).
//
// db/documents.json is a DEV/TEST fixture only — never a production datastore.
// The real production path is the Supabase `documents` table (db/schema.sql).
// See docs/migrations/documents-file-store-to-db.md.
//
// Behaviour:
//   - development / test  -> allowed.
//   - production          -> fail-closed (NOT allowed), UNLESS the explicit
//     unsafe break-glass env flag is set to "true", which logs a loud warning.
//
// Pure env check: no side effects beyond an opt-in warning, no server-only so it
// can be shared by the server runtime and the dev CLI (src/scripts).

/** Break-glass env var. UNSAFE — forces the file store ON in production. */
export const UNSAFE_FILE_DOCUMENT_STORE_ENV = "ORIA_UNSAFE_ALLOW_FILE_DOCUMENT_STORE_IN_PROD";

/**
 * Whether the file-backed document store may be used in the current environment.
 * True outside production; in production only with the explicit unsafe opt-in.
 */
export function isFileDocumentStoreAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env[UNSAFE_FILE_DOCUMENT_STORE_ENV] === "true";
}

let warnedUnsafeProdFileStore = false;

/**
 * Emits a loud one-time warning when the unsafe break-glass flag forces the file
 * store on in production. No-op everywhere else.
 */
export function warnIfUnsafeFileDocumentStore(): void {
  if (warnedUnsafeProdFileStore) return;
  if (
    process.env.NODE_ENV === "production" &&
    process.env[UNSAFE_FILE_DOCUMENT_STORE_ENV] === "true"
  ) {
    warnedUnsafeProdFileStore = true;
    console.warn(
      `[documents] UNSAFE: ${UNSAFE_FILE_DOCUMENT_STORE_ENV}=true — the file-backed ` +
        "document store (db/documents.json) is active IN PRODUCTION. This is a " +
        "break-glass dev/test fixture, NOT a production datastore. Migrate to the " +
        "Supabase `documents` table and unset this flag.",
    );
  }
}
