import { createHmac, timingSafeEqual } from "node:crypto";

export const RUNTIME_HEALTH_ECHO_SKILL_ID = "runtime.health.echo";
export const LOCAL_RUNTIME_ID = "local-runtime";
export const LOCAL_RUNTIME_VERSION = "local-prototype-1";

const MOCK_LOCAL_SIGNING_KEY = "oria-local-runtime-mock-signing-key-not-a-secret";
const SIGNATURE_PREFIX = "mock-local:v1:";

export type LocalRuntimeMode = "dry_run" | "live";

export type LocalRuntimeInstruction = {
  instructionId: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
  mission: {
    missionId: string;
    workspaceId: string;
    status: string;
    transition: string;
  };
  agent: {
    agentId: string;
    role: string;
    autonomyLevel: number;
  };
  skill: {
    skillId: string;
    category: "runtime";
    inputPayload: Record<string, unknown>;
    outputConstraint: string;
  };
  approval: {
    approvalRecordId: string;
    approvalConfirmed: boolean;
    approverEmail: string;
    scope: string;
  };
  mode: LocalRuntimeMode;
};

export type LocalRuntimeRejectionReason =
  | "bad_signature"
  | "expired_instruction"
  | "live_mode_not_supported"
  | "approval_confirmed_not_supported"
  | "unsupported_skill";

export type LocalRuntimeResult = {
  instructionId: string;
  runtimeId: string;
  runtimeVersion: string;
  startedAt: string;
  finishedAt: string;
  outcome: "completed" | "rejected";
  rejectionReason?: LocalRuntimeRejectionReason;
  output?: {
    skillId: typeof RUNTIME_HEALTH_ECHO_SKILL_ID;
    echo: Record<string, unknown>;
    mode: "dry_run";
    sideEffects: [];
  };
  ledgerMetadata: {
    missionId: string;
    missionStatus: string;
    missionTransition: string;
    approvalConfirmed: boolean;
  };
  signature: string;
};

export type BuildMockLocalRuntimeInstructionInput = {
  instructionId?: string;
  now?: Date;
  ttlSeconds?: number;
  mode?: LocalRuntimeMode;
  skillId?: string;
  inputPayload?: Record<string, unknown>;
};

export type RunLocalRuntimeInstructionOptions = {
  now?: Date;
};

type UnsignedInstruction = Omit<LocalRuntimeInstruction, "signature">;
type UnsignedResult = Omit<LocalRuntimeResult, "signature">;

function normalizeForSigning(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForSigning(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((normalized, key) => {
        const nextValue = record[key];
        if (typeof nextValue !== "undefined") {
          normalized[key] = normalizeForSigning(nextValue);
        }
        return normalized;
      }, {});
  }

  return value;
}

function canonicalize(value: unknown): string {
  return JSON.stringify(normalizeForSigning(value));
}

function signPayload(payload: unknown): string {
  const digest = createHmac("sha256", MOCK_LOCAL_SIGNING_KEY)
    .update(canonicalize(payload))
    .digest("hex");
  return `${SIGNATURE_PREFIX}${digest}`;
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function stripInstructionSignature(instruction: LocalRuntimeInstruction): UnsignedInstruction {
  return {
    instructionId: instruction.instructionId,
    issuedAt: instruction.issuedAt,
    expiresAt: instruction.expiresAt,
    mission: instruction.mission,
    agent: instruction.agent,
    skill: instruction.skill,
    approval: instruction.approval,
    mode: instruction.mode,
  };
}

function stripResultSignature(result: LocalRuntimeResult): UnsignedResult {
  return {
    instructionId: result.instructionId,
    runtimeId: result.runtimeId,
    runtimeVersion: result.runtimeVersion,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    outcome: result.outcome,
    rejectionReason: result.rejectionReason,
    output: result.output,
    ledgerMetadata: result.ledgerMetadata,
  };
}

function signInstruction(instruction: UnsignedInstruction): LocalRuntimeInstruction {
  return {
    ...instruction,
    signature: signPayload(instruction),
  };
}

function signResult(result: UnsignedResult): LocalRuntimeResult {
  return {
    ...result,
    signature: signPayload(result),
  };
}

export function verifyMockLocalRuntimeInstruction(instruction: LocalRuntimeInstruction): boolean {
  return signaturesMatch(signPayload(stripInstructionSignature(instruction)), instruction.signature);
}

export function verifyMockLocalRuntimeResult(result: LocalRuntimeResult): boolean {
  return signaturesMatch(signPayload(stripResultSignature(result)), result.signature);
}

export function buildMockLocalRuntimeInstruction(
  input: BuildMockLocalRuntimeInstructionInput = {},
): LocalRuntimeInstruction {
  const now = input.now ?? new Date();
  const ttlSeconds = input.ttlSeconds ?? 120;
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  const instructionId = input.instructionId ?? `local_echo_${now.getTime()}`;

  return signInstruction({
    instructionId,
    issuedAt,
    expiresAt,
    mission: {
      missionId: "local-runtime-health",
      workspaceId: "local-workspace",
      status: "queued",
      transition: "queued -> running",
    },
    agent: {
      agentId: "local-runtime",
      role: "runtime",
      autonomyLevel: 0,
    },
    skill: {
      skillId: input.skillId ?? RUNTIME_HEALTH_ECHO_SKILL_ID,
      category: "runtime",
      inputPayload: input.inputPayload ?? {},
      outputConstraint: "Echo only. No external calls, writes, sends, spends, or live execution.",
    },
    approval: {
      approvalRecordId: "mock-local-approval",
      approvalConfirmed: false,
      approverEmail: "local@example.invalid",
      scope: "runtime_health_echo",
    },
    mode: input.mode ?? "dry_run",
  });
}

export function runLocalRuntimeInstruction(
  instruction: LocalRuntimeInstruction,
  options: RunLocalRuntimeInstructionOptions = {},
): LocalRuntimeResult {
  const now = options.now ?? new Date();
  const timestamp = now.toISOString();

  function baseResult(): Omit<UnsignedResult, "outcome"> {
    return {
      instructionId: instruction.instructionId,
      runtimeId: LOCAL_RUNTIME_ID,
      runtimeVersion: LOCAL_RUNTIME_VERSION,
      startedAt: timestamp,
      finishedAt: timestamp,
      ledgerMetadata: {
        missionId: instruction.mission.missionId,
        missionStatus: instruction.mission.status,
        missionTransition: instruction.mission.transition,
        approvalConfirmed: instruction.approval.approvalConfirmed,
      },
    };
  }

  function reject(rejectionReason: LocalRuntimeRejectionReason): LocalRuntimeResult {
    return signResult({
      ...baseResult(),
      outcome: "rejected",
      rejectionReason,
    });
  }

  if (!verifyMockLocalRuntimeInstruction(instruction)) {
    return reject("bad_signature");
  }

  if (new Date(instruction.expiresAt) <= now) {
    return reject("expired_instruction");
  }

  if (instruction.mode === "live") {
    return reject("live_mode_not_supported");
  }

  if (instruction.approval.approvalConfirmed) {
    return reject("approval_confirmed_not_supported");
  }

  if (instruction.skill.skillId !== RUNTIME_HEALTH_ECHO_SKILL_ID) {
    return reject("unsupported_skill");
  }

  return signResult({
    ...baseResult(),
    outcome: "completed",
    output: {
      skillId: RUNTIME_HEALTH_ECHO_SKILL_ID,
      echo: instruction.skill.inputPayload,
      mode: "dry_run",
      sideEffects: [],
    },
  });
}
