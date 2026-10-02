#!/usr/bin/env node
//
// WIRING TRIPWIRE (see run-tests.mjs) — intentionally red until someone wires
// the OpenHands launch path to the account/capability discovery built in
// this lot. It documents the exact missing call instead of silently leaving
// it undone.
//
// Built and tested (green, standalone) by this lot:
//   - src/server/agents/models/provider-connection-discovery.ts
//       resolveProviderConnectionDiscovery() / deriveUnavailableModelIds()
//   - src/server/missions/openhands-model-execution-receipt.ts
//       buildModelExecutionReceipt()
//
// Why this is a source check, not a behavioral one: fully exercising
// createOpenHandsLaunchService() end to end requires a complete LaunchStore,
// reservation receipt, and submission dossier fixture (see
// openhands-launch.test.mjs) that this lot does not own and should not
// improvise against. A source-presence check is the smallest honest tripwire
// that cannot be satisfied by accident and turns green the moment the real
// call is added, wherever in the launch path it ends up living.
//
// The missing call, concretely: before createOpenHandsLaunchService() calls
// store.persistAuthority() (openhands-launch.ts), the launch config's
// implied runtime adapter should be checked against a fresh
// ProviderConnectionSnapshot via isExecutionReady() — refusing with a new
// closed("connection_required") status when it is not — and on launch
// completion, a ModelExecutionReceipt should be attached using the same
// launchId as the LaunchClaim, so requestedModelId/executedModelId/
// usage/cost stay structurally distinct per the 2026-10-02 mandate.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readSource(relativePath) {
  return readFile(path.join(__dirname, relativePath), "utf8");
}

test("OpenHands launch <-> model connection discovery wiring", async (t) => {
  await t.test("GAP: launch path does not yet consult provider connection discovery", async () => {
    const launchSource = await readSource("openhands-launch.ts");
    const submissionSource = await readSource("openhands-submission.ts");
    const combined = `${launchSource}\n${submissionSource}`;
    const consultsDiscovery =
      combined.includes("provider-connection-discovery") &&
      (combined.includes("resolveProviderConnectionDiscovery") || combined.includes("deriveUnavailableModelIds"));
    assert.equal(
      consultsDiscovery,
      true,
      "openhands-launch.ts / openhands-submission.ts must import and call " +
        "resolveProviderConnectionDiscovery() or deriveUnavailableModelIds() from " +
        "./../agents/models/provider-connection-discovery before authorizing a launch — " +
        "currently neither file references that module at all",
    );
  });

  await t.test("GAP: launch path does not yet attach a model execution receipt", async () => {
    const launchSource = await readSource("openhands-launch.ts");
    const attachesReceipt =
      launchSource.includes("openhands-model-execution-receipt") &&
      launchSource.includes("buildModelExecutionReceipt");
    assert.equal(
      attachesReceipt,
      true,
      "openhands-launch.ts must import and call buildModelExecutionReceipt() from " +
        "./openhands-model-execution-receipt, keyed by the same launchId as the " +
        "LaunchClaim, so requestedModelId/executedModelId/usage/cost are recorded " +
        "per launch — currently it is never called",
    );
  });
});
