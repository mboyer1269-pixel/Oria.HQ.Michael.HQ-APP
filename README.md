# Oria / Michael HQ

Oria est la plateforme centrale: un assistant personnel et professionnel premium, concu pour comprendre un workspace,
orchestrer Joris et activer des modes metier sans melanger les contextes.

Michael HQ est le premier workspace prive de cette plateforme. Il sert a valider le coeur du produit avec Michael avant
de transformer les apprentissages en offres vendables pour des courtiers immobiliers, conseillers financiers et autres
profils professionnels.

## Vision produit

Le produit n'est pas une app immobiliere, ni un simple generateur de texte. La base cible est:

- un workspace isole par personne, client ou organisation;
- un agent relationnel par defaut, Joris, renommable plus tard par chaque utilisateur;
- des modes de contexte: personnel, professionnel, conseiller financier, immobilier, automobile;
- une memoire et un coffre documentaire par workspace;
- un moteur de permissions avant toute action sensible;
- un journal d'actions pour suivre ce que l'assistant prepare, recommande ou execute;
- des briefs quotidiens orientes priorites, risques, suivis et ROI.

La regle d'architecture: le core reste general. Les expertises de niche vivent dans des modes metier installables, jamais
dans le moteur central.

## Positionnement

- **Nom public provisoire:** Oria
- **Workspace interne:** Michael HQ
- **Agent par defaut:** Joris
- **Premiers modes:** Personnel, Professionnel, Conseiller financier, Immobilier

Le mode conseiller financier doit rester strict: preparation de rendez-vous, suivis, resumes, rappels, contenu educatif,
organisation documentaire et approbation humaine. Il ne doit pas agir comme conseiller financier autonome.

Le mode immobilier peut couvrir les listings, suivis clients, rendez-vous, contenu local, preparation de visites et
workflow courtier, mais il ne doit pas devenir le produit central.

## Stack

- Next.js App Router
- TypeScript strict
- Tailwind CSS
- Supabase Auth/Postgres/RLS
- Claude, OpenAI et Gemini via routeur serveur
- ElevenLabs pour la voix in-app
- Twilio ConversationRelay prevu pour les appels

## Structure

- `src/app`: routes Next.js, API routes et shell applicatif
- `src/features`: modules produit front/back partages par domaine
- `src/server`: logique serveur, Joris, IA, permissions, calendrier, Supabase
- `src/lib`: utilitaires, environnement, clients
- `db`: schema Supabase initial
- `public`: assets PWA

## Prototype actuel

Le prototype valide deja les fondations importantes:

- auth owner-only pour Michael HQ;
- Command Center pour envoyer des commandes a Joris;
- Joris Book pour creer des rendez-vous simples;
- Agenda prive;
- CEO Brief v0;
- Documents / coffre prive;
- contact leads serveur;
- permissions et action ledger;
- routeur de modeles IA.

La prochaine fondation a coder est la couche **Workspace + Mode metier + Agent Profile**. Elle permettra de separer
Michael, Eric, un courtier immobilier et tout futur client sans fuite de contexte.

## Contact et leads

Le formulaire de contact envoie les demandes a `POST /api/contact`. La route valide avec Zod, ecrit dans `contact_leads`
via la cle Supabase service role quand elle est configuree, et retombe sur un stockage local en developpement sinon.

La table `contact_leads` garde RLS active sans politique publique: les leads ne sont pas lisibles ou inserables depuis
le client anon/authenticated.

`CONTACT_NOTIFICATION_EMAIL` prepare le destinataire de notification. Tant qu'aucun provider email n'est branche, la
soumission n'echoue pas et retourne un statut de notification `skipped`.

## Auth privee owner-only

Michael HQ utilise Supabase Auth avec courriel/mot de passe. Les pages privees lisent la session cote serveur avec les
cookies App Router et l'anon key Supabase. La service role key reste reservee aux repositories serveur et ne doit jamais
etre importee par un composant client.

Configuration Supabase:

1. Dans Supabase, activer `Authentication > Providers > Email` avec le mode email/password. Le magic link n'est pas
   requis pour Michael HQ.
2. Creer l'utilisateur proprietaire dans `Authentication > Users`, puis definir un mot de passe fort.
3. Copier l'UUID Supabase de ce user dans `MICHAEL_HQ_OWNER_ID` ou son courriel dans `MICHAEL_HQ_OWNER_EMAIL`.
   `MICHAEL_HQ_OWNER_ID` est le plus strict; le courriel est pratique pour le premier setup.
4. Definir `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` pour la session auth. Garder
   `SUPABASE_SERVICE_ROLE_KEY` cote serveur seulement, pour les taches admin deja existantes.

La checklist complete de branchement reel, incluant `db/schema.sql`, `npm run check:supabase` et les smoke tests RLS,
est dans [`docs/supabase-setup.md`](docs/supabase-setup.md).

Routes protegees:

- `/login`: connexion proprietaire courriel/mot de passe.
- `/hq`: workspace Michael HQ prive.
- `/dashboard/documents`: documents du workspace prive.

## Demarrage

```bash
npm install
npm run dev
```

Copier `.env.example` vers `.env.local`, puis remplir les cles necessaires. Les cles IA restent cote serveur.

## Principes

- Aucune cle API cote client.
- Aucune memoire partagee entre workspaces sans permission explicite.
- Toutes les actions autonomes passent par les permissions.
- Joris parle en francais quebecois canadien par defaut.
- Le modele IA est choisi selon cout, intelligence, quota et impact business.
- Les actions, couts et apprentissages doivent etre journalises.
- Les modes metier ajoutent de l'expertise; ils ne contaminent pas le core.
