# Les deux chaînes de HQ — lignée vs intégrité

> Résout l'incohérence P3 de `docs/HQ_COHERENCE_AUDIT.md` : le terme fourre-tout
> « line chain » recouvrait **deux** chaînes distinctes, jamais nommées ni
> reliées. Elles sont distinctes, complémentaires, et se rejoignent sur
> l'Action Ledger.

## Deux chaînes, deux couches

| | **Memory lineage chain** (chainline) | **Ledger integrity chain** (hash-chain) |
|---|---|---|
| Question | « D'où vient cette décision et qu'a-t-elle causé ? » | « Cette entrée du ledger a-t-elle été altérée ? » |
| Nature | Lignée sémantique (provenance → résultat) | Intégrité cryptographique (tamper-evidence) |
| Forme | `source → note → decision → action → ledger → pr → next` | `entry_hash` chaîné à `prev_hash` + HMAC |
| Code | `src/server/memory/memory-graph.ts` (`buildChainlineGraph`) | `src/server/ledger/hash-chain-*.ts` |
| Doc | `docs/memory-vault/CHAINLINE.md` | `docs/ledger/hash-chain-track-status.md` |
| Statut | **live** (vault v0.1) | **shadow** (flag off) — voir `HQ_CAPABILITY_STATUS.md` |

## Où elles se rejoignent : l'Action Ledger

L'entrée du ledger est le **point d'ancrage commun** :

- La **chainline** *pointe* vers un événement ledger via son étape
  `[[ledger:event-ref]]` — « cette décision a produit cette action journalisée ».
- Le **hash-chain** *scelle* ce même événement — « cette action journalisée est
  intacte ».

Ensemble : **provenance (chainline) + intégrité (hash-chain) = auditabilité
complète.** L'une dit *pourquoi / d'où vient* ; l'autre garantit *non-altéré*.
Ni l'une ni l'autre n'autorise une exécution.

## Ne pas confondre

- **« chainline »** = lignée de savoir (mémoire). Jamais cryptographique.
- **« hash-chain »** = preuve d'intégrité (ledger). Jamais sémantique.
- Le mot fourre-tout **« line chain » est retiré** — utiliser le nom précis.

## Références

- Lignée : `docs/memory-vault/CHAINLINE.md`
- Intégrité : `docs/ledger/hash-chain-track-status.md` +
  `docs/security/action-ledger-hash-chain-plan.md`
- Statut d'activation : `docs/HQ_CAPABILITY_STATUS.md`
  (`memory_vault` = live ; `ledger_hash_chain` = shadow)
