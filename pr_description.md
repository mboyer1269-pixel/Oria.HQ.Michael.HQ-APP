# PR 1 : security(runtime): route green lane webhooks through server registry

## Summary
Cette PR isole la "Green Lane" (exécution des agents IA) en retirant la capacité du client ou de l'agent de dicter sa propre destination d'exécution (`webhookUrl`). Désormais, le dispatcher route les requêtes vers des webhooks externes approuvés via un registre serveur strict (`webhook-registry.ts`) basé sur le tuple `(agentId, skillId)`, et protège le webhook sortant par une signature HMAC (`x-orya-signature`). 

## Changes
- **`src/app/api/agents/[agentId]/execute/route.ts`** : Suppression de `webhookUrl` dans le schéma de validation (`executeRequestSchema`) et dans le destructuring. Le client ne peut plus injecter de webhook arbitraire.
- **`src/server/runtime/skill-dispatcher.ts`** : 
  - Utilisation de `resolveApprovedWebhook(agentId, skillId)` au lieu du payload client.
  - Implémentation du HMAC sortant (`x-orya-action-ref`, `x-orya-timestamp`, `x-orya-signature`) avec validation stricte du secret.
  - Si la résolution du registre échoue, le système bascule automatiquement sur le comportement **`dry-run`** avec log d'avertissement.
- **`src/server/runtime/webhook-registry.ts`** : Création du composant serveur contenant l'allowlist en dur (agent, skill, secret requis, hostnames).
- **`src/server/runtime/webhook-registry.test.mjs`** : Suite de tests unitaires avec Jiti validant la résolution (hostnames, secrets manquants, bindings inexistants).
- **`.env.example`** : Ajout de la clé `AGENT_WEBHOOK_SIGNING_SECRET`.

## Zone Classification
**Yellow / Green** : Bien que ces actions concernent le runtime (exécution live), elles durcissent la sécurité de l'API (Green Lane) et bloquent l'exfiltration vers des URL arbitraires (prévention SSRF/Exfiltration).

## Out of Scope
- Pas de nouvel event DB pour le Ledger (comme demandé, pas de schéma de DB impacté ici).
- Les validations par skill et l'Idempotency (`idempotencyKey`) seront traitées dans la **PR 3**.

## Validation Plan & Results
Les commandes suivantes ont été exécutées avec succès en local :
- `npm run typecheck` : ✅ PASS
- `npm run lint` : ✅ PASS
- `npm run test:execution-guard` : ✅ PASS
- `npm run test:ledger-events` : ✅ PASS
- `npm run test:webhook-registry` : ✅ PASS
- `npm run build` : ✅ PASS

### Preuves et Comportements (comme demandé) :
- **Preuve webhookUrl retiré** : Le fichier `route.ts` a perdu son champ `webhookUrl: z.string().url().optional()`. Toute tentative d'en envoyer un est ignorée silencieusement par Zod (comportement safe).
- **Preuve registry serveur-side** : Le tableau `APPROVED_WEBHOOK_BINDINGS` est déclaré en dur dans `webhook-registry.ts`. L'URL finale est lue avec `process.env[binding.envKey]`.
- **Comportement si aucun webhook approuvé** : Le dispatcher tombe dans le `Strategy 3: Dry-run` (cf `skill-dispatcher.ts` l. 80+), qui retourne `{ preview: true, message: "Skill... executed in dry-run mode" }`.
- **Comportement si secret HMAC absent** : Si le binding exige une signature (ce qui est le cas en dur) mais que `.env` n'a pas `AGENT_WEBHOOK_SIGNING_SECRET`, la promesse `throw new Error("Missing AGENT_WEBHOOK_SIGNING_SECRET...")` et le catch externe (dans l'API route) enregistre un `failed` dans la table `agent_outcomes` (le vrai ledger pré-dispatch arrivera en PR2).
- **Limites dev/prod (localhost)** : Le champ `allowedHostnames` dans le registre autorise explicitement `["hooks.n8n.cloud", "n8n.michaelhq.com", "localhost", "127.0.0.1"]`, permettant l'usage local tout en filtrant les requêtes arbitraires.

## Diff stat global
```text
 .env.example                                  |  1 +
 package.json                                  |  3 ++-
 src/app/api/agents/[agentId]/execute/route.ts |  4 +--
 src/server/runtime/skill-dispatcher.ts        | 51 ++++++++++++++++++++++------------
 src/server/runtime/webhook-registry.test.mjs  | 63 +++++++++++++++++++++++++++++++++++++++++
 src/server/runtime/webhook-registry.ts        | 73 ++++++++++++++++++++++++++++++++++++++++++++++++
```

## Risks & Assumptions
- Si le `AGENT_WEBHOOK_SIGNING_SECRET` n'est pas provisionné côté Vercel avant le déploiement, les webhooks sortants planteront.

## Rollback Plan
- Revert de la PR via git. 
- Aucun schéma de DB impacté. Le rollback est immédiat et sans effet de bord sur les données existantes.
