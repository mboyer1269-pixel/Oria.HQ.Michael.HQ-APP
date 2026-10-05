# Runner probe operator configuration

The real launch gate reads `ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE`, an absolute
path to a non-secret JSON file owned and writable only by the authorized operator
(or protected by an equivalent OS ACL). Never point this at a credential file.
The application does not create this configuration or approve it automatically.

Required strict shape (illustrative values only; replace with qualified references):

```json
{
  "version": 1,
  "workspaceId": "qualified-workspace",
  "provider": "claude-code-cli",
  "approval": {
    "status": "approved",
    "approvalReference": "actual written operator approval reference"
  },
  "sshHost": "runner@example.invalid",
  "sshIdentityFile": "/absolute/path/to/existing/ssh-identity",
  "container": "qualified-claude-login"
}
```

Record the real approval only after qualifying the host and container. The named
container must expose the same account/auth context as the approved mission
executor. Configuration itself is not evidence of account identity, model access,
quota or execution authorization. Identity is resolved only from the actual CLI
status response through the existing workspace-scoped server identity repository.

The key path refers to an existing identity; its contents are never read by this
module. SSH uses `BatchMode=yes`, `IdentitiesOnly=yes` and
`StrictHostKeyChecking=yes`; provision and verify known_hosts separately. Only
`docker exec <validated-container> /usr/local/bin/claude-agent-acp --cli --version` and
`docker exec <validated-container> /usr/local/bin/claude-agent-acp --cli auth status --json` can run. No shell
fragment, login or prompt can be supplied. Container names/IDs are restricted to
ASCII letters, digits, underscores, dots and hyphens, starting with a letter or
digit. SSH accepts a DNS/IPv4 host or alias, optionally prefixed with a user.

The existing environment policy is unchanged: cloud markers reject execution;
production requires `ORIA_ENABLE_OPENHANDS_RUNNER_PROBE=1` as well as the binding.
Absent, malformed, oversized, unapproved or workspace-mismatched configuration
fails closed without spawning. The file is read again on each probe, including
the gate's final recheck. Remove the file or change approval status to
`not_approved` to revoke. This does not provide an atomic transaction between
operator configuration changes and the final mission CAS.

## Persisted-evidence transport (for a host that can never run this probe)

The SSH binding above is unusable from HQ's own public server process by
design — a cloud marker always refuses it, unconditionally. For a deployment
where `confirm_launch` runs on such a host (e.g. Vercel), a second, explicitly
selected transport reads an attestation an operator-adjacent host already
recorded, instead of attempting SSH inline. See
`src/server/agents/models/runner-connection-evidence.ts` for the full doctrine.

1. On the operator-adjacent host that already holds the SSH binding above (the
   runner host itself, or any machine with the same SSH identity and Supabase
   admin environment), the SAME `ORIA_OPENHANDS_LAUNCH_CONFIG` HQ's server
   reads must also be resolvable — the write never takes a runner id as a
   free argument; it reads `runnerId` and `providerProfile.policySha256` from
   this one canonical source:

   ```sh
   ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE=/absolute/path/to/ssh-binding.json \
   ORIA_OPENHANDS_LAUNCH_CONFIG='{"imageDigest":"sha256:...","executorVersion":"1.50.0","runnerId":"runner-1","permissionPolicy":"deny","maxCostCents":500,"maxTokens":50000,"maxIterations":10,"timeoutSeconds":600,"hardTokenLimitEnforced":false,"providerProfile":{"id":"claude-default","policySha256":"<64-hex>","provider":"claude","authentication":"subscription","network":"restricted-proxy","accountConnectors":"disabled"}}' \
   node src/scripts/runner-connection-evidence-record.mjs <workspaceId> <recordedBy>
   ```

   This reads the SSH binding exactly once, runs the real, unmodified SSH
   probe against that same read (a binding edited mid-run cannot make the
   recorded container disagree with the one actually probed), captures the
   check timestamp BEFORE the probe runs, and persists the result —
   including the canonical policy digest — in `provider_connection_evidence`
   (candidate migration `db/migrations/0031_runner_connection_evidence.sql`,
   **not applied**). It refuses outside the same operator/non-cloud
   environment the SSH probe itself requires, and refuses before touching the
   SSH binding at all if `ORIA_OPENHANDS_LAUNCH_CONFIG` is not resolvable.

2. On HQ's own server (where `confirm_launch` actually runs), set two
   server-only environment variables — nothing public, no new credential.
   Use a short pilot freshness window (seconds, not hours or even minutes —
   the schema caps this at 1 hour as a hard ceiling, not a recommendation):

   ```
   ORIA_OPENHANDS_CONNECTION_EVIDENCE_TRANSPORT=persisted
   ORIA_OPENHANDS_CONNECTION_EVIDENCE_BINDING={"version":1,"workspaceId":"qualified-workspace","provider":"claude-code-cli","runnerId":"runner-1","container":"qualified-claude-login","approval":{"status":"approved","approvalReference":"actual written operator approval reference"},"maxEvidenceAgeMs":60000}
   ```

Transport selection is explicit and closed by default: unset (or any value
other than exactly `persisted`) keeps the SSH-only probe byte-for-byte
unchanged, including its cloud-host refusal. There is no fallback between the
two — a revoked SSH approval and "this happens to be a cloud host" produce the
same SSH refusal message, so falling back on that message would have let a
revoked approval silently reach a stale persisted claim. The persisted
transport's own binding independently requires workspace/provider/runner/
container to match the stored row, and the stored row must in turn match the
CURRENT `ORIA_OPENHANDS_LAUNCH_CONFIG` policy digest and runner — a row
recorded under a since-changed policy refuses even though it is otherwise
fresh and positive. A persisted attestation, however fresh, only unblocks
this one account/capability check; it is never a substitute for the
executor's own fresh ACP confirmation immediately before a prompt is sent,
and it says nothing about launch confirmation, mission source, or approval,
which are separate, still-required steps.
