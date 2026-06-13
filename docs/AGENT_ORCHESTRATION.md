# Doctrine d'orchestration des agents — Oria HQ

Statut : appliqué (2026-06-12). Couche de données : `src/features/agents/agent-charter.ts`
(contrat), `src/features/agents/charter-seed.ts` (chartes), panel `/hq/agents`.

## Pourquoi cette doctrine

Le registre (`seed.ts`) dit *qui* est un agent. La charte dit *pourquoi il existe* et
*comment il gagne sa place*. Un agent sans mission mesurable, sans workflow déclenchable
et sans KPI est décoratif — le rapport de santé des chartes le rend visible au lieu de
le cacher.

Fondement : les patterns d'orchestration qui tiennent en production en 2026 sont au
nombre de cinq — séquentiel, parallèle (fan-out/fan-in), hiérarchique
(manager/workers), handoff (routage) et boucle (itération avec évaluation). Les
systèmes sérieux les combinent. Anthropic ajoute trois principes : simplicité,
transparence (montrer le plan), et interface agent-outil soignée.

## Architecture retenue : hub-and-spoke gouverné

```
                       CEO (Michael)
                            │ mandat / clic final
                            ▼
                  ┌──── JORIS (hub) ────┐
                  │ intention → mission │
                  │ routage cerveau     │
                  │ ledger, lessons rail│
                  └──┬───┬───┬───┬───┬──┘
       détection     │   │   │   │   │     exécution
  Radar ─ signaux ───┘   │   │   │   └─── Relay ─ SOPs, Send Desk
  Lab ──  scoring ───────┘   │   └─────── Forge ─ specs, MVP
                             │            Studio ─ contenu
            gates & mémoire  │            Closer ─ (gelé)
  Sentinel ─ Green/Yellow/Red┤
  Scribe ──  vault, leçons ──┤
  FinOps ──  cash, runway ───┘
```

Règles structurelles :

1. **Un seul hub.** Joris est l'unique point de routage et d'imputabilité. Les modules
   ne se parlent jamais directement — toute transmission passe par une mission Joris.
   (Pattern orchestrator-worker : un point de responsabilité, des workers spécialisés.)
2. **Le hub reste léger.** Le risque connu du pattern est l'engorgement de contexte de
   l'orchestrateur. Parade déjà en place : lessons rail capé (5 leçons / 2000 chars),
   model router (cerveau le moins cher qui suffit), missions plutôt que conversations.
3. **Boucle d'évaluation séparée.** Sentinel est l'évaluateur du pattern
   evaluator-optimizer : il évalue, ne produit jamais. L'arena + quality evaluation
   mesurent ; le learning loop transforme les verdicts en leçons vérifiées qui
   reviennent dans le lessons rail. C'est la boucle d'amélioration continue du HQ.
4. **Frontières journalisées.** Chaque passage de frontière (mission, verdict, envoi)
   s'écrit au ledger — le « structured logging at every agent boundary » des systèmes
   de production.
5. **Workers testables seuls.** Chaque module se valide indépendamment (tests par
   contrat) avant d'être branché au hub — jamais l'inverse.

## La charte : contrat ADN de chaque agent

Chaque agent du registre a exactement une charte (test bloquant) :

| Champ | Question à laquelle il répond |
|---|---|
| `mission` | Quel résultat cet agent doit-il au HQ ? |
| `dna.identity` | Comment se pense-t-il en une ligne ? |
| `dna.operatingPrinciples` | Comment décide-t-il quand personne ne regarde ? |
| `dna.prioritization` | Que fait-il en premier quand tout est urgent ? |
| `roiLevers` | Quel levier tire-t-il : revenu, coûts, temps, risque, décision ? |
| `workflows[]` | Déclencheur → raison business → output → validation → prochaine action |
| `successCriteria` | À quoi ressemble la réussite, en termes vérifiables ? |
| `kpis` | Comment on la mesure ? |
| `escalation` | Quand doit-il s'arrêter et remonter ? |

Invariants tenus par les tests (`test:agent-charter`) :

- couverture 1:1 registre ↔ chartes, zéro orpheline, zéro doublon ;
- un workflow ne consomme que des skills accordées par le registre ;
- chaque workflow a un déclencheur, une raison business, un output, une validation et
  une prochaine action — un workflow qui ne déclenche rien est refusé ;
- chaque charte déclare ≥ 2 principes, ≥ 1 KPI, ≥ 1 levier ROI, une escalade ;
- la charte du Closer (gelé) maintient « 0 envoi direct » comme cible.

## Supervision : le regard CEO/Operator

`buildCharterHealthReport` score chaque charte 0–100 (mission, ADN, workflows
complets, critères, KPIs, ROI) et rend un verdict :

- **opérationnel** (≥ 85) — l'agent peut être tenu responsable de sa charte ;
- **à renforcer** (50–84) — il existe mais sa substance mesurable est incomplète ;
- **décoratif** (< 50) — il ne survivrait pas à la question « est-ce que ça aide
  Michael à gagner du temps, faire plus d'argent, mieux décider ? ».

Le panel « Chartes opérationnelles » de `/hq/agents` affiche le score, le verdict et
le premier manque actionnable de chaque agent. Un agent sans charte apparaît en rouge —
visible, pas caché.

## Chaînes de valeur inter-agents (via le hub)

Trois chaînes produisent le ROI du HQ ; chaque flèche est une mission Joris :

1. **Pipeline revenu** : Radar (signal) → Lab (scoring go/no-go) → Forge (plan MVP)
   → Relay/Studio (préparation) → Send Desk (clic CEO) → Closer (au dégel).
2. **Boucle d'apprentissage** : mission fermée → Scribe (résumé + leçon candidate)
   → gouvernance learning loop → leçon vérifiée → lessons rail → meilleures décisions
   Joris. Le HQ n'apprend jamais deux fois la même leçon.
3. **Boucle de contrôle** : toute action niveau 4-5 → Sentinel (verdict motivé) →
   FinOps (impact cash visible) → ledger. L'autonomie augmente parce que le contrôle
   est prouvé, pas promis.

## Évolution

- Une charte se modifie par PR avec la même discipline que le code — les tests refusent
  les chartes creuses.
- Quand un agent passe `planned → standby → active`, ses KPIs passent de cibles à
  mesures (brancher sur `observed-agent-outcome` / arena).
- Tout nouvel agent arrive **avec** sa charte dans la même PR, sinon le test
  `every registry agent has exactly one valid charter` casse le CI.

## Sources

- Anthropic — Building Effective Agents (workflows, evaluator-optimizer, simplicité/transparence/ACI)
- Patterns de production 2026 : séquentiel, parallèle, hiérarchique, handoff, boucle ;
  hub-and-spoke avec orchestrateur unique ; logging structuré aux frontières ;
  workers testés indépendamment avant intégration.
