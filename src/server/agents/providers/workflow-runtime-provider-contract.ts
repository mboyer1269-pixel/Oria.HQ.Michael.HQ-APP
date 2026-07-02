// src/server/agents/providers/workflow-runtime-provider-contract.ts
//
// Tool Universe Corridor — workflow runtimes (n8n-class). The live n8n rail
// (src/server/agents/tools/n8n-webhook-trigger.ts + webhook-registry) is the
// living reference for this shape: single signed chokepoint, host allowlist,
// idempotency by actionRef, ledger before/after.
//
// This contract is SHAPE ONLY. It does not modify any existing workflow and
// introduces no runtime behavior. Resilience upgrades (retries with backoff
// and jitter, dead-letter queue, circuit breaker, replay-safe observability,
// bounded failed→pending retry) are declared here as FUTURE_PR literals so
// the gap is visible in the type system instead of forgotten in a doc.

import type {
  AdapterProviderDescriptor,
  AdapterSecretRef,
} from "./adapter-provider-contract.ts";

export type WorkflowRuntimeProviderContract = {
  descriptor: AdapterProviderDescriptor & { adapterKind: "workflow_runtime" };
  endpoint: {
    /**
     * Reference to the host allowlist that authorizes outbound bindings
     * (the webhook-registry pattern). Hosts not on the referenced list do
     * not exist for this runtime.
     */
    allowlistedHostsRef: string;
  };
  signing: {
    /** Literal: every call is HMAC-signed. Unsigned calls are not calls. */
    hmac: true;
    signingSecretRef: AdapterSecretRef;
    staticSecretRef: AdapterSecretRef;
  };
  idempotency: {
    /** Payload field carrying the idempotency key (the rail uses actionRef). */
    keyField: string;
  };
  resilience: {
    retriesWithBackoff: "future_pr";
    deadLetterQueue: "future_pr";
    circuitBreaker: "future_pr";
    observability: "future_pr";
    boundedFailedToPendingRetry: "future_pr";
  };
};

export type WorkflowContractCheck =
  | { ok: true }
  | { ok: false; violations: readonly string[] };

/** Pure shape check for runtime-specific rules beyond the base descriptor. */
export function validateWorkflowRuntimeContract(
  contract: WorkflowRuntimeProviderContract,
): WorkflowContractCheck {
  const violations: string[] = [];
  if (contract.endpoint.allowlistedHostsRef.trim().length === 0) {
    violations.push("allowlistedHostsRef must reference a host allowlist — no allowlist, no runtime.");
  }
  if (contract.idempotency.keyField.trim().length === 0) {
    violations.push("idempotency.keyField is required — replays must be detectable.");
  }
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
