import assert from "node:assert/strict";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const tickMod = await jiti.import(path.join(__dirname, "hermes-prep-tick.ts"));
const cashMod = await jiti.import(path.join(projectRoot, "src/features/ventures/cash-action-packet.ts"));

const { runHermesPrepTick } = tickMod;
const { buildCashActionPacket } = cashMod;

const USER = "11111111-1111-1111-1111-111111111111";
const AT = "2026-06-02T00:00:00.000Z";

function makePacket(i) {
  return buildCashActionPacket({
    packetId: `packet-${i}`,
    ventureId: "venture-001",
    agentId: "agent-001",
    targetBuyer: `Buyer ${i}`, // THIS MAKES IT UNIQUE
    buyerType: "smb",
    painHypothesis: "They reconcile pipeline by hand every Friday and lose 3 hours to it.",
    offer: "A done-for-you weekly pipeline reconciliation, delivered every Friday.",
    pricePointCents: 49_000,
    callToAction: "Reply 'pilot' to start a paid 2-week pilot this Friday.",
    outreachDraft: "Hi {name}, saw your team reconciles pipeline manually — want a Friday report?",
    expectedCashSignal: "email_reply",
    requiredEvidence: ["email_reply"],
    expectedCashImpactCents: 49_000,
    expectedCostCents: 7_000,
    createdAt: AT,
  });
}

const packets = Array.from({ length: 50 }, (_, i) => makePacket(i));

const stubCouncil = () => ({
  readiness: "ready_for_ceo",
  verdictDecision: "needs_ceo_decision",
  recommendedManualAction: "CEO manually adapts and sends the outreach draft.",
});

const deps = {
  composeCouncil: stubCouncil,
  listExisting: async () => [],
  enqueue: async (_ws, _uid, action) => {
    // Simulate I/O delay correctly
    return new Promise(resolve => setTimeout(() => resolve(action), 10));
  },
  snapshotScores: async () => 0,
  now: () => AT,
};

async function runBenchmark() {
  const start = performance.now();
  await runHermesPrepTick(
    { workspaceId: "ws1", userId: USER, packets },
    deps
  );
  const end = performance.now();
  console.log(`Benchmark completed in ${end - start} ms`);
}

runBenchmark().catch(console.error);
