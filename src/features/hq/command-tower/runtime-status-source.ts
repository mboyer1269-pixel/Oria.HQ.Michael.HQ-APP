// src/features/hq/command-tower/runtime-status-source.ts
//
// Bridges the Local Runtime Probe v1 (src/server/agents/runtimes/
// local-runtime-probe.ts) to the Command Tower runtime board. Two parts:
//   - mapProbeSnapshotToBoard: PURE mapping, exported for tests.
//   - loadRuntimeStatusBoard: server-side I/O with a short TTL cache and a
//     fail-closed contract — any error returns null, the model then renders
//     the static "probe unavailable" fallback. Nothing here throws to the UI.
//
// Detection is not permission: this source only feeds the STATUS card. The
// dispatch corridors never read it.

import {
  probeLocalRuntimes,
  resolveProbeExecutionEnvironment,
  type LocalRuntimeProbeSnapshot,
  type ProbedRuntimeEntry,
} from "@/server/agents/runtimes/local-runtime-probe";
import type { RuntimeBoardEntry, RuntimeBoardInput } from "./command-tower-model";

const RUNTIME_LABELS: Record<ProbedRuntimeEntry["id"], string> = {
  claude_code_cli: "Claude Code CLI",
  codex_cli: "Codex CLI",
  gemini_cli: "Gemini CLI",
};

/** Zapier MCP is a tool corridor, not a model runtime — never probed in v1. */
const ZAPIER_BOARD_ENTRY: RuntimeBoardEntry = {
  id: "zapier_mcp",
  label: "Zapier MCP",
  status: "future_tool_corridor",
  evidence: "Not probed — tool corridor, no live call in v1 (Runtime Gate analysis)",
  note: "Corridor d'outils futur — dry-run d'abord, jamais le cerveau.",
};

/** Pure mapping from a probe snapshot to the four-entry runtime board. */
export function mapProbeSnapshotToBoard(
  snapshot: LocalRuntimeProbeSnapshot,
): RuntimeBoardInput {
  const probed: RuntimeBoardEntry[] = snapshot.entries.map((entry) => ({
    id: entry.id,
    label: RUNTIME_LABELS[entry.id],
    status: entry.status,
    evidence: entry.evidence.join(" · "),
    note: entry.reason,
    probe: { probedAtIso: entry.probedAtIso, version: entry.version },
  }));
  return {
    entries: [...probed, ZAPIER_BOARD_ENTRY],
    probedAtIso: snapshot.probedAtIso,
  };
}

// Short TTL cache: /hq is force-dynamic and the probe spawns local commands;
// re-probing on every render would tax page loads without adding truth. The
// probedAtIso on screen always tells the CEO how fresh the evidence is.
const PROBE_CACHE_TTL_MS = 30_000;
let cachedBoard: { at: number; value: RuntimeBoardInput } | null = null;

/**
 * Loads the probe-backed runtime board. Fail-closed: any error (including a
 * probe module failure) yields null so the tower renders its honest fallback.
 */
export async function loadRuntimeStatusBoard(): Promise<RuntimeBoardInput | null> {
  // Cloud hosts and unflagged production builds bail out BEFORE any spawn —
  // a personal probe belongs on Michael's machine and nowhere else.
  if (!resolveProbeExecutionEnvironment(process.env).allowed) {
    return null;
  }
  const now = Date.now();
  if (cachedBoard && now - cachedBoard.at < PROBE_CACHE_TTL_MS) {
    return cachedBoard.value;
  }
  try {
    const snapshot = await probeLocalRuntimes();
    const board = mapProbeSnapshotToBoard(snapshot);
    cachedBoard = { at: now, value: board };
    return board;
  } catch {
    return null;
  }
}
