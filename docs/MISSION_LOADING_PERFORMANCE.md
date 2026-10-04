# Mission list loading — bounded first page

2026-09-30. The missions screen now uses its own paged query; existing mission execution/list repository contracts remain unchanged.

- 25 full mission rows per page, newest first with ID tie breaker.
- Title/objective search and status/review filters apply at the server across the active workspace AND mode. Review uses the same four conditions as the approval policy (explicit flag, high risk, autonomy >=4, needs_approval).
- Global mode totals are exact server counts, independent of filters. Eight parallel HEAD queries plus one page query. They are not a transactional snapshot: concurrent updates can temporarily produce differences between counts and rows.
- A stale PostgREST range (416/PGRST103) retries the first page once, with an explicit message. Other failures do not become empty results.
- Page navigation retains filters; local dossier filtering is disabled on this paginated screen. The dossier and Kanban show only the explicitly numbered current page. All policy-review missions are available through the paginated review filter, without implying an executable approval action.
- Regex search values escape regex metacharacters and quote PostgREST syntax. The actual Supabase query builder is tested with a synthetic fetch adapter; the subsequent read-only live qualification below also passed. Large-volume production query latency/index behavior is not measured.
- Offset pagination is not a historical snapshot; concurrent inserts can move rows between pages. All rows remain reachable. Local fallback still reads development-only in-memory fixtures before slicing.

## Reproduce synthetic comparison

From the HQ root, Node 22:

```
node src/scripts/perf/mission-page-benchmark.mjs 1000
node --test src/server/missions/mission-page.test.mjs
```

Same 1,000 deterministic synthetic missions, same actual Kanban component, before all rows versus after first 25. One warm-up, five samples per path, no database, provider, credentials or production calls:

| Metric | Before | After |
|---|---:|---:|
| Initial mission JSON bytes | 4,354,891 | 108,841 |
| Kanban HTML bytes | 2,597,508 | 68,431 |
| Median local SSR render ms | 1,263 | 81 |

Node v22.22.3, React development rendering. Timing is noisy (before samples 112–1,436 ms); this demonstrates the bounded payload/render work, not an end-to-end production speed guarantee. Auth, database counts, network and hydration are excluded. Exact counts increase query count versus the previous unbounded list and can outweigh savings for small datasets. No database latency improvement is claimed.


## Read-only live PostgREST qualification

2026-09-30, Node v22.22.3, existing local server configuration and default workspace/mode. Opt-in script `src/scripts/perf/mission-page-live.mjs` permits only GET/HEAD to the configured origin and exact missions REST path, rejects redirects, caps calls at32, and bounds each request at10seconds. It never prints rows, identifiers, credentials or upstream error details. No database writes or provider calls.

Command (PowerShell; existing local configuration only):

```
$env:HQ_MISSION_READONLY_LIVE='1'
node --env-file=.env.local src/scripts/perf/mission-page-live.mjs
```

Actual result: PASS,28 HTTP requests. One existing mission; old list1 row, new page1 row, global total1 and filtered total1. Unique UUID sentinel search returned0. Sentinel containing regex and PostgREST punctuation combined with the review policy returned0 without parser errors. This verifies acceptance of the literal-search and combined-filter syntax by the live service; it does not seed matching punctuation records or prove all collation semantics.

Single sequential baseline observation: old list907ms, new page395ms. Only one baseline sample each, old first/cold; not statistically comparable and no latency improvement claimed. Two further page calls exercised the sentinel filters (three page invocations total). No large-volume qualification performed. Local synthetic benchmark remains React development mode; importing the application server environment under NODE_ENV=production requires production configuration and is not part of that isolated benchmark.
