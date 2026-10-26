# CLAUDE.md

`AGENTS.md` is the canonical source for agent instructions in this repository.

Claude Code must read `AGENTS.md` before taking any action. If instructions conflict, `AGENTS.md` wins unless Michael gives an explicit instruction that overrides it.

Critical rules:

1. Never modify secrets, `.env`, API keys, or credentials.
2. Never start a new phase, feature, or refactor without an explicit mandate.
3. Always validate with typecheck, lint, build, and smoke checks before declaring work complete.

## Architecture Graph

Before making architectural changes (new modules, moved boundaries, new cross-module dependencies), consult [`docs/ARCHITECTURE-GRAPH.md`](docs/ARCHITECTURE-GRAPH.md) and the module diagram [`docs/architecture/oria-architecture.png`](docs/architecture/oria-architecture.png) (source: `docs/architecture/oria-architecture.mmd`). The graph is a static snapshot; note in your handoff if your change makes it stale.
