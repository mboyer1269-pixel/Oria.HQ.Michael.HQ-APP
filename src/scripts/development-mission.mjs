/** Local privileged host bridge for development mission admission.
 *
 * Identity comes from the protected configuration only (mode 0600 file owned by operator).
 * The client may not choose a workspace, mode or actor.
 * HTTP remains the user authority; the CLI trusted adapter delegates to
 * canonical createDevelopmentService, never providing a public bypass route.
 *
 * Admission never launches. A saved receipt carries executionRequested: false.
 * Launch authorization must be explicitly granted by the owner (Michael) via HQ UI.
 *
 * Pre-write errors are categorized as:
 * - 'unavailable' (exit 3): configuration missing, invalid file, unreadable environment.
 * - 'invalid_request' (exit 3): oversized stdin, malformed JSON, schema violation, workspace mismatch.
 * - 'outcome_unknown' (exit 2): RESERVED STRICTLY to write attempts where the effect cannot be determined.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createJiti} from 'jiti';
import {z} from 'zod';

async function main() {
  // Phase 1 : Configuration & Environment Validation (Pre-write)
  let configuration;
  try {
    if (process.argv.length !== 3) throw Error('configuration_required');
    const filename = path.resolve(process.argv[2]);
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) throw Error('invalid_configuration');
    const contextSchema = z.object({
      workspaceId: z.string().min(1).max(160),
      modeId: z.string().min(1).max(160),
      actorId: z.string().min(1).max(160),
    }).strict();
    configuration = z.object({ context: contextSchema }).strict()
      .parse(JSON.parse(await fs.readFile(filename, 'utf8')));
  } catch {
    process.stdout.write(JSON.stringify({ status: 'unavailable' }) + '\n');
    process.exitCode = 3;
    return;
  }

  // Phase 2 : Request Reading & Parsing (Pre-write)
  let parsed;
  let service;
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 65536) throw Error('oversized_request');
      chunks.push(chunk);
    }

    const root = path.resolve(import.meta.dirname, '../..');
    const jiti = createJiti(import.meta.url, {
      alias: {
        '@': path.join(root, 'src'),
        'server-only': path.join(root, 'src/scripts/smoke/server-only-stub.mjs'),
      },
    });
    const { createDevelopmentService, developmentInputSchema } = await jiti.import('../server/missions/development-mission.ts');
    service = createDevelopmentService();

    const echoed = z.string().min(1).max(160).optional();
    const requestSchema = z.discriminatedUnion('operation', [
      z.object({ operation: z.literal('lookup'), requestId: z.string().uuid(), workspaceId: echoed }).strict(),
      z.object({ operation: z.literal('create'), request: developmentInputSchema, workspaceId: echoed }).strict(),
    ]);

    let rawBody;
    try {
      rawBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw Error('malformed_json');
    }

    parsed = requestSchema.parse(rawBody);
    if (parsed.workspaceId !== undefined && parsed.workspaceId !== configuration.context.workspaceId) {
      throw Error('workspace_mismatch');
    }
  } catch {
    process.stdout.write(JSON.stringify({ status: 'invalid_request' }) + '\n');
    process.exitCode = 3;
    return;
  }

  // Phase 3 : Dispatch
  if (parsed.operation === 'lookup') {
    try {
      const result = await service.lookup(parsed.requestId, configuration.context.workspaceId);
      process.stdout.write(JSON.stringify(result) + '\n');
      if (!['saved', 'not_found'].includes(result.status)) {
        process.exitCode = 3;
      }
    } catch {
      process.stdout.write(JSON.stringify({ status: 'unavailable' }) + '\n');
      process.exitCode = 3;
    }
    return;
  }

  // parsed.operation === 'create' : write attempt
  try {
    const result = await service.create(parsed.request, configuration.context);
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result.status === 'saved') {
      process.exitCode = 0;
    } else if (result.status === 'outcome_unknown') {
      process.exitCode = 2;
    } else {
      process.exitCode = 3;
    }
  } catch {
    // Write effect cannot be determined: outcome_unknown with exit code 2
    process.stdout.write(JSON.stringify({ status: 'outcome_unknown' }) + '\n');
    process.exitCode = 2;
  }
}

await main().catch(() => {
  process.stdout.write(JSON.stringify({ status: 'outcome_unknown' }) + '\n');
  process.exitCode = 2;
});
