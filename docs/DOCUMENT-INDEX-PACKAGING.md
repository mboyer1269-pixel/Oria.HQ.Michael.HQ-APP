# Document index — correction de packaging, 24 octobre 2026

Base : `88e4584b2fc878e16c37cd4453ec07bfe70be2a9`. Branche locale `builder/document-index-packaging-local`.

## Défaut et correction

L’argument optionnel `dbPath` de `getDocumentBriefSnapshot` n’était utilisé que par les tests. Son passage à `fs.readFile` empêchait Turbopack de limiter le tracing. Le seul appelant produit, `ceo-brief-service.ts:72`, utilise le chemin par défaut. Le runtime a besoin du seul `db/documents.json`, fixture dev/test ; en production la garde refuse la lecture, sauf opt-in unsafe préexistant.

Le lecteur injectable remplace le chemin injectable. Le lecteur par défaut contient désormais le chemin fixe directement dans `fs.readFile`. Aucun glob d’exclusion, suppression du warning, `turbopackIgnore`, changement de garde ou nouveau stockage. Le lecteur injectable est une dépendance interne de test, pas un paramètre HTTP ou une autorisation.

## Preuve du build Next 16.4.2 / Node 22.23.4

| Trace | Fichiers avant | Après | Sources/docs bruts avant → après |
|---|---:|---:|---:|
| `/hq` | 1580 | 218 | 1209 → 0 |
| `/api/brief/ceo` | 1544 | 180 | 1209 → 0 |
| `/api/joris/chat` | 1571 | 208 | 1209 → 0 |
| `/api/inngest` | 1577 | 214 | 1209 → 0 |

Ces comptes par route se recouvrent : ne pas les additionner comme fichiers uniques. Taille locale standalone arrondie par `du` : 93 Mo avant, 79 Mo après. La fixture reste présente dans les quatre traces et le standalone. Le build ne produit plus le warning. Cela réduit les fichiers inutilement transportés ; aucune exposition HTTP de sources ni compromission n’a été démontrée.

Reproduction après build : `node scripts/check-document-index-bundle.mjs`. Le même contrôle sur l’ancien artefact échoue sur les 1209 fichiers superflus. Il inspecte les métadonnées et l’existence de la fixture, jamais son contenu. Ce contrôle est explicite, pas automatiquement ajouté à la CI.

Next utilise les traces pour préparer les fichiers nécessaires au déploiement et copie ceux-ci dans le standalone. Les assets `public`/`.next/static` restent séparés ; le Dockerfile existant les copie déjà. [Documentation officielle Next, consultée le 24 octobre 2026](https://nextjs.org/docs/app/api-reference/config/next-config-js/output). Le déploiement Vercel n’a pas été exécuté : le contenu d’une fonction hébergée reste à qualifier sur son artefact réel.

## Validation et limites

- Types, lint, build et smoke Joris passent ; tests index/garde : 11 réussis, 0 ignoré, 0 échec. Contre-revue indépendante favorable (mêmes 11 tests, ne pas additionner).
- Cas index : lecteur réel sur fixture temporaire extérieure au dépôt, chemin manquant, JSON malformé/non-tableau, entrées invalides, garde production sans invocation du lecteur, opt-in unsafe existant.
- Standalone copié dans un dossier temporaire extérieur au dépôt et démarré avec environnement nettoyé : serveur démarré ; `/api/health` retourne une erreur de configuration production, car les cinq paramètres owner/Supabase obligatoires sont absents. Aucun paramètre secret ajouté, aucune garde contournée. Ce test ne prouve ni Auth ni page métier. Ce dossier temporaire n’est pas une sandbox OS.
- Premier build du nouveau worktree échoué sur le lien node_modules hors racine Turbopack ; réutilisation du répertoire local déjà installé dans ce worktree, puis build réussi. Aucune dépendance changée ou téléchargée.

Preuves : `/workspace/oria-document-packaging-evidence` (traces avant/après, test régressif, journaux, revue et manifeste).

## Impact fonctionnel restant, hors de ce correctif

Le CEO Brief interprète encore le résultat vide du lecteur gardé comme `documentCount: 0` (`ceo-brief-service.ts:101,117`). En production sans opt-in, cela ne démontre pas l’absence de documents Supabase : ce lecteur n’est pas raccordé à cette table. Le prochain lot utile serait de représenter explicitement cette source indisponible dans le contrat/affichage du brief, avec test « source non lue ≠ zéro confirmé », avant un éventuel raccordement authentifié. Aucun raccordement ni changement de ce comportement dans ce patch de packaging.

Retour arrière : réversion de ce seul commit sur une branche dédiée ; aucune migration ou donnée distante à restaurer. Aucun push/déploiement, nouvelle authentification, fournisseur ou opération refusée exécuté.
