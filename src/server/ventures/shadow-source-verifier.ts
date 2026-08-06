// src/server/ventures/shadow-source-verifier.ts
//
// V7 — external source verification for shadow proposals.
//
// WHY THIS EXISTS: on the first real run, two of three cited URLs did not
// exist. One pointed at the CNIL — the French regulator — as the source for a
// Quebec statute. Every evidence gate passed anyway, because the gates check
// that a URL is well-formed, http(s), and distinct from the others. They never
// checked that it resolves.
//
// The prompt already tells the model a fabricated url is worse than an admitted
// gap. It fabricated regardless. An instruction is not a guardrail.
//
// WHAT IT DOES: demotes a source to `{ kind: "none" }` when the URL is PROVEN
// dead. The dimension keeps its value and rationale — the reasoning may still
// be sound — but it loses the evidence it claimed, so the gates then judge it
// as unsourced, which is what it is.
//
// WHAT IT REFUSES TO DO: punish a URL it could not check. A 404 or 410 is
// proof of absence. A timeout, a DNS failure, a 403 from a bot filter, or a
// 5xx are all failures of the CHECK, not of the source — treating them as
// fabrication would demote real evidence whenever the network hiccups, and the
// cost of that is silently discarding good work.

import "server-only";

export const SOURCE_CHECK_TIMEOUT_MS = 8_000;

/** Status codes that prove a page is not there. Everything else is inconclusive. */
const PROVEN_ABSENT = new Set([404, 410]);

export type SourceVerdict = "reachable" | "absent" | "unverified";

export type SourceCheck = {
  url: string;
  verdict: SourceVerdict;
  status?: number;
  reason?: string;
};

export type SourceVerifierDeps = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Checks one URL.
 *
 * Tries HEAD first — cheaper, and enough to prove absence. Falls back to GET
 * when HEAD is refused, because a number of servers reject it outright and a
 * 405 says nothing about whether the page exists.
 */
export async function checkSourceUrl(
  url: string,
  deps: SourceVerifierDeps = {},
): Promise<SourceCheck> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? SOURCE_CHECK_TIMEOUT_MS;

  const attempt = async (method: "HEAD" | "GET"): Promise<SourceCheck> => {
    const response = await fetchImpl(url, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (PROVEN_ABSENT.has(response.status)) {
      return { url, verdict: "absent", status: response.status };
    }
    if (response.ok) {
      return { url, verdict: "reachable", status: response.status };
    }
    return {
      url,
      verdict: "unverified",
      status: response.status,
      reason: `inconclusive status ${response.status}`,
    };
  };

  try {
    const head = await attempt("HEAD");
    // 405/501 mean the method is refused, not that the page is missing.
    if (head.verdict === "unverified" && (head.status === 405 || head.status === 501)) {
      return await attempt("GET");
    }
    return head;
  } catch (error) {
    return {
      url,
      verdict: "unverified",
      reason: error instanceof Error ? error.message.slice(0, 120) : "check failed",
    };
  }
}

export type EvidenceLikeSource =
  | { kind: "none" }
  | { kind: "internal"; ref: string }
  | { kind: "external"; url: string };

export type EvidenceLike = {
  dimension: string;
  value: number;
  rationale: string;
  source: EvidenceLikeSource;
};

export type VerificationReport = {
  checked: number;
  reachable: number;
  /** Proven dead, so demoted to unsourced. */
  demoted: { dimension: string; url: string; status?: number }[];
  /** Could not be checked; left in place rather than punished. */
  unverified: { dimension: string; url: string; reason?: string }[];
};

export type VerifiedEvidence<T extends EvidenceLike> = {
  evidence: T[];
  report: VerificationReport;
};

/**
 * Verifies every external source in an evidence set.
 *
 * Distinct URLs are checked once even when several dimensions cite the same
 * page, and all checks run in parallel: a serial pass over eleven dimensions
 * would add seconds to every proposal for no extra information.
 */
export async function verifyEvidenceSources<T extends EvidenceLike>(
  evidence: readonly T[],
  deps: SourceVerifierDeps = {},
): Promise<VerifiedEvidence<T>> {
  const urls = new Set<string>();
  for (const item of evidence) {
    if (item.source.kind === "external") urls.add(item.source.url);
  }

  const checks = new Map<string, SourceCheck>();
  const results = await Promise.all(
    [...urls].map((url) =>
      checkSourceUrl(url, deps).catch(
        (): SourceCheck => ({ url, verdict: "unverified", reason: "check threw" }),
      ),
    ),
  );
  for (const check of results) checks.set(check.url, check);

  const report: VerificationReport = {
    checked: urls.size,
    reachable: 0,
    demoted: [],
    unverified: [],
  };

  const verified = evidence.map((item) => {
    if (item.source.kind !== "external") return item;
    const check = checks.get(item.source.url);
    if (!check) return item;

    if (check.verdict === "reachable") {
      report.reachable += 1;
      return item;
    }

    if (check.verdict === "absent") {
      report.demoted.push({
        dimension: item.dimension,
        url: item.source.url,
        ...(check.status !== undefined ? { status: check.status } : {}),
      });
      // The value and rationale survive: the reasoning may hold even when the
      // citation does not. Only the claim of evidence is withdrawn.
      return { ...item, source: { kind: "none" } as EvidenceLikeSource };
    }

    report.unverified.push({
      dimension: item.dimension,
      url: item.source.url,
      ...(check.reason ? { reason: check.reason } : {}),
    });
    return item;
  });

  return { evidence: verified as T[], report };
}
