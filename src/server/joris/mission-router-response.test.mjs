#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Mission Router Response Formatter tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const formatterMod = await jiti.import(path.join(__dirname, "mission-router-response.ts"));
  const routerMod = await jiti.import(path.join(__dirname, "mission-router.ts"));

  const { formatMissionRouterResponse } = formatterMod;
  const { routeMissionRequest } = routerMod;

  await t.test("formatter includes dry-run and 'aucune action exécutée'", () => {
    const result = routeMissionRequest("Hello Joris", "user_123");
    const formatted = formatMissionRouterResponse(result);

    assert.ok(formatted.includes("dry-run"));
    assert.ok(formatted.includes("Aucune action n’a été exécutée"));
    assert.ok(formatted.includes("Note Human-on-the-Loop"));
  });

  await t.test("formatter includes owner agent, boosters, approval gates, next action", () => {
    const result = routeMissionRequest("We need to build and deploy the new dashboard", "user_123");
    const formatted = formatMissionRouterResponse(result);

    assert.ok(formatted.includes("Propriétaire (Owner Agent)"));
    assert.ok(formatted.includes("product-builder"));
    assert.ok(formatted.includes("Boosters recommandés"));
    assert.ok(formatted.includes("Portes d'approbation requises"));
    assert.ok(formatted.includes("DEPLOYMENT"));
    assert.ok(formatted.includes("LIVE_RUNTIME"));
    assert.ok(formatted.includes("Prochaine action"));
  });

  await t.test("formatter handles VentureWorkOrder", () => {
    const result = routeMissionRequest("Trouve-moi une idée de business autonome avec IA", "user_123");
    const formatted = formatMissionRouterResponse(result);

    assert.ok(formatted.includes("VentureWorkOrder"));
    assert.ok(formatted.includes("revenue-operator"));
    assert.ok(formatted.includes("MONEY"));
    assert.ok(formatted.includes("PUBLISHING"));
  });

  await t.test("formatter handles MissionWorkOrder", () => {
    const result = routeMissionRequest("Fais des recherches sur le marché de l'IA", "user_123");
    const formatted = formatMissionRouterResponse(result);

    assert.ok(formatted.includes("MissionWorkOrder"));
    assert.ok(formatted.includes("innovation-scout"));
    assert.ok(formatted.includes("Aucune porte d'approbation requise (bas risque)"));
  });

  await t.test("formatter does not mutate input", () => {
    const result = routeMissionRequest("Fais des recherches sur le marché de l'IA", "user_123");
    const clonedOriginal = JSON.parse(JSON.stringify(result));

    formatMissionRouterResponse(result);

    assert.deepEqual(result, clonedOriginal);
  });
});
