// Lot A′ — preuve que la règle ESLint de frontière UI est active (test négatif) :
// un composant qui importe la base ou un moteur doit faire échouer le lint.
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const eslint = new ESLint({ cwd: root });
const UI_FILE = path.join(root, "src/features/hq/components/__boundary-probe__.tsx");
const RULE = "@typescript-eslint/no-restricted-imports";

async function errorsFor(code, filePath = UI_FILE) {
  const [r] = await eslint.lintText(code, { filePath });
  return r.messages.filter((m) => m.ruleId === RULE && m.severity === 2);
}

const forbidden = [
  'import { createClient } from "@supabase/supabase-js";',
  'import { Pool } from "pg";',
  'import { getDb } from "@/server/db/client";',
  'import { runJorisCommand } from "@/server/joris/brain";',
  'import { runSubscriptionTurn } from "@/server/ai/subscription-runtime";',
  'import { codexRuntime } from "@/server/agents/runtimes/codex";',
  'import { serverEnv } from "@/lib/server-env";',
];

test("UI boundary: forbidden imports make lint fail", async (t) => {
  for (const line of forbidden) {
    await t.test(line, async () => {
      const errs = await errorsFor(`${line}\nexport const x = 1;\n`);
      assert.equal(errs.length, 1, `attendu 1 erreur pour ${line}`);
    });
  }
});

test("UI boundary: type-only imports and server files stay allowed", async () => {
  assert.equal((await errorsFor('import type { MichaelHqDatabase } from "@/server/db/types";\nexport type X = MichaelHqDatabase;\n')).length, 0);
  const serverFile = path.join(root, "src/server/hq/__boundary-probe__.ts");
  assert.equal((await errorsFor('import { runJorisCommand } from "@/server/joris/brain";\nexport const x = runJorisCommand;\n', serverFile)).length, 0);
});
