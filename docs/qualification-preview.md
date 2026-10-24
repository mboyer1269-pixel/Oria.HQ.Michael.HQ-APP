# Preview de qualification : garde de build locale

Le chemin de qualification est raccordé dans **`vercel.qualification.json`** : sa propriété `buildCommand` appelle `node scripts/qualification-preview.mjs --build`, donc la garde précède le build Next. Cette configuration est sélectionnée explicitement ; elle ne remplace pas le build normal et aucun hébergement actif n’a été modifié. Il ne déploie rien, ne configure aucun secret, n’applique aucune migration et n’active aucun profil ni permission d’exécution.

## Commandes

```sh
node scripts/qualification-preview.mjs --check
node scripts/qualification-preview.mjs --build
node --test scripts/qualification-preview.test.mjs scripts/qualification-build.test.mjs
```

Pour une future qualification autorisée via le CLI Vercel déjà installé et épinglé, le sélecteur est `--local-config vercel.qualification.json`, notamment pour `vercel build --local-config vercel.qualification.json`. **Cette commande Vercel n’a pas été exécutée ici** : la liaison à un projet séparé, les paramètres de preview et l’accès sécurisé restent à approuver/préparer. Ne pas utiliser la liaison `.vercel` du projet de production. Le fichier n’est pas nommé `vercel.json` afin de ne pas changer les builds Git actuels ; une intégration Git ne le sélectionne pas automatiquement.

Le fichier ne contient ni projet, domaine, token, variable de secret, commande de déploiement, ni configuration de permissions. La protection privée et la provenance des paramètres devront être vérifiées sur le futur projet ; cette configuration seule ne les crée pas. Ne pas passer `--prod` : la garde refuse une cible production signalée par Vercel, même avec une URL staging.

L’environnement de build doit être fourni par une procédure sécurisée approuvée séparément. Le script ne charge aucun fichier `.env` et refuse la présence des quatre fichiers que Next charge en mode production (`.env`, `.env.local`, `.env.production`, `.env.production.local`). Il n’en lit pas le contenu. Ne pas supprimer automatiquement des fichiers pour passer cette garde : préparer une copie de build isolée.

Le contrôle exige `NEXT_PUBLIC_SUPABASE_URL=https://teatqbtzgzcygpefnfbh.supabase.co`. Cette référence publique correspond au staging identifié, pas à une clé. Les références et URL Supabase alternatives reconnues doivent être cohérentes. Une URL production, un hôte ressemblant, un chemin supplémentaire ou des identifiants dans l’URL sont refusés. Les cibles Vercel renseignées doivent être `preview`.

Les paramètres connus de fournisseurs, exécution, webhooks, facturation, envoi et connexion SQL directe sont refusés. Les clés Supabase ne sont ni affichées ni authentifiées par le script : **le contrôle d’URL ne prouve pas leur appartenance au staging**. La provenance de chaque secret devra être qualifiée séparément, avant toute utilisation distante. Cette liste de paramètres est une défense de configuration, pas un bac à sable réseau ni une garantie d’absence de tout nouveau connecteur.

Les deux implémentations de flags doivent rester exactement fermées : `AGENT_DISPLAY_NAMES_LIVE = false` et `EMPLOYEE_DIRECTORY_LIVE = false`. Aucune variable d’environnement ne les ouvre. Le build produit donc encore une interface de fonctionnalités indisponibles tant que la qualification de persistance et l’ouverture explicite n’ont pas été approuvées. Un profil de présentation ne devient jamais une autorisation d’exécuter.

`--check` ne lance pas de build. `--build` contrôle d’abord, puis exécute une seule fois le `npm run build` existant, avec `NODE_ENV=production` (mode d’optimisation Next, **pas la cible Supabase**). Son code d’échec est conservé ; une interruption échoue aussi. Aucun retry automatique.

## Artefact limité à sa cible

Les variables `NEXT_PUBLIC_*` sont incorporées au bundle pendant le build. **Ne jamais promouvoir cet artefact staging comme artefact de production** : changer les variables au runtime ne remplace pas les valeurs déjà compilées. Toute autre cible demande un build distinct et sa propre validation. La présente garde refuse la cible production et n’est pas destinée à ce futur build.

Références officielles : [variables Next.js](https://nextjs.org/docs/app/guides/environment-variables) et [promotion Vercel](https://vercel.com/docs/deployments/promoting-a-deployment). Ce document ne met en place aucune commande de promotion.

## Niveau de preuve

Les tests de garde utilisent des paramètres synthétiques et un processus de build substitué. La table des clés API de fournisseurs est comparée aux déclarations de `src/lib/server-env.ts`, lu comme texte sans importer son initialisation ; elle couvre notamment `GOOGLE_GENERATIVE_AI_API_KEY` et `ELEVENLABS_API_KEY`. Les tests de raccordement lisent la configuration réelle, exécutent sa commande avec le vrai script de garde dans une copie isolée, et substituent seulement le dernier processus npm : ils démontrent refus avant build, absence des valeurs synthétiques dans les diagnostics, appel du build après admission et propagation de son échec. Aucun Vercel CLI ni secret n’est utilisé. Ils prouvent le comportement de la garde, pas un déploiement, un login Auth, une appartenance réelle de clé, la persistance SQL ou l’isolation RLS. Le parent intègre les contrôles ordinaires types/lint/build/smoke sur le lot combiné séparément.

Le contrôle n’est pas un verrou du fournisseur : une commande directe `npm run build` le contournerait. Son raccordement local est testé dans la configuration dédiée ; son adoption par un futur projet de preview reste explicite et non effectuée. Aucune configuration du projet existant n’est modifiée ici. Aucune promotion automatique et aucun test v3 ne font partie de cette tranche.

Sources de configuration vérifiées : [buildCommand Vercel](https://vercel.com/docs/project-configuration/vercel-json#buildcommand) et [sélecteur local-config](https://vercel.com/docs/cli/global-options#local-config). La sélection documentée prépare un chemin utilisable, pas une autorisation de déploiement.
