#!/usr/bin/env node

// Joris brain critical path (offline): structured intents are deterministic and
// must NOT go through the conversational LLM seam wired in CLEAN-003. Locks that
// the LLM is scoped to the chat catch-all only — a structured intent never calls
// the reply generator and never reports generation: "llm".

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

process.env.NODE_ENV = "development";

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { runJorisCommand } = await jiti.import(path.join(projectRoot, "src/server/joris/brain.ts"));

test("a structured intent does not invoke the conversational LLM", async () => {
  let replyCalls = 0;
  const deps = {
    generateReply: async () => {
      replyCalls += 1;
      return { ok: true, text: "SHOULD_NOT_BE_USED", modelId: "mock" };
    },
  };

  const result = await runJorisCommand("Planifie la mission lancement", undefined, deps);

  assert.equal(result.intent, "mission.plan");
  assert.equal(replyCalls, 0, "structured intent must not call the LLM reply generator");
  assert.equal(result.generation, undefined, "structured intent must not be labelled as LLM-generated");
  assert.notEqual(result.summary, "SHOULD_NOT_BE_USED");
});
