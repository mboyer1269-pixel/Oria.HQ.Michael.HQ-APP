/**
 * Double lock for risky actions (spend money / send something outside).
 *
 * Concept (not code) from FounderOS lib/gates.ts (MIT, © FounderOS contributors): an operator kill-switch that is
 * OFF by default, plus an explicit `confirm: true` in the request body, so a stray POST never acts. Rewritten for
 * Oria; no FounderOS code is copied.
 *
 *   ORIA_RISKY_ACTIONS_ENABLED=1   instance-level switch; anything else (unset, "", "true", "0") = OFF → 403.
 *   body.confirm === true          strict boolean (not "true", not 1) → else 409.
 *
 * Order matters: the switch is checked first, so with the switch off the answer is always 403 and reveals nothing
 * about the body. This gate is ADDITIVE: it never replaces the owner/workspace session check
 * (requireWorkspaceApiSession / requireOwnerApiSession), approval tokens, or ledger writes of a route.
 */
import { NextResponse } from "next/server";

export type RiskyActionKind = "spend" | "send";
export type RiskyGateRefusal = { status: 403 | 409; code: "risky_actions_disabled" | "confirm_required"; error: string; kind: RiskyActionKind };

export function riskyActionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ORIA_RISKY_ACTIONS_ENABLED?.trim() === "1";
}
/** True only for an explicit boolean `confirm: true`. */
export function isConfirmed(body: unknown): boolean {
  return !!body && typeof body === "object" && !Array.isArray(body) && (body as { confirm?: unknown }).confirm === true;
}
/** Null = proceed. */
export function riskyActionDecision(kind: RiskyActionKind, body: unknown, env: NodeJS.ProcessEnv = process.env): RiskyGateRefusal | null {
  if (!riskyActionsEnabled(env)) {
    return { status: 403, code: "risky_actions_disabled", kind, error: "Les actions à risque (dépense/envoi) sont désactivées sur cette instance (ORIA_RISKY_ACTIONS_ENABLED=1 pour les autoriser)." };
  }
  if (!isConfirmed(body)) {
    return { status: 409, code: "confirm_required", kind, error: "Cette action dépense de l'argent ou envoie quelque chose. Renvoie la requête avec \"confirm\": true." };
  }
  return null;
}
/** riskyActionDecision as a ready JSON response ({ error, code } like other Oria routes), or null to proceed. */
export function riskyActionGate(kind: RiskyActionKind, body: unknown, env: NodeJS.ProcessEnv = process.env): NextResponse | null {
  const r = riskyActionDecision(kind, body, env);
  return r ? NextResponse.json(r, { status: r.status }) : null;
}
