# Project Skills Index

This folder contains project-scoped Claude Skills for the repository. Skills placed here are intended to be version-controlled and discoverable by tools like Cursor or Codex when they have access to the project workspace.

Included skills:

- `multi-agent-orchestration` — Template and best practices for multi-agent workflows (Cursor + Ruflo MCP).
- `create-skill` — Helper to generate a new `SKILL.md` within this repository.

To make skills executable from an IDE (Cursor), add a `.cursor/mcp.json` referencing your local MCP server and ensure required API keys are available in the environment.
