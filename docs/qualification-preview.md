# Preview de qualification : garde de build locale

Ce point d’entrée est **opt-in**, ne remplace pas `npm run build` et n’a été raccordé à aucun hébergement. Il ne déploie rien, ne configure aucun secret, n’applique aucune migration et n’active aucun profil ni permission d’exécution.

## Commandes

```sh
node scripts/qualification-preview.mjs --check
node scripts/qualification-preview.mjs --build
node --test scripts/qualification-preview.test.mjs
```

L’environnement de build doit être fourni par une procédure sécurisée approuvée séparément. Le script ne charge aucun fichier `.env` et refuse la présence des quatre fichiers que Next charge en mode production (`.env`, `.env.local`, `.env.production`, `.env.production.local`). Il n’en lit pas le contenu. Ne pas supprimer automatiquement des fichiers pour passer cette garde : préparer une copie de build isolée.

Le contrôle exige `NEXT_PUBLIC_SUPABASE_URL=https://teatqbtzgzcygpefnfbh.supabase.co`. Cette référence publique correspond au staging identifié, pas à une clé. Les références et URL Supabase alternatives reconnues doivent être cohérentes. Une URL production, un hôte ressemblant, un chemin supplémentaire ou des identifiants dans l’URL sont refusés. Les cibles Vercel renseignées doivent être `preview`.

Les paramètres connus de fournisseurs, exécution, webhooks, facturation, envoi et connexion SQL directe sont refusés. Les clés Supabase ne sont ni affichées ni authentifiées par le script : **le contrôle d’URL ne prouve pas leur appartenance au staging**. La provenance de chaque secret devra être qualifiée séparément, avant toute utilisation distante. Cette liste de paramètres est une défense de configuration, pas un bac à sable réseau ni une garantie d’absence de tout nouveau connecteur.

Les deux implémentations de flags doivent rester exactement fermées : `AGENT_DISPLAY_NAMES_LIVE = false` et `EMPLOYEE_DIRECTORY_LIVE = false`. Aucune variable d’environnement ne les ouvre. Le build produit donc encore une interface de fonctionnalités indisponibles tant que la qualification de persistance et l’ouverture explicite n’ont pas été approuvées. Un profil de présentation ne devient jamais une autorisation d’exécuter.

`--check` ne lance pas de build. `--build` contrôle d’abord, puis exécute une seule fois le `npm run build` existant, avec `NODE_ENV=production` (mode d’optimisation Next, **pas la cible Supabase**). Son code d’échec est conservé ; une interruption échoue aussi. Aucun retry automatique.

## Artefact limité à sa cible

Les variables `NEXT_PUBLIC_*` sont incorporées au bundle pendant le build. **Ne jamais promouvoir cet artefact staging comme artefact de production** : changer les variables au runtime ne remplace pas les valeurs déjà compilées. Toute autre cible demande un build distinct et sa propre validation. La présente garde refuse la cible production et n’est pas destinée à ce futur build.

Références officielles : [variables Next.js](https://nextjs.org/docs/app/guides/environment-variables) et [promotion Vercel](https://vercel.com/docs/deployments/promoting-a-deployment). Ce document ne met en place aucune commande de promotion.

## Niveau de preuve

Les tests locaux utilisent des paramètres synthétiques, les vrais fichiers de flags et un processus de build substitué pour vérifier son admission et la propagation d’erreurs. Ils prouvent le comportement de la garde, pas un déploiement, un login Auth, une appartenance réelle de clé, la persistance SQL ou l’isolation RLS. Le parent intègre les contrôles ordinaires types/lint/build/smoke sur le lot combiné séparément.

Le contrôle n’est pas un verrou du fournisseur : une commande directe `npm run build` le contournerait. Son raccordement à une future preview dédiée devra être explicite et revu ; aucune configuration du projet existant n’est modifiée ici. Aucune promotion automatique et aucun test v3 ne font partie de cette tranche.
