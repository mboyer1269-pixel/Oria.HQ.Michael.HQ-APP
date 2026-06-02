// src/features/ventures/llm-cash-action-packet-generator.ts
//
// LLM-backed cash action packet generator.
//
// Calls Anthropic server-side with a strict JSON prompt, coerces each raw
// object into a validated CashActionPacket, and falls back to the existing
// deterministic seed path if the LLM is unavailable or returns invalid data.
//
// Invariants — held regardless of what the LLM returns:
//   - requiresCeoApproval: true   (applied by buildCashActionPacket)
//   - noExecutionAuthorized: true (applied by buildCashActionPacket)
//   - Every returned packet passes validateCashActionPacket
//   - No network call if ANTHROPIC_API_KEY is absent (fallback immediately)
//   - Never throws toward the page — all errors surface in fallbackReason
//
// Dependency direction:
//   page → this module → anthropic-json-client (server)
//                      → buildCashActionPacket / validateCashActionPacket (pure)
//                      → fallbackItems (seed, pure)

import "server-only";

import {
  ANTHROPIC_JSON_DEFAULT_MODEL,
  type AnthropicJsonResult,
  generateJsonWithAnthropic,
} from "@/server/ai/anthropic-json-client";
import {
  CASH_ACTION_BUYER_TYPES,
  CASH_ACTION_MIN_TEXT_LENGTH,
  CASH_SIGNAL_TYPES,
  type CashActionPacket,
  buildCashActionPacket,
  validateCashActionPacket,
} from "./cash-action-packet";
import { EVIDENCE_KINDS } from "./evidence-ref";
import type { AgentVentureWorkbenchItem } from "./agent-venture-workbench-data";
import { buildCashActionPacketsFromItems } from "./cash-action-packet-generator";

// ---------------------------------------------------------------------------
// Venture context — non-sensitive, server-side only
// ---------------------------------------------------------------------------

export type VentureContext = {
  ventureId: string;
  name: string;
  description: string;
  targetMarket: string;
  currentStage: string;
};

// The Orya ventures that the agent reasons about. MCL Constructions is omitted
// here — it's historical context only, included on explicit CEO request.
export const ORYA_VENTURES: readonly VentureContext[] = [
  {
    ventureId: "suivia",
    name: "Suivia",
    description:
      "Signal-to-Client agency delivering AI-powered weekly briefings for aesthetic clinics in Québec and Ontario. Clinics get structured patient insights and actionable follow-up scripts every Monday morning.",
    targetMarket:
      "Aesthetic clinic owners and practice managers in QC/ON, 1–20 employees, $200K–$2M annual revenue",
    currentStage: "early validation — no paying clients yet, seeking first 3 pilot contracts",
  },
  {
    ventureId: "orya-hq",
    name: "Orya HQ",
    description:
      "Agentic holding OS — a fleet of AI agents that operate, automate, and make decisions across ventures. Offers design-partner access to founders running multiple product lines who need agent-assisted management.",
    targetMarket:
      "Bootstrapped SaaS founders and multi-venture operators in Québec and online communities, seeking AI leverage without engineering overhead",
    currentStage: "MVP in production — seeking first design partner revenue at $500–$2,000/month",
  },
];

// ---------------------------------------------------------------------------
// Generator result
// ---------------------------------------------------------------------------

export type LlmCashActionPacketGeneratorResult = {
  packets: CashActionPacket[];
  source: "anthropic" | "fallback_seed";
  fallbackReason?: string;
  modelId?: string;
  invalidPacketCount?: number;
};

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

const CASH_SIGNAL_TYPES_STR = CASH_SIGNAL_TYPES.join(" | ");
const EVIDENCE_KINDS_STR = EVIDENCE_KINDS.join(" | ");
const BUYER_TYPES_STR = CASH_ACTION_BUYER_TYPES.join(" | ");

