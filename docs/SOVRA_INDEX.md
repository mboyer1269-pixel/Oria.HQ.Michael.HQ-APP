# SOVRA — Index doctrinal

**Statut:** Table des matières de tous les documents SOVRA répartis sur plusieurs PRs.

**Dernière mise à jour:** 22 mai 2026 (intégration AI Venture HQ → SOVRA + VPS Hostinger)

---

## 1. Doctrine fondatrice (PR #52)

| Document | Rôle | Statut |
|----------|------|--------|
| `AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md` | Doctrine maîtresse SOVRA (5 layers governance, stack, vocabulaire) | PR #52 ouverte |
| `STRATEGIC_ANALYSIS_CTO_2026Q2.md` | Analyse CTO Q2 2026, verdict GO conditionnel, stack sources | PR #52 ouverte |
| `HOLDING_PORTFOLIO_V1.md` | Portfolio v1 — 3 ventures ratifiées, MRR cibles, budgets | PR #52 ouverte |
| `SHARED_EXECUTION_ENGINE.md` | Engine partagé entre les 3 ventures (un seul code path paramétré) | PR #52 ouverte |
| `JORIS_OPERATING_PROFILE.md` | L2 Operating Partner — capacités, limites, format communication | PR #52 ouverte |
| `charters/suivia.ap-ar.md` | Charter venture B2B finance ops PME QC | PR #52 ouverte |
| `charters/noorki.pro-suite.md` | Charter venture B2B real estate (warm prospect broker) | PR #52 ouverte |
| `charters/dadschool.digital.md` | Charter venture B2C digital + communauté | PR #52 ouverte |

## 2. Surface communication (PR #53)

| Document | Rôle | Statut |
|----------|------|--------|
| `README.md` (root) | Positionnement Oria HQ comme surface SOVRA | PR #53 ouverte |
| `CEO_REPORT_TEMPLATE.md` | Daily Brief / Weekly Report / Monthly Audit / Incident Report formats | PR #53 ouverte |

## 3. Captation signaux (PR #55)

| Document | Rôle | Statut |
|----------|------|--------|
| `HQ_SIGNAL_WIRING.md` | Webhook GitHub + crons Computer (Daily 7h, Weekly Fri 17h) | PR #55 ouverte |

## 4. Garde-fous opérationnels + VPS (PR #56 — ce sprint)

| Document | Rôle | Statut |
|----------|------|--------|
| `OPERATIONAL_SAFEGUARDS_V1.md` | 8 garde-fous non-négociables (revenues, caching, schema, sources, stop-loss, anti-sycophancy, rubrique, kill switch J21) | PR #56 ce PR |
| `VPS_HOSTINGER_SETUP.md` | Runbook substrat Hostinger KVM 4 (hardening, backups, Docker, Caddy) | PR #56 ce PR |
| `LESSONS_LEARNED_AI_VENTURE_HQ.md` | Annexe historique avril 2026, retenus vs rejetés | PR #56 ce PR |
| `SOVRA_INDEX.md` | Cet index | PR #56 ce PR |

---

## Ordre de lecture recommandé

### Pour comprendre SOVRA (nouveau lecteur)
1. `README.md` (root) — vision
2. `AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md` — doctrine
3. `HOLDING_PORTFOLIO_V1.md` — les 3 ventures
4. `OPERATIONAL_SAFEGUARDS_V1.md` — comment on évite l'échec

### Pour déployer SOVRA (build sprint)
1. `VPS_HOSTINGER_SETUP.md` — préparer le substrat
2. `OPERATIONAL_SAFEGUARDS_V1.md` — câbler les 8 garde-fous
3. `SHARED_EXECUTION_ENGINE.md` — engine commun
4. `CEO_REPORT_TEMPLATE.md` — formats sortie
5. `HQ_SIGNAL_WIRING.md` — captation externe

### Pour gouverner SOVRA (L0 Michael, hebdo)
1. `CEO_REPORT_TEMPLATE.md` Weekly Report
2. `JORIS_OPERATING_PROFILE.md` — qui décide quoi
3. Charters venture concernée
4. `OPERATIONAL_SAFEGUARDS_V1.md` GF8 (kill switch J21)

### Pour audit historique
1. `LESSONS_LEARNED_AI_VENTURE_HQ.md` — racines décisions
2. `STRATEGIC_ANALYSIS_CTO_2026Q2.md` — verdict CTO
3. Charters venture

---

## Cartographie des PRs

```
main
 ├── PR #52: doctrine fondatrice (8 docs)
 ├── PR #53: README + CEO Report Template
 ├── PR #55: HQ signal wiring + crons
 └── PR #56: garde-fous + VPS + lessons learned + index  ← ce PR
```

**Ordre de merge recommandé:** #52 d'abord (fondation), puis #53 (surface), puis #55 (captation), puis #56 (durcissement).

---

## Validation cumulée

Tous les PRs SOVRA passent les 5 validations :
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run build` ✅
- `npm run smoke:joris` ✅
- `npm run smoke:runtime` ✅

Aucun PR n'introduit de code runtime, de migration, ou de secret. **Docs-only.**
