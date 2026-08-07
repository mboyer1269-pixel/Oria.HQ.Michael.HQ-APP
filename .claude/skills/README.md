# Project Skills Index

This folder contains project-scoped Claude Skills for the repository. Skills placed here are intended to be version-controlled and discoverable by tools like Cursor or Codex when they have access to the project workspace.

**Canonical home for operating-model skills:** `.agents/skills/`. This `.claude/skills/` tree may mirror selected skills for Claude/Cursor discovery.

Included skills (mirrored):

- `multi-agent-orchestration` — Template and best practices for multi-agent workflows (Cursor + Ruflo MCP config notes).
- `create-skill` — Helper to generate a new `SKILL.md` via the orchestration pipeline.
- `supabase` / `supabase-postgres-best-practices` — Upstream Supabase skills (also under `.agents/skills/`).

## Cursor / MCP

- Ruflo (optional): `.cursor/mcp.json` references `node ./bin/cli.js mcp start`. The `bin/cli.js` entrypoint is not currently in this repo — do not assume Ruflo is runnable until that is fixed under an explicit mandate.
- Supabase MCP: root `.mcp.json` (HTTP endpoint).

Required API keys for Ruflo must come from the environment — never commit secrets.