function buildSystemPrompt(): string {
  return `You are a cash-action agent inside Orya HQ, an agentic holding OS.

Your only job is to produce a JSON array of CashActionPackets — concrete, CEO-executable revenue proposals.

## Hard constraints (never violate)
- Output MUST be a JSON array. No markdown. No explanation. No commentary.
- Each packet is a PROPOSAL ONLY. Never claim cash is already collected.
- Never suggest automatic sending, auto-deploy, or runtime execution.
- requiresCeoApproval is always true — do not include it in output (it is applied by the system).
- noExecutionAuthorized is always true — do not include it in output (it is applied by the system).
- Max 5 packets total across all ventures.
- Outreach drafts are proposal text only — the CEO adapts and sends them manually.

## Field constraints
- targetBuyer: specific company type or persona name, not a generic category
- buyerType: one of ${BUYER_TYPES_STR}
- painHypothesis: min 15 characters, concrete business pain
- offer: min 15 characters, specific deliverable with package label
- pricePointCents: integer >= 0 (e.g. 150000 for $1,500)
- callToAction: the single next manual step the CEO performs
- outreachDraft: a short cold message draft (min 30 characters), proposal only
- expectedCashSignal: one of ${CASH_SIGNAL_TYPES_STR}
- requiredEvidence: array, each item one of ${EVIDENCE_KINDS_STR}
- expectedCashImpactCents: integer >= 0, honest single-pilot estimate, not annualized
- expectedCostCents: integer >= 0, direct validation cost only

## Output format
[
  {
    "ventureId": "...",
    "targetBuyer": "...",
    "buyerType": "...",
    "painHypothesis": "...",
    "offer": "...",
    "pricePointCents": 0,
    "callToAction": "...",
    "outreachDraft": "...",
    "expectedCashSignal": "...",
    "requiredEvidence": ["..."],
    "expectedCashImpactCents": 0,
    "expectedCostCents": 0
  }
]`;
}

function buildUserPrompt(ventures: readonly VentureContext[]): string {
  const ventureBlock = ventures
    .map(
      (v) =>
        `Venture ID: ${v.ventureId}\nName: ${v.name}\nDescription: ${v.description}\nTarget market: ${v.targetMarket}\nStage: ${v.currentStage}`,
    )
    .join("\n\n");

  return `Here are the active ventures. Produce up to 5 CashActionPackets (prioritize the highest-cash-probability moves first). Output JSON array only.\n\n${ventureBlock}`;
}

// ---------------------------------------------------------------------------
// Raw packet coercion + validation
// ---------------------------------------------------------------------------

type RawLlmPacket = Record<string, unknown>;

