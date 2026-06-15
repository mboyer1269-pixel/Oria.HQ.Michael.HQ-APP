import path from 'path';

/**
 * Resolves the durable archive directory for "mcl"-classified documents.
 *
 * REQUIRED, with NO fallback by design: the document-processing CLI MOVES the
 * source file (fs.renameSync). A temp-dir default could silently relocate real
 * documents (invoices/contracts) into purgeable storage, so when MCL_ARCHIVE_DIR
 * is unset this fails closed with a clear error instead of moving the file.
 *
 * `env` is injectable for testing.
 */
export function resolveMclArchiveDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.MCL_ARCHIVE_DIR?.trim();
  if (!configured) {
    throw new Error(
      'MCL_ARCHIVE_DIR is not set. Configure a durable archive directory (see ' +
        '.env.example) before processing "mcl" documents. Refusing to move files ' +
        'to a temporary directory.',
    );
  }
  return path.resolve(configured);
}
