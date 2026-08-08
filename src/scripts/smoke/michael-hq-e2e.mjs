#!/usr/bin/env node
/**
 * michael-hq-e2e.mjs — local end-to-end proof of the CEO cycle:
 *   Validation report → telemetry cost → theatre pending → CEO approve charge
 *   → Engineering package deliver → Finance dashboard visibility
 *
 * No LLM / Stripe / Supabase required. Exercises real modules in local mode.
 */

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(root, "src"),
    "server-only": path.join(root, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const steps = [];
function ok(name, detail = "") {
  steps.push(`  [ok] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const { normalizeMarketReport } = await jiti.import(
    path.join(root, "src/server/agents/validation-report-normalize.ts"),
  );
  const { applyTelemetryToIntent } = await jiti.import(
    path.join(root, "src/server/michael-hq/intent-telemetry.ts"),
  );
  const { mapIntentToTheatrePending } = await jiti.import(
    path.join(root, "src/server/hq/theatre-stream.ts"),
  );
  const { buildAgentExecutionIntent } = await jiti.import(
    path.join(root, "src/features/agents/execution-intent.ts"),
  );
  const { createAgentExecutionIntent, transitionAgentExecutionIntent } =
    await jiti.import(path.join(root, "src/server/agents/execution-intent-repository.ts"));
  const { saveValidationReport } = await jiti.import(
    path.join(root, "src/server/agents/validation-report-store.ts"),
  );
  const { saveInfrastructurePackage, listInfrastructurePackages } = await jiti.import(
    path.join(root, "src/server/agents/engineering-package-store.ts"),
  );
  const { syncApprovedUsageCharge, REVENUE_SHARE_PERCENT, BILLING_MODEL } =
    await jiti.import(path.join(root, "src/server/michael-hq/stripe-billing.ts"));
  const { getWalletSnapshot, resetWallet } = await jiti.import(
    path.join(root, "src/server/michael-hq/wallet.ts"),
  );
  const { buildFinanceDashboard } = await jiti.import(
    path.join(root, "src/server/michael-hq/finance-dashboard.ts"),
  );

  const workspaceId = "ws_michael_hq_e2e";
  const userId = "user_ceo_e2e";
  resetWallet(workspaceId);

  // ── 1. Validation agent demand-check (structured JSON) ───────────────────
  const market = normalizeMarketReport(
    {
      title: "Portable SMB scheduling API",
      projectBrief: "Docker-first scheduling API for SMBs — zero vendor lock-in.",
      marketSizing: {
        tamUsd: 8_000_000_000,
        samUsd: 400_000_000,
        somUsd: 4_000_000,
        currency: "USD",
        rationale: "SMB scheduling software spend in NA.",
      },
      acquisitionChannels: [
        { channel: "LinkedIn outbound to founders", fit: "high", notes: "Direct ICP" },
        { channel: "Product Hunt launch", fit: "medium", notes: "Awareness" },
      ],
      demandVerdict: "proceed",
      evidenceSummary: "Credible beachhead: 5–50 employee SMBs with calendar ops pain.",
    },
    "fallback",
  );
  assert.ok(market);
  assert.equal(market.demandVerdict, "proceed");
  ok("validation demand-check JSON", `verdict=${market.demandVerdict}`);

  // ── 2. Telemetry on PENDING intent ───────────────────────────────────────
  const intentId = `intent_e2e_${Date.now()}`;
  const { payload, telemetry } = applyTelemetryToIntent({
    payload: {
      agentId: "validation",
      skillId: "market.demand_check",
      client: "Michael HQ",
      email: "ceo@michaelhq.test",
      actionType: "market.demand_check",
      missionId: "mission_e2e_1",
      data: {
        intentId,
        reportId: market.reportId,
        title: market.title,
        projectBrief: market.projectBrief,
        modeId: "hq",
        marketSizing: market.marketSizing,
        acquisitionChannels: market.acquisitionChannels,
        demandVerdict: market.demandVerdict,
        evidenceSummary: market.evidenceSummary,
      },
    },
    tokenUsage: {
      modelId: "claude-sonnet-4-6",
      inputTokens: 1800,
      outputTokens: 900,
    },
  });
  assert.ok(telemetry.estimated_cost.totalUsd > 0);
  ok("telemetry estimated_cost", `$${telemetry.estimated_cost.totalUsd.toFixed(4)}`);

  const intent = buildAgentExecutionIntent({
    intentId,
    workspaceId,
    agentId: "validation",
    skillId: "market.demand_check",
    toolName: "validation_report_deliver",
    autonomyLevel: 2,
    payload,
    createdAt: new Date().toISOString(),
  });
  await createAgentExecutionIntent(workspaceId, userId, intent);

  const theatre = mapIntentToTheatrePending(intent);
  assert.ok(theatre);
  assert.equal(typeof theatre.estimatedCostUsd, "number");
  ok("approval rail cost visible", `$${theatre.estimatedCostUsd.toFixed(4)}`);

  // ── 3. CEO APPROVE → validation report + usage charge ────────────────────
  await transitionAgentExecutionIntent(workspaceId, intentId, {
    toStatus: "executing",
    expectedFromStatus: "pending",
    updatedAt: new Date().toISOString(),
  });
  saveValidationReport({
    reportId: market.reportId,
    workspaceId,
    modeId: "hq",
    intentId,
    agentId: "validation",
    title: market.title,
    projectBrief: market.projectBrief,
    marketSizing: market.marketSizing,
    acquisitionChannels: market.acquisitionChannels,
    demandVerdict: market.demandVerdict,
    evidenceSummary: market.evidenceSummary,
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    estimatedCost: telemetry.estimated_cost,
  });
  const charge1 = await syncApprovedUsageCharge(
    {
      workspaceId,
      userId,
      intentId,
      agentId: "validation",
      skillId: "market.demand_check",
      estimatedCost: telemetry.estimated_cost,
    },
    {},
  );
  await transitionAgentExecutionIntent(workspaceId, intentId, {
    toStatus: "executed",
    updatedAt: new Date().toISOString(),
    actionRef: "e2e_validation_ok",
  });
  assert.equal(charge1.revenueSharePercent, 0);
  assert.equal(BILLING_MODEL, "usage_only_no_revenue_share");
  ok("CEO approve + wallet charge", `${charge1.walletEntry.amountCents}¢ · share=${REVENUE_SHARE_PERCENT}%`);

  // ── 4. Engineering package (portable) after validation GO ────────────────
  const packageId = `pkg_e2e_${Date.now()}`;
  const engIntentId = `intent_eng_${Date.now()}`;
  const engTelemetry = applyTelemetryToIntent({
    payload: {
      agentId: "engineering",
      skillId: "infrastructure.generate",
      client: "Michael HQ",
      email: "ceo@michaelhq.test",
      actionType: "infrastructure.code_package",
      missionId: "mission_e2e_1",
      data: { intentId: engIntentId, packageId, modeId: "hq" },
    },
    tokenUsage: { modelId: "claude-sonnet-4-6", inputTokens: 4000, outputTokens: 2500 },
  });
  saveInfrastructurePackage({
    packageId,
    workspaceId,
    modeId: "hq",
    intentId: engIntentId,
    agentId: "engineering",
    title: "SMB scheduling API — Docker portable",
    brief: "Dockerfile + compose + README — owner-controlled deploy.",
    files: [
      { path: "Dockerfile", content: "FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nCMD [\"node\",\"server.js\"]\n" },
      { path: "docker-compose.yml", content: "services:\n  api:\n    build: .\n    ports: [\"3000:3000\"]\n" },
      { path: "README.md", content: "# Portable deploy\nClone → docker compose up. No lock-in.\n" },
    ],
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    estimatedCost: engTelemetry.telemetry.estimated_cost,
    exportTargets: ["download", "docker", "github"],
  });
  await syncApprovedUsageCharge(
    {
      workspaceId,
      userId,
      intentId: engIntentId,
      agentId: "engineering",
      skillId: "infrastructure.generate",
      estimatedCost: engTelemetry.telemetry.estimated_cost,
    },
    {},
  );
  const packages = listInfrastructurePackages(workspaceId);
  assert.ok(packages.some((p) => p.packageId === packageId));
  ok("engineering package exportable", `${packages[0].files.length} files · ${packageId}`);

  // ── 5. Finance dashboard transparency ────────────────────────────────────
  const finance = await buildFinanceDashboard(workspaceId);
  assert.equal(finance.revenueSharePercent, 0);
  assert.ok(finance.wallet.chargedCents > 0);
  assert.ok(finance.recentCharges.length >= 2);
  ok(
    "finance dashboard",
    `charged=${finance.wallet.chargedCents}¢ · balance=${finance.wallet.balanceCents}¢ · share=0%`,
  );

  console.log("[smoke:michael-hq-e2e] checks:");
  for (const line of steps) console.log(line);
  console.log("[smoke:michael-hq-e2e] PASS");
}

main().catch((err) => {
  console.error("[smoke:michael-hq-e2e] FAIL", err);
  process.exitCode = 1;
});
