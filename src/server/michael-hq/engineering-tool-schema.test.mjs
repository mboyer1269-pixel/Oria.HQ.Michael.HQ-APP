import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

const fileSchema = z.object({ path: z.string().min(1), content: z.string() });

const engineeringPackagePayloadSchema = z
  .object({
    agentId: z.string().min(1),
    skillId: z.string().min(1),
    client: z.string().min(1),
    email: z.string().email(),
    actionType: z.string().min(1),
    missionId: z.string().min(1),
    data: z
      .object({
        intentId: z.string().min(1),
        packageId: z.string().min(1),
        title: z.string().min(1),
        brief: z.string().min(1),
        modeId: z.string().min(1),
        files: z.array(fileSchema).min(1),
      })
      .passthrough(),
  })
  .strict();

test("engineering package payload accepts telemetry-enriched data", () => {
  const parsed = engineeringPackagePayloadSchema.safeParse({
    agentId: "engineering",
    skillId: "infrastructure.generate",
    client: "Acme",
    email: "ceo@acme.test",
    actionType: "infrastructure.code_package",
    missionId: "mission_1",
    data: {
      intentId: "intent_abc",
      packageId: "pkg_abc",
      title: "API stack",
      brief: "Portable docker compose",
      modeId: "hq",
      files: [{ path: "Dockerfile", content: "FROM node:22" }],
      estimated_cost: { totalUsd: 0.01 },
    },
  });
  assert.equal(parsed.success, true);
});
