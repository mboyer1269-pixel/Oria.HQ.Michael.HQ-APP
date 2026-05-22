#!/usr/bin/env node
/**
 * Local runtime health echo smoke check.
 *
 * Exercises the mock/local signed payload path only:
 *   - no VPS
 *   - no Docker
 *   - no live executor
 *   - no external writes
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
  },
});

const runtimePath = path.join(projectRoot, "src", "server", "runtime", "local-runtime.ts");
const {
  RUNTIME_HEALTH_ECHO_SKILL_ID,
  buildMockLocalRuntimeInstruction,
  runLocalRuntimeInstruction,
  verifyMockLocalRuntimeResult,
} = await jiti.import(runtimePath);

const now = new Date("2026-05-22T12:00:00.000Z");
const instruction = buildMockLocalRuntimeInstruction({
  instructionId: "local_echo_smoke_001",
  now,
  ttlSeconds: 120,
  inputPayload: {
    message: "ping",
    correlationId: "runtime-smoke",
  },
});

const result = runLocalRuntimeInstruction(instruction, { now });

const tamperedInstruction = {
  ...instruction,
  skill: {
    ...instruction.skill,
    inputPayload: {
      message: "tampered",
    },
  },
};
const tamperedResult = runLocalRuntimeInstruction(tamperedInstruction, { now });

const liveInstruction = buildMockLocalRuntimeInstruction({
  instructionId: "local_echo_smoke_live",
  now,
  mode: "live",
  inputPayload: { message: "ping" },
});
const liveResult = runLocalRuntimeInstruction(liveInstruction, { now });

const expiredResult = runLocalRuntimeInstruction(instruction, {
  now: new Date("2026-05-22T12:03:00.000Z"),
});

const unsupportedInstruction = buildMockLocalRuntimeInstruction({
  instructionId: "local_echo_smoke_unsupported",
  now,
  skillId: "calendar.book",
  inputPayload: { message: "ping" },
});
const unsupportedResult = runLocalRuntimeInstruction(unsupportedInstruction, { now });

const checks = [
  ["skill id is runtime.health.echo", instruction.skill.skillId === RUNTIME_HEALTH_ECHO_SKILL_ID],
  ["instruction mode is dry_run", instruction.mode === "dry_run"],
  ["approvalConfirmed is false", instruction.approval.approvalConfirmed === false],
  ["signed instruction completes", result.outcome === "completed"],
  ["echo output preserves message", result.output?.echo?.message === "ping"],
  ["echo output preserves correlationId", result.output?.echo?.correlationId === "runtime-smoke"],
  ["echo output has no side effects", result.output?.sideEffects?.length === 0],
  ["result signature verifies", verifyMockLocalRuntimeResult(result) === true],
  ["tampered instruction is rejected", tamperedResult.outcome === "rejected"],
  ["tampered rejection is bad_signature", tamperedResult.rejectionReason === "bad_signature"],
  ["live mode is rejected", liveResult.rejectionReason === "live_mode_not_supported"],
  ["expired instruction is rejected", expiredResult.rejectionReason === "expired_instruction"],
  ["unsupported skill is rejected", unsupportedResult.rejectionReason === "unsupported_skill"],
];

console.log("[smoke:runtime] instruction:");
console.log(JSON.stringify(instruction, null, 2));
console.log("[smoke:runtime] result:");
console.log(JSON.stringify(result, null, 2));
console.log("[smoke:runtime] checks:");

const failed = [];
for (const [name, pass] of checks) {
  console.log(`  [${pass ? "ok" : "fail"}] ${name}`);
  if (!pass) failed.push(name);
}

if (failed.length > 0) {
  console.error(`[smoke:runtime] FAIL - ${failed.length} check(s) failed`);
  process.exit(1);
}

console.log("[smoke:runtime] PASS");
process.exit(0);
