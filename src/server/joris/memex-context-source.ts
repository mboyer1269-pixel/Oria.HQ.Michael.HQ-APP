// src/server/joris/memex-context-source.ts
//
// Optional Memex read-only enrichment for Joris — AFTER handshake gate.
// Design: docs/MEMEX_READONLY_CONTEXT_SOURCE_V1.md
//
// Memex unavailable / timeout / bad output → existing context unchanged.
// Memex does not replace Memory Vault; it may ADD advisory, provenance-cited
// context when the handshake and evidence pack both succeed.

import { logger } from "@/lib/logger";
import {
  buildMemexContextInjection,
  callMemexReadTool,
  defaultMemexBridgePolicy,
  resolveMemexExecutionEnvironment,
  runMemexHandshake,
  workspaceIdToMemexNamespace,
  MEMEX_CORE_ROOT_ENV_VAR,
  type MemexMcpTransport,
} from "@/server/mcp/memex-readonly-client";
import type { MemoryEvidencePack } from "@/server/agents/evidence/memory-evidence-pack";

export type MemexContextEnrichmentTrace = {
  status: "skipped" | "unavailable" | "handshake_failed" | "fallback" | "enriched";
  reason: string;
  handshakeOk?: boolean;
  evidencePackValid?: boolean;
};

export type MemexContextEnrichmentResult = {
  /** Final context for Joris — unchanged on any failure path. */
  memoryContext: string | null;
  evidencePack: MemoryEvidencePack | null;
  trace: MemexContextEnrichmentTrace;
};

export type EnrichJorisMemoryContextInput = {
  existingContext: string | null;
  taskIntent: string;
  workspaceId: string;
  /** Injectable transport for tests; null uses env-gated stdio factory. */
  transport?: MemexMcpTransport | null;
  env?: Readonly<Record<string, string | undefined>>;
  nowIso?: string;
  createTransport?: (memexCoreRoot: string) => Promise<MemexMcpTransport>;
};

const defaultCreateTransport = async (memexCoreRoot: string): Promise<MemexMcpTransport> => {
  const { createStdioMemexTransport } = await import("@/server/mcp/memex-stdio-transport");
  return createStdioMemexTransport({ memexCoreRoot });
};

/**
 * Attempts Memex read-only enrichment. Never throws toward Joris.
 * Handshake MUST pass before any tool call or injection.
 */
export async function enrichJorisMemoryContextWithMemex(
  input: EnrichJorisMemoryContextInput,
): Promise<MemexContextEnrichmentResult> {
  const env = input.env ?? process.env;
  const existing = input.existingContext ?? "";
  const baseResult = (trace: MemexContextEnrichmentTrace): MemexContextEnrichmentResult => ({
    memoryContext: input.existingContext,
    evidencePack: null,
    trace,
  });

  const environment = resolveMemexExecutionEnvironment(env);
  if (!environment.spawnAllowed && !input.transport) {
    return baseResult({ status: "unavailable", reason: environment.reason });
  }

  let transport = input.transport ?? null;
  let ownsTransport = false;
  if (!transport) {
    const root = env[MEMEX_CORE_ROOT_ENV_VAR]?.trim();
    if (!root) {
      return baseResult({ status: "unavailable", reason: `${MEMEX_CORE_ROOT_ENV_VAR} unset` });
    }
    try {
      const factory = input.createTransport ?? defaultCreateTransport;
      transport = await factory(root);
      ownsTransport = true;
    } catch (error) {
      return baseResult({
        status: "fallback",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const namespace = workspaceIdToMemexNamespace(input.workspaceId);
  const policy = defaultMemexBridgePolicy(namespace);
  const nowIso = input.nowIso ?? new Date().toISOString();

  try {
    const handshake = await runMemexHandshake(transport, policy);
    if (!handshake.ok) {
      logger.info("joris.memex.handshake.failed", { reason: handshake.reason, namespace });
      return baseResult({
        status: "handshake_failed",
        reason: handshake.reason,
        handshakeOk: false,
      });
    }

    const call = await callMemexReadTool(
      transport,
      "agentmemory_librarian_brief",
      {
        namespace: policy.namespace,
        task: input.taskIntent.slice(0, 500),
        tokenBudget: policy.maxContextChars,
      },
      policy,
    );
    if (!call.ok) {
      logger.info("joris.memex.read.failed", { reason: call.reason, namespace });
      return baseResult({ status: "fallback", reason: call.reason, handshakeOk: true });
    }

    const injection = buildMemexContextInjection(
      existing,
      call.text,
      policy,
      nowIso,
      call.redactionsApplied,
    );
    if (!injection) {
      return baseResult({
        status: "fallback",
        reason: "empty or invalid Memex selection — evidence pack not produced",
        handshakeOk: true,
        evidencePackValid: false,
      });
    }

    logger.info("joris.memex.enriched", {
      namespace,
      injectedItems: injection.selection.injectable.length,
      charCount: injection.selection.charCount,
    });

    return {
      memoryContext: injection.context || input.existingContext,
      evidencePack: injection.evidencePack,
      trace: {
        status: "enriched",
        reason: "Memex librarian brief injected with Memory Evidence Pack",
        handshakeOk: true,
        evidencePackValid: true,
      },
    };
  } catch (error) {
    return baseResult({
      status: "fallback",
      reason: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (ownsTransport && transport) {
      try {
        await transport.close();
      } catch {
        // Transport cleanup failure must not crash Joris.
      }
    }
  }
}
