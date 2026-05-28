#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Joris Brain Work Order Preview integration tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const brainMod = await jiti.import(path.join(__dirname, "brain.ts"));
  const { runJorisCommand } = brainMod;

  await t.test("surfaces dry-run Work Order preview for business/opportunity French command", async () => {
    const result = await runJorisCommand("Trouve-moi une idée de business autonome avec IA");

    assert.equal(result.intent, "opportunity.score");
    assert.equal(result.requiresConfirmation, false);
    assert.ok(result.summary.includes("dry-run"));
    assert.ok(result.summary.includes("Aucune action n’a été exécutée"));
    assert.ok(result.summary.includes("VentureWorkOrder"));
    assert.ok(result.summary.includes("revenue-operator"));
    assert.ok(result.summary.includes("MONEY"));
    assert.ok(result.summary.includes("Note Human-on-the-Loop"));
  });

  await t.test("surfaces dry-run Work Order preview for opportunity revenue command", async () => {
    const result = await runJorisCommand("Prépare une opportunité de revenu pour Orya");

    assert.equal(result.intent, "opportunity.score");
    assert.equal(result.requiresConfirmation, false);
    assert.ok(result.summary.includes("dry-run"));
    assert.ok(result.summary.includes("Aucune action n’a été exécutée"));
    assert.ok(result.summary.includes("VentureWorkOrder"));
  });

  await t.test("retains normal calendar booking flow trigger", async () => {
    const result = await runJorisCommand("Book RDV demain 10h00");

    assert.equal(result.intent, "mission.draft");
    assert.equal(result.requiresConfirmation, true);
    assert.ok(result.pendingDraftId);
  });
});
