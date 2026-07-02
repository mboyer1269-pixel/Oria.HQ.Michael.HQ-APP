// src/server/joris/daily-direction-generator.ts
//
// Generates a DailyDirection from real cockpit events using structured JSON
// output from the LLM. Validates the response with Zod and retries once on
// parse failure. Never produces or displays a non-validated object.
//
// Design:
//   - Input: recent EventRecords (ideas, future decision events).
//   - Output: DailyDirectionPayload validated by Zod, or a typed error.
//   - Zero-state: if no events, Joris explains honestly what to do — no fiction.
//   - No persistence: the caller is responsible for writing the event.
//   - No side effects beyond the LLM call.

import "server-only";

import { generateStructuredJson } from "@/server/ai/llm-json-provider";
import {
  dailyDirectionPayloadSchema,
  type DailyDirectionPayload,
  type EventRecord,
} from "@/features/cockpit/events/event-record";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DailyDirectionGeneratorInput = {
  /** Recent idea.captured events to use as context. */
  ideaEvents: EventRecord[];
  /** Today's date in YYYY-MM-DD format. */
  dateIso: string;
  /** Optional: inject fetch for testing without network access. */
  fetchFn?: typeof fetch;
};

export type DailyDirectionGeneratorSuccess = {
  ok: true;
  payload: DailyDirectionPayload;
  /** True when the response was produced on the first try. */
  usedRetry: boolean;
};

export type DailyDirectionGeneratorErrorCode =
  | "llm_unavailable"
  | "llm_invalid_json"
  | "validation_failed_after_retry";

export type DailyDirectionGeneratorFailure = {
  ok: false;
  errorCode: DailyDirectionGeneratorErrorCode;
  reason: string;
};

export type DailyDirectionGeneratorResult =
  | DailyDirectionGeneratorSuccess
  | DailyDirectionGeneratorFailure;

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const JORIS_DAILY_DIRECTION_SYSTEM = `Tu es Joris, l'operating partner de Michael Boyer.
Ta mission ici est unique et précise : générer la direction quotidienne à partir des events réels fournis.

## Règles absolues
1. Ne génère JAMAIS de contenu fictif. Si tu n'as pas de matière réelle, dis-le honnêtement (isZeroState: true).
2. Chaque élément doit citer ses sourceEventIds — les UUIDs exacts des events qui l'ont motivé.
3. Les outcomes sont des RÉSULTATS visés, pas des tâches. Ex : "Proposition envoyée à X" plutôt que "Envoyer une proposition".
4. cashAction = ce qui rapproche d'un vrai dollar aujourd'hui.
5. buildAction = ce qui fait avancer ORIA ou une venture.
6. decisionToMake = une décision concrète à prendre maintenant.
7. thingToCut = une chose à ignorer pour rester focus.
8. Langue : français québécois, direct, sans fioritures.
9. Retourne UNIQUEMENT du JSON valide, sans markdown, sans texte avant ou après.`;

function buildUserPrompt(input: DailyDirectionGeneratorInput): string {
  const hasEvents = input.ideaEvents.length > 0;

  const eventsJson = hasEvents
    ? JSON.stringify(
        input.ideaEvents.map((e) => ({
          id: e.id,
          type: e.type,
          capturedAt: e.payload.capturedAt,
          title: e.payload.title,
          rawText: e.payload.rawText,
        })),
        null,
        2,
      )
    : "[]";

  const zeroStateNote = hasEvents
    ? ""
    : `
ATTENTION: Aucun event disponible. Tu DOIS retourner isZeroState: true et expliquer dans zeroStateMessage comment démarrer (ex: capturer une première idée dans le formulaire). Pour les champs outcomes/cashAction/buildAction/decisionToMake/thingToCut, utilise un texte court et honnête qui guide Michael (ex: "Capture ta première idée pour démarrer"). sourceEventIds doit être [] pour tous ces champs.`;

  return `Date du jour : ${input.dateIso}
${zeroStateNote}
Events disponibles :
${eventsJson}

Génère un objet JSON strict conforme au schéma suivant (sans commentaires, sans markdown) :
{
  "dateIso": "${input.dateIso}",
  "outcomes": [
    { "text": "...", "sourceEventIds": ["<uuid>"] },
    { "text": "...", "sourceEventIds": ["<uuid>"] },
    { "text": "...", "sourceEventIds": ["<uuid>"] }
  ],
  "cashAction": { "text": "...", "sourceEventIds": ["<uuid>"] },
  "buildAction": { "text": "...", "sourceEventIds": ["<uuid>"] },
  "decisionToMake": { "text": "...", "sourceEventIds": ["<uuid>"] },
  "thingToCut": { "text": "...", "sourceEventIds": ["<uuid>"] },
  "generatorEventIds": ${JSON.stringify(input.ideaEvents.map((e) => e.id))},
  "isZeroState": ${hasEvents ? "false" : "true"},
  "zeroStateMessage": ${hasEvents ? "null" : '"Capture ta première idée pour démarrer. Le formulaire est juste en dessous."'},
  "generatedAt": "${new Date().toISOString()}"
}`;
}

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

function validatePayload(
  raw: unknown,
): { ok: true; payload: DailyDirectionPayload } | { ok: false; reason: string } {
  const result = dailyDirectionPayloadSchema.safeParse(raw);
  if (result.success) return { ok: true, payload: result.data };
  const issues = result.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  return { ok: false, reason: `Zod validation failed: ${issues}` };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateDailyDirection(
  input: DailyDirectionGeneratorInput,
): Promise<DailyDirectionGeneratorResult> {
  const systemPrompt = JORIS_DAILY_DIRECTION_SYSTEM;
  const userPrompt = buildUserPrompt(input);
  const fetchFns = input.fetchFn
    ? { openrouter: input.fetchFn, anthropic: input.fetchFn, openai: input.fetchFn }
    : undefined;

  // Attempt 1
  const attempt1 = await generateStructuredJson({
    providerPreference: "free-first",
    systemPrompt,
    userPrompt,
    maxTokens: 1800,
    temperature: 0.1,
    timeoutMs: 30_000,
    fetchFns,
  });

  if (!attempt1.ok) {
    return {
      ok: false,
      errorCode: "llm_unavailable",
      reason: attempt1.fallbackReason,
    };
  }

  const validation1 = validatePayload(attempt1.json);
  if (validation1.ok) {
    return { ok: true, payload: validation1.payload, usedRetry: false };
  }

  // Attempt 2 — retry with explicit failure hint
  const retryUserPrompt = `${userPrompt}

Note: Tentative précédente invalide. Erreurs : ${validation1.reason}
Assure-toi que outcomes contient EXACTEMENT 3 éléments et que tous les champs requis sont présents.`;

  const attempt2 = await generateStructuredJson({
    providerPreference: "free-first",
    systemPrompt,
    userPrompt: retryUserPrompt,
    maxTokens: 1800,
    temperature: 0.0,
    timeoutMs: 30_000,
    fetchFns,
  });

  if (!attempt2.ok) {
    return {
      ok: false,
      errorCode: "llm_unavailable",
      reason: `Retry failed: ${attempt2.fallbackReason}`,
    };
  }

  const validation2 = validatePayload(attempt2.json);
  if (validation2.ok) {
    return { ok: true, payload: validation2.payload, usedRetry: true };
  }

  return {
    ok: false,
    errorCode: "validation_failed_after_retry",
    reason: `After retry: ${validation2.reason}`,
  };
}
