# Lot A′ — Point de récupération (2026-10-25, ~11 h 40 HE Toronto)

## SHA figés
```
main  491a7a9b27106e514cc98ca8e300f9db93cb84ac
pr406 83e7b1c0b67e5b63667e30dcbaa3ee60ec4531cd
pr408 bfe2032e29bc9c2a9e9b4ed36fc22a05eece480c   (avant mon commit 492e404)
pr409 e635d745c59a2e78df8a286a1d794879b2e2084b   (avant mon commit 6c25d7a)
pr410 aac608bfaf086ca0fa18116a4dbab173a7f45fba
pr411 3749d042cbebae1f9cf3093281327d959789616e
pr412 d4921743b792981110e8f2a885b4786065d5354f
pr413 b7b0217f18b65c7059c8dc0325d243acbd7829db
```

## Où
- Bundle git : `/workspace/oria-recovery/oria-2026-10-25.bundle` (sur la box), sha256 `4607495412b2dfd5a296ff5999dc3dfc96b11ce299bbcdbe448e04fc2ba394fe`. Contient main, les 7 têtes et les tags.
- Tags **locaux** (non poussés) : `recovery-2026-10-25/main`, `recovery-2026-10-25/pr406` … `pr413`.

## Restauration essayée
```
T=$(mktemp -d); git clone /workspace/oria-recovery/oria-2026-10-25.bundle $T/r
cd $T/r && git bundle verify …            # « The bundle uses this hash algorithm: sha1 » (ok)
for t in main pr406 … pr413; do git rev-parse recovery-2026-10-25/$t^{commit}; done > restore-check.txt
diff SHA.txt restore-check.txt             # aucune différence → RESTORE_OK
git checkout recovery-2026-10-25/main      # arbre 93a41953… = arbre de origin/main 93a41953…
```
Résultat : **RESTORE_OK**, arbre identique. Pour revenir sur une PR : `git push origin recovery-2026-10-25/pr408:refs/heads/<nouvelle-branche>` (jamais de force-push sur la branche existante).

## Pas fait
- `pg_dump --schema-only` : aucune base de test accessible depuis la box. À faire en B′ avant d'appliquer 0032.
