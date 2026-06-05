#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("WidgetManifest", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const { validateWidgetManifest } = await jiti.import(path.join(__dirname, "widget-manifest.ts"));

  const validManifest = {
    id: "decision-queue",
    title: "Decision Queue",
    description: "Projection des idées capturées depuis events.",
    renderKind: "decision_queue",
    dataTruth: "derived_from_events",
    source: {
      kind: "events",
      table: "events",
      eventTypes: ["idea.captured"],
      description: "Projection dérivée des events idea.captured.",
    },
    lifecycleStatus: "active",
    createdBy: "system",
    constraints: {
      noGeneratedCode: true,
      noRuntimeExecution: true,
      noJorisWidgetCreation: true,
      allowedEventTypes: ["idea.captured"],
    },
    layout: { region: "queue", order: 0, minColumnSpan: 1 },
  };

  await t.test("accepts a valid event-sourced manifest", () => {
    const result = validateWidgetManifest(validManifest);
    assert.equal(result.success, true);
  });

  await t.test("rejects Joris-created widgets in PR-1", () => {
    const result = validateWidgetManifest({ ...validManifest, createdBy: "joris" });
    assert.equal(result.success, false);
  });

  await t.test("rejects event widgets that do not point at events", () => {
    const result = validateWidgetManifest({
      ...validManifest,
      source: { ...validManifest.source, table: "widgets" },
    });
    assert.equal(result.success, false);
  });
});