function isNonEmptyString(v: unknown, minLen = 1): v is string {
  return typeof v === "string" && v.trim().length >= minLen;
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function coerceLlmPacket(
  raw: RawLlmPacket,
  index: number,
  createdAt: string,
  modelId: string,
): CashActionPacket | null {
  if (
    !isNonEmptyString(raw.ventureId) ||
    !isNonEmptyString(raw.targetBuyer) ||
    !isNonEmptyString(raw.buyerType) ||
    !CASH_ACTION_BUYER_TYPES.includes(raw.buyerType as never) ||
    !isNonEmptyString(raw.painHypothesis, CASH_ACTION_MIN_TEXT_LENGTH) ||
    !isNonEmptyString(raw.offer, CASH_ACTION_MIN_TEXT_LENGTH) ||
    !isNonNegativeInt(raw.pricePointCents) ||
    !isNonEmptyString(raw.callToAction) ||
    !isNonEmptyString(raw.outreachDraft, CASH_ACTION_MIN_TEXT_LENGTH) ||
    !isNonEmptyString(raw.expectedCashSignal) ||
    !CASH_SIGNAL_TYPES.includes(raw.expectedCashSignal as never) ||
    !Array.isArray(raw.requiredEvidence) ||
    !isNonNegativeInt(raw.expectedCashImpactCents) ||
    !isNonNegativeInt(raw.expectedCostCents)
  ) {
    return null;
  }

  // Filter evidence to known kinds only
  const requiredEvidence = (raw.requiredEvidence as unknown[]).filter(
    (k): k is (typeof EVIDENCE_KINDS)[number] =>
      typeof k === "string" && EVIDENCE_KINDS.includes(k as never),
  );

  const packet = buildCashActionPacket({
    packetId: `llm:${raw.ventureId}:${index + 1}`,
    ventureId: raw.ventureId as string,
    agentId: `anthropic:${modelId}`,
    targetBuyer: (raw.targetBuyer as string).trim(),
    buyerType: raw.buyerType as CashActionPacket["buyerType"],
    painHypothesis: (raw.painHypothesis as string).trim(),
    offer: (raw.offer as string).trim(),
    pricePointCents: Math.round(raw.pricePointCents as number),
    callToAction: (raw.callToAction as string).trim(),
    outreachDraft: (raw.outreachDraft as string).trim(),
    expectedCashSignal: raw.expectedCashSignal as CashActionPacket["expectedCashSignal"],
    requiredEvidence,
    expectedCashImpactCents: Math.round(raw.expectedCashImpactCents as number),
    expectedCostCents: Math.round(raw.expectedCostCents as number),
    createdAt,
  });

  const validation = validateCashActionPacket(packet);
  if (!validation.valid) return null;

  return packet;
}

function parseLlmPackets(
  json: unknown,
  createdAt: string,
  modelId: string,
): { packets: CashActionPacket[]; invalidCount: number } {
  if (!Array.isArray(json)) {
    return { packets: [], invalidCount: 0 };
  }

  const packets: CashActionPacket[] = [];
  let invalidCount = 0;

  for (let i = 0; i < Math.min(json.length, 5); i++) {
    const raw = json[i];
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      invalidCount++;
      continue;
    }
    const packet = coerceLlmPacket(raw as RawLlmPacket, i, createdAt, modelId);
    if (packet) {
      packets.push(packet);
    } else {
      invalidCount++;
    }
  }

  return { packets, invalidCount };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateLlmCashActionPacketsFromVentures(input: {
  ventures: readonly VentureContext[];
  fallbackItems: AgentVentureWorkbenchItem[];
  createdAt: string;
  fetchFn?: typeof fetch;
}): Promise<LlmCashActionPacketGeneratorResult> {
  const { ventures, fallbackItems, createdAt } = input;

  // Build prompts
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(ventures);

  // Call Anthropic (fetchFn is optional override for tests)
  let llmResult: AnthropicJsonResult;
  try {
    llmResult = await generateJsonWithAnthropic(
      { systemPrompt, userPrompt },
      input.fetchFn,
    );
  } catch {
    return {
      packets: buildCashActionPacketsFromItems(fallbackItems, { createdAt }),
      source: "fallback_seed",
      fallbackReason: "Unexpected error from Anthropic client",
    };
  }

  if (!llmResult.ok) {
    return {
      packets: buildCashActionPacketsFromItems(fallbackItems, { createdAt }),
      source: "fallback_seed",
      fallbackReason: llmResult.fallbackReason,
      modelId: llmResult.modelId,
    };
  }

  const { packets, invalidCount } = parseLlmPackets(
    llmResult.json,
    createdAt,
    llmResult.modelId,
  );

  if (packets.length === 0) {
    return {
      packets: buildCashActionPacketsFromItems(fallbackItems, { createdAt }),
      source: "fallback_seed",
      fallbackReason:
        invalidCount > 0
          ? `All ${invalidCount} LLM packet(s) failed validation`
          : "LLM returned an empty or non-array result",
      modelId: llmResult.modelId,
      invalidPacketCount: invalidCount,
    };
  }

  return {
    packets,
    source: "anthropic",
    modelId: llmResult.modelId,
    invalidPacketCount: invalidCount > 0 ? invalidCount : undefined,
  };
}

// Convenience: build the Anthropic client model ID for display
export const LLM_PACKET_GENERATOR_MODEL = ANTHROPIC_JSON_DEFAULT_MODEL;
