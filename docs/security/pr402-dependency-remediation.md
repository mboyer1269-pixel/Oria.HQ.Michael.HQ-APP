# PR402 — correction ciblée des dépendances, 24 octobre 2026

## Résultat et portée

Base420324cf066a14211fdb3bcdd6483352d1b64b51. Reprend seulement les versions de dépendances de PR400cb3dfe35 et les correctifs locaux qualifiés; aucun changement fonctionnel de PR400 importé. Next/eslint-config-next16.4.2, MCP1.32.1, Zod4.6.6; transitifs et Vitest corrigés dans le lock. PostCSS override8.5.30 satisfait aussi la borne de Vite8.3.5, contrairement à8.5.26. Inngest demeure3.54.2. Aucun fork, retrait fonctionnel, audit fix --force ni nouvelle exception.

CI initiale40059913580 :2critical,6high,4moderate, quatre dépendances déclarées bloquantes. Le rapport npm groupe par package et propage certains avis : ce ne sont pas douze exploits indépendants. Audit avant reconsulté sur lock identique; IDs ci-dessous.

## Inventaire des avis

| Paquet / sévérité / direct | Version résolue après | Avis et plage affectée | Chaîne / exposition |
|---|---|---|---|
| @modelcontextprotocol/sdk / high / True | @modelcontextprotocol/sdk@1.32.1 | [GHSA-22jm-h49p-29qw](https://github.com/advisories/GHSA-22jm-h49p-29qw) >=1.24.0 <1.32.0; [GHSA-6prh-2h8m-c8cw](https://github.com/advisories/GHSA-6prh-2h8m-c8cw) <1.32.0; [GHSA-46jr-4wx8-v453](https://github.com/advisories/GHSA-46jr-4wx8-v453) >=1.3.0 <1.32.0; [GHSA-rvq5-wwqv-78pq](https://github.com/advisories/GHSA-rvq5-wwqv-78pq) >=1.6.0 <1.32.0 | Client Memex stdio derrière garde serveur; usages HTTP/serveur SDK non trouvés dans ORIA. Parser des réponses à conserver protégé. |
| @vitest/mocker / moderate / False | @vitest/mocker@4.1.12 | [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) >=2.1.0-beta.7 <4.1.12; [GHSA-xp26-3454-mjgp](https://github.com/advisories/GHSA-xp26-3454-mjgp) >=4.1.11 <4.1.12 | Transitive Vitest; enregistrement de mocks/chemins, outil dev. |
| body-parser / high / False | body-parser@2.4.0 | [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) >=2.0.0 <2.4.0 | Transitive Express du SDK; présence confirmée, exposition via HTTP Express ORIA non démontrée. |
| fast-uri / moderate / False | fast-uri@3.1.9 | [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) >=3.0.0 <3.1.9; [GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h) >=3.0.0 <3.1.9; [GHSA-wjr9-j795-jxcr](https://github.com/advisories/GHSA-wjr9-j795-jxcr) >=3.1.3 <3.1.9; [GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp) >=3.0.0 <3.1.9 | Transitive ajv/ajv-formats; analyse URI de schémas et outils. |
| inngest / high / True | inngest@3.54.2 | propagation via zod | Endpoint /api/inngest GET/POST/PUT et cron quotidien réellement câblés. |
| ip-address / moderate / False | ip-address@10.7.4 | [GHSA-rxp7-6hxx-x8q5](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5) <=10.7.3 | Transitive express-rate-limit/MCP; analyse IPv6. |
| next / critical / True | next@16.4.2 | [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) >=16.0.0 <=16.4.0; [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) >=16.0.0 <=16.4.0; [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr) >=16.0.0 <=16.4.0 | Framework public et proxy de session; autorisation applicative ne remplace pas correction framework. |
| proxy-addr / critical / False | proxy-addr@2.0.8 | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) >=1.1.0 <2.0.8 | Transitive Express; calcul trust proxy si cette pile est utilisée. Non déclaré inoffensif par défaut. |
| source-map-js / high / False | source-map-js@1.2.2 | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) >=1.0.0 <1.2.2 | PostCSS et outils de compilation; lecture de source maps, exposition réseau production non démontrée. |
| vite / high / False | vite@8.3.5 | [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) >=8.3.0 <=8.3.2; [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) >=8.3.0 <=8.3.2; [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) >=8.3.0 <=8.3.2; [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) >=8.3.0 <=8.3.2; [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) >=8.3.0 <=8.3.2; [GHSA-vfpm-58rq-9qcg](https://github.com/advisories/GHSA-vfpm-58rq-9qcg) >=8.3.0 <=8.3.2 | Outil de développement transitif Vitest; serveur dev/middleware selon mode, pas le serveur Next production. |
| vitest / moderate / True | vitest@4.1.12 | propagation via @vitest/mocker | Outil dev direct, transport de mocks; ne pas exposer serveur de test. |
| zod / high / True | inngest/node_modules/zod@3.25.76, zod@4.6.6 | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) <4.6.6 | Validation entrées HTTP; racine corrigée, copie interne Inngest encore affectée. |

## Choix et compatibilité

Les plages corrigées sont attestées par les avis officiels référencés et contrôlées par npm audit, pas par le seul numéro catalogue. Next16.4.2 et MCP1.32.1 reprennent les versions déjà sélectionnées dans PR400; exigences Node respectivement>=20.9.0 et>=18, compatibles22.23.4. Zod4.6.6 corrige le parseurv4 des collections bornées. Vitest4.1.12 rétroporte la correction des mocks. Body-parser2.4.0 nécessite son content-type2.1.0 et qs6.16.1; content-type1 utilisé ailleurs reste distinct. Proxy-addr2.0.8/source-map-js1.2.2/ip-address10.7.4/Vite8.3.5/fast-uri3.1.9 retirent leurs avis du graphe observé. Les bindings Next/rolldown changent avec leurs parents, pas comme fonctionnalités nouvelles.

Lock régénéré par npm11.9.0 exécuté sous Node22.23.4 (`npm update fast-uri postcss --package-lock-only --ignore-scripts --no-audit --no-fund`) depuis le lock ciblé préparé. Installation propre vérifiée ensuite par npm ci10.9.9, version utilisée en CI. Pas de --legacy-peer-deps. Aucune métadonnée advisory modifiée.

## Résiduel bloquant — aucune exception activée

Inngest3.54.2 importe zod/v3 et résout3.25.76; racine4.6.6 ne remplace pas cette implémentation. Dernière4.26.0 inspectée garde aussi v3, et aucun rétroportage Zod3 correspondant trouvé. GHSA-mrhx-c7xc-m3w5 reste donc signalé pour Zod puis Inngest. /api/inngest est raccordée à jorisExecuteJob et shadowScoreCron; le chat synchrone ne prouve pas une absence d’exposition. Le prototype de protection HTTP antérieur est hors produit et ne doit pas être compté comme contrôle déployé.

**Règle envisageable, NON activée et NON approuvée :** dérogation temporaire uniquement pour GHSA-mrhx-c7xc-m3w5, chemin exact node_modules/inngest/node_modules/zod@3.25.76, parentinngest@3.54.2. Ne couvrir la propagation Inngest que si tous ses motifs restants se réduisent à cet avis exact. Ne couvrir ni Zodracine ni autre avis/version/chemin. Expiration proposée2026-10-31T00:00:00Z, sans renouvellement automatique; échec obligatoire après échéance, graphe modifié, audit indisponible ou nouvel avis. Conserver alerte visible, responsable nommé et revue du risque/documentation d’exposition. Ce mécanisme serait une acceptation explicite du risque résiduel, pas une correction. Sa mise en œuvre nécessite une décision séparée; aucun code de cette règle ajouté ici.

**Décision nécessaire pour lever ce gate sans correctif amont :** Michael doit accepter explicitement ou refuser cette dérogation bornée et ses conditions après examen du risque. Sans accord, la recommandation reste de garder la PR en brouillon et le gate rouge. Aucune autorisation implicite déduite de la demande de documentation. Un fork ou retrait exige une autre décision de portée.

## Vérification et limites

Contrôles normaux Node22.23.4 : npm ci, typecheck, lint, build Next, smoke:joris et suite applicative. Résultats définitifs consignés après exécution. Aucun banc d’exploitation ni test intégrév3 refusé relancé. Aucun fournisseur, hôte, secret ou infrastructure. Audit après correction doit rester honnêtement bloquant sur le résiduel. Le build Next natif ne prouve pas le build Docker, dont la limite DNS antérieure reste ouverte.

Sources supplémentaires : [release Next16.4.2](https://github.com/vercel/next.js/releases/tag/v16.4.2), [Zod4.6.6](https://github.com/colinhacks/zod/releases/tag/v4.6.6), [Vitest4.1.12](https://github.com/vitest-dev/vitest/releases/tag/v4.1.12), métadonnées du registre npm et avis ci-dessus.

### Résultats locaux terminés

Node22.23.4/npm10.9.9 : npm ci PASS; typecheck PASS; lint PASS; build PASS; smoke:joris PASS; npm test4495tests,4487pass,8skip,0fail. Audit après :0critical,2high,0moderate, uniquement Inngest/Zod interne. Gate FAIL, sans exception ajoutée. La suite ici est celle de la base PR402; les nombres d’autres branches ne sont pas interchangeables.

Investigation indépendante puis contre-revue indépendante du candidat : aucun nouveau contournement ni régression concrète trouvé; résiduel confirmé. Régénération npm11 retire certains champs libc d’entrées optionnelles Linux inchangées, sans modification de leurs versions/URL/intégrités; aucune régression concrète établie, autres plateformes non exécutées. Aucun banc intégrév3 ou ancien banc d’exploitation exécuté dans ce lot. Le fichier de référence artifact-storage du skill fix-finding n’était pas accessible via le fournisseur de skills; les preuves restent locales et cette note est la documentation explicitement demandée.
