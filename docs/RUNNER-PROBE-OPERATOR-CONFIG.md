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
