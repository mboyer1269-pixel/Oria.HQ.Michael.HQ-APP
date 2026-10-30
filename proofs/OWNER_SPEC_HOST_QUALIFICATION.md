# Owner-spec qualification without a model

`node proofs/prove-owner-spec-host.mjs --run` runs a deterministic helper through
the sandbox arguments of the existing `boundSpecInvocation`. It never runs a
provider CLI, authenticates, reads real credential files or changes host settings.
The command is explicit and exits nonzero if bwrap/namespaces cannot start. There
is no unconfined fallback and no skipped assertion interpreted as success.

The scoped observations are: SPEC.md overwrite, denial of another repository
write and SPEC rename, denial of a synthetic private sibling file, denial of a
connection to the host's loopback listener, and termination of a hanging helper
plus its delayed-writing child using the existing recorded-process group kill.
The parent checks that the delayed child never changes SPEC.md after termination.

This is not complete sandbox certification. It does not prove that arbitrary
subprocesses cannot start: the recipe exposes system executables, while CLI tool
restrictions are a separate boundary. It does not prove provider authentication,
permitted provider egress, model identity, billing, file-tool compatibility, or a
live agent mission. No shell execution denial is claimed by this harness.

The ordinary unit command is `node --test proofs/owner-spec-host-proof.test.mjs`.
It does not invoke bwrap. Its negative control runs the real helper against only
synthetic temporary files and a loopback listener, and requires it to detect the
absence of confinement. These unit results are not real sandbox results.

## Existing compatible CI mode

The global `.github/workflows/ci.yml` already has its approved disposable-runner
bubblewrap setup. The candidate adds a two-minute proof step immediately after
that setup and installed Node dependencies. It runs the unit tests and the real
`node proofs/prove-owner-spec-host.mjs --run` command with pipefail, then requires
the exact success marker. It never uses continue-on-error or a fallback.
No installation, permission or sysctl/AppArmor setup is changed. Publication and
actual remote execution remain separate from this local candidate.
Do not retry the known restricted cloud namespace probe or loosen its settings.

The existing owner-spec-real-db-fake-cli job runs
`node proofs/prove-owner-spec-real-db.mjs --run`; its mandatory thirteenth-group
total includes the strengthened local-recovery case. That proof's `--recover-proof` mode covers recovery of an
unpublished local SPEC in a new OS process. It reconstructs the engine with a null
provider, fences child-process execution, records through the existing store and
then proves an idempotent reread. This remains a fake-provider/disposable-DB proof,
not a real-provider or whole-host-restart claim.
