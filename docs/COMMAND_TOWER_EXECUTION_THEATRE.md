# Command Tower — Execution Theatre (Bloc B)

Status: implemented on branch `cursor/execution-theatre-sse-af8b`  
Depends on: existing `action_ledger` + `agent_execution_intents` read paths (no schema changes)

## Why SSE (not browser Supabase Realtime)

`action_ledger` and `agent_execution_intents` are **service-role only** (RESTRICTIVE
block-all RLS for anon/authenticated). A browser Realtime subscription cannot see
those rows without weakening RLS. Bloc B therefore:

1. Authenticates the owner (`requireOwnerApiSession`)
2. Re-validates `?workspaceId=` against `getActiveWorkspaceContext().workspace.id`
3. Polls the existing repositories server-side
4. Streams diffs over **SSE** to the client island

## Surfaces

| Piece | Path |
|---|---|
| SSE route | `GET /api/hq/theatre/stream?workspaceId=…` |
| Pure events | `src/features/hq/theatre/theatre-events.ts` |
| Diff/poll | `src/server/hq/theatre-stream.ts` |
| Client hook | `src/features/hq/theatre/use-theatre-stream.ts` |
| Terminal feed | `src/features/hq/components/agent-terminal-feed.tsx` |
| Approval rail | `src/features/hq/components/approval-rail-realtime.tsx` |
| Island | `src/features/hq/components/execution-theatre-client.tsx` |

## HITL invariants

- PENDING intents appear live in the Approval Rail
- APPROVE / REJECT require an explicit confirm click (positive friction)
- Approve still hits the existing `/approve` route (cryptographic proof + dispatch)
- No mock theatre events — empty state is honest when the ledger is empty
