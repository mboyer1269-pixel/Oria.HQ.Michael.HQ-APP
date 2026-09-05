---
name: database-migration-workflow
description: Workflow command scaffold for database-migration-workflow in Oria.HQ.Michael.HQ-APP.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /database-migration-workflow

Use this workflow when working on **database-migration-workflow** in `Oria.HQ.Michael.HQ-APP`.

## Goal

Adds or modifies a database table or policy, including migration SQL, verification, and documentation.

## Common Files

- `db/migrations/*.sql`
- `db/migrations/*_verify.sql`
- `db/migrations/*_revert.sql`
- `docs/SECURITY_FINDINGS.md`
- `docs/runbooks/*.md`
- `ARCHITECTURE.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Author new migration SQL file(s) in db/migrations/
- Optionally add verify and revert SQL scripts for the migration
- Update related docs to reflect the schema or policy change
- Reference migration status and live-apply in documentation

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.