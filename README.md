# Michael HQ

HQ personnel de Michael avec Joris, un bras droit IA entrepreneurial, mobile-first, vocal, fr-CA et construit autour d'une architecture backend solide.

## Stack

- Next.js App Router
- TypeScript strict
- Tailwind CSS
- Supabase Auth/Postgres/RLS
- Claude Sonnet 4.6, ChatGPT/OpenAI et Gemini via routeur serveur
- ElevenLabs pour la voix in-app
- Twilio ConversationRelay prévu pour les appels

## Structure

- `src/app`: routes Next.js, API routes et shell applicatif
- `src/features`: modules produit front/back partagés par domaine
- `src/server`: logique serveur, Joris, IA, permissions, calendrier, Supabase
- `src/lib`: utilitaires, environnement, clients
- `db`: schéma Supabase initial
- `public`: assets PWA

## Contact Suivia

Le formulaire Suivia envoie les demandes à `POST /api/contact`. La route valide avec Zod, écrit dans `contact_leads`
via la clé Supabase service role quand elle est configurée, et retombe sur un stockage local en développement sinon.
La table `contact_leads` garde RLS activé sans politique publique: les leads ne sont pas lisibles ou insérables depuis
le client anon/authenticated.

`CONTACT_NOTIFICATION_EMAIL` prépare le destinataire de notification. Tant qu'aucun provider email n'est branché, la
soumission n'échoue pas et retourne un statut de notification `skipped`.

## Auth privée owner-only

Le HQ privé utilise Supabase Auth avec courriel/mot de passe. Les pages privées lisent la session côté serveur avec les
cookies App Router et l'anon key Supabase. La service role key reste réservée aux repositories serveur et ne doit jamais
être importée par un composant client.

Configuration Supabase:

1. Dans Supabase, activer `Authentication > Providers > Email` avec le mode email/password. Le magic link n'est pas
   requis pour Michael HQ.
2. Créer l'utilisateur propriétaire dans `Authentication > Users`, puis définir un mot de passe fort.
3. Copier l'UUID Supabase de ce user dans `MICHAEL_HQ_OWNER_ID` ou son courriel dans `MICHAEL_HQ_OWNER_EMAIL`.
   `MICHAEL_HQ_OWNER_ID` est le plus strict; le courriel est pratique pour le premier setup.
4. Définir `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` pour la session auth. Garder
   `SUPABASE_SERVICE_ROLE_KEY` côté serveur seulement, pour les tâches admin déjà existantes.

La checklist complète de branchement réel, incluant `db/schema.sql`, `npm run check:supabase` et les smoke tests RLS,
est dans [`docs/supabase-setup.md`](docs/supabase-setup.md).

Routes protégées:

- `/login`: connexion propriétaire courriel/mot de passe.
- `/dashboard/documents`: redirige vers `/login` si aucune session n'existe; affiche un refus si la session n'appartient
  pas au owner; affiche les documents si le owner est authentifié.

## Démarrage

```bash
npm install
npm run dev
```

Copier `.env.example` vers `.env.local`, puis remplir les clés nécessaires. Les clés IA restent côté serveur.

## Principes

- Aucune clé API côté client.
- Toutes les actions autonomes passent par les permissions.
- Joris parle en français québécois canadien par défaut.
- Le modèle IA est choisi selon coût, intelligence, quota et impact business.
- Les actions, coûts et apprentissages doivent être journalisés.
