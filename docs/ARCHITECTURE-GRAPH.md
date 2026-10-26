# Graphe d'architecture — Oria HQ

Généré le 2026-10-25 avec [graphify](https://github.com/Graphify-Labs/graphify) 0.9.95 (commit 92741d1, Apache-2.0), **en mode analyse statique seulement** (`GRAPHIFY_BACKEND=none`, `--code-only`, tree-sitter local, 0 token, aucune API). Source : `origin/main` @ a068f09.

- 8 756 nœuds · 19 282 arêtes · 445 communautés · 99 % des arêtes EXTRACTED (lues dans l'AST), 1 % INFERRED
- Cycles d'import détectés : aucun
- Nœuds les plus connectés : `getActiveWorkspaceContext()` (155), `requireOwnerApiSession()` (103), `requireOwnerAccess()` (63), `createOptionalSupabaseAdminClient()` (61), plus les dépendances `jiti`, `next`, `lucide-react`, `zod`, `react`

![Dépendances entre modules](architecture/oria-architecture.png)

## Les 40 liens les plus forts entre modules (nombre d'arêtes)

```mermaid
graph LR
  src_app_hq["src/app/hq"] -->|242| src_features_hq["src/features/hq"]
  src_app_api["src/app/api"] -->|192| src_server_auth["src/server/auth"]
  src_app_api["src/app/api"] -->|152| src_core["src/core"]
  src_server_ventures["src/server/ventures"] -->|125| src_features_ventures["src/features/ventures"]
  src_server_joris["src/server/joris"] -->|103| src_server_agents["src/server/agents"]
  src_server_missions["src/server/missions"] -->|90| src_core["src/core"]
  src_app_hq["src/app/hq"] -->|78| src_features_cockpit["src/features/cockpit"]
  src_app_api["src/app/api"] -->|70| src_server_missions["src/server/missions"]
  src_features_ventures["src/features/ventures"] -->|65| src_core["src/core"]
  src_features_hq["src/features/hq"] -->|60| src_core["src/core"]
  src_app_hq["src/app/hq"] -->|59| src_features_ventures["src/features/ventures"]
  src_app_hq["src/app/hq"] -->|56| src_server_auth["src/server/auth"]
  src_app_api["src/app/api"] -->|54| src_server_atelier["src/server/atelier"]
  src_app_hq["src/app/hq"] -->|51| src_features_agents["src/features/agents"]
  src_app_hq["src/app/hq"] -->|46| src_core["src/core"]
  src_server_missions["src/server/missions"] -->|44| src_server_agents["src/server/agents"]
  src_features_ventures["src/features/ventures"] -->|41| src_server_ventures["src/server/ventures"]
  src_features_agents["src/features/agents"] -->|41| src_core["src/core"]
  src_features_missions["src/features/missions"] -->|38| src_core["src/core"]
  src_app_api["src/app/api"] -->|37| src_server_agents["src/server/agents"]
  src_server_joris["src/server/joris"] -->|36| src_server_ai["src/server/ai"]
  src_server_ventures["src/server/ventures"] -->|35| src_core["src/core"]
  src_server_missions["src/server/missions"] -->|33| src_server_supabase["src/server/supabase"]
  src_server_actions["src/server/actions"] -->|33| src_server_ledger["src/server/ledger"]
  src_server_joris["src/server/joris"] -->|32| src_server_missions["src/server/missions"]
  src_server_inventory["src/server/inventory"] -->|31| src_features_inventory["src/features/inventory"]
  src_app_api["src/app/api"] -->|31| src_server_sales["src/server/sales"]
  src_app_api["src/app/api"] -->|31| src_features_sales["src/features/sales"]
  src_app_api["src/app/api"] -->|30| src_server_ai["src/server/ai"]
  src_server_ai["src/server/ai"] -->|29| src_server_agents["src/server/agents"]
  src_features_sales["src/features/sales"] -->|29| src_features_inventory["src/features/inventory"]
  src_app_hq["src/app/hq"] -->|29| src_features_workflows["src/features/workflows"]
  src_app_api["src/app/api"] -->|29| src_server_inventory["src/server/inventory"]
  src_app_api["src/app/api"] -->|27| src_server_runtime["src/server/runtime"]
  src_app_api["src/app/api"] -->|27| src_server_outbound["src/server/outbound"]
  src_features_ventures["src/features/ventures"] -->|26| src_server_agents["src/server/agents"]
  src_app_hq["src/app/hq"] -->|26| src_server_memory["src/server/memory"]
  src_app_hq["src/app/hq"] -->|26| src_features_missions["src/features/missions"]
  src_app_api["src/app/api"] -->|25| src_lib["src/lib"]
  src_server_missions["src/server/missions"] -->|23| src_server_mcp["src/server/mcp"]
```

## Régénérer (gratuit, hors ligne)

```bash
uv tool install "graphifyy[sql]==0.9.95"
GRAPHIFY_BACKEND=none graphify extract . --code-only
GRAPHIFY_BACKEND=none graphify cluster-only .
graphify export callflow-html
```

Fichiers produits : `graphify-out/graph.json` (graphe natif), `GRAPH_REPORT.md`, `graph.html` (vue interactive), `*-callflow.html` (Mermaid). Serveur MCP en lecture : `python -m graphify.serve graphify-out/graph.json` (outils `query_graph`, `get_neighbors`, `shortest_path`, `god_nodes`…).
