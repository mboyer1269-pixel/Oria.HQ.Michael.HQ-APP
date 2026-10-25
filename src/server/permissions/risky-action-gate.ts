/**
 * Double lock for risky actions (spend money / send something outside).
 *
 * Concept (not code) from FounderOS lib/gates.ts (MIT, © FounderOS contributors): an operator kill-switch that is
 * OFF by default, plus an explicit `confirm: true` in the request body, so a stray POST never acts. Rewritten for
 * Oria; no FounderOS code is copied.
 *
 *   ORIA_RISKY_ACTIONS_ENABLED=1   instance-level switch; anything else (unset, "", "true", "0") = OFF → 403.
 *                                  Surrounding whitespace is tolerated on purpose (" 1 ", "1\n" from .env files = ON);
 *                                  the value inside must be exactly "1" (420-1).
 *   body.confirm === true          strict boolean (not "true", not 1) → else 409.
 *
 * Order matters: the switch is checked first, so with the switch off the answer is always 403 and reveals nothing
 * about the body.
 *
 * CALLERS MUST CHECK THE SESSION FIRST (420-2): run requireWorkspaceApiSession / requireOwnerApiSession (and any
 * role / subscription-owner check) BEFORE calling this gate. Otherwise an anonymous caller could tell 403 from 409
 * and learn whether the switch is on. This gate is ADDITIVE: it never replaces the owner/workspace session check
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
/** Null = proceed. Call only AFTER the session/owner check (420-2). */
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
