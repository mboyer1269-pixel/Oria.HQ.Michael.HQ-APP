# Supabase setup and smoke tests

Cette checklist prépare Michael HQ pour un vrai projet Supabase sans avoir besoin de partager les secrets dans le repo. Garde toutes les valeurs dans `.env.local` et ne les colle jamais dans la documentation, les logs ou les tickets.

## 1. Creer le projet Supabase

1. Creer un nouveau projet dans Supabase.
2. Noter le Project URL et les API keys depuis `Project Settings > API`.
3. Garder trois valeurs pour `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`: Project URL.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: anon/publishable key, utilisee pour les sessions Auth.
   - `SUPABASE_SERVICE_ROLE_KEY`: service role/secret key, serveur seulement.

La service role key bypass RLS. Elle ne doit jamais etre exposee dans un composant client, une variable `NEXT_PUBLIC_*`, une capture d'ecran ou un log.

## 2. Activer Auth email/password

1. Aller dans `Authentication > Providers > Email`.
2. Activer Email.
3. Activer le login email/password.
4. Le magic link n'est pas requis pour ce setup owner-only.
5. En developpement, tu peux desactiver la confirmation email si tu veux valider vite le login. En production, garde une politique explicite avant d'ouvrir l'acces.

## 3. Creer le owner

1. Aller dans `Authentication > Users`.
2. Creer le compte owner avec l'email de Michael.
3. Definir un mot de passe fort.
4. Copier le UUID du user Supabase.
5. Mettre ce UUID dans `MICHAEL_HQ_OWNER_ID`.
6. Mettre aussi l'email normalise dans `MICHAEL_HQ_OWNER_EMAIL` comme garde-fou pratique pendant le premier setup.

`MICHAEL_HQ_OWNER_ID` est la source la plus stricte. Il est aussi necessaire pour que les repositories serveur ecrivent les lignes owner dans `calendar_events`, `action_ledger` et les futures donnees owner-scoped.

## 4. Remplir `.env.local`

Copier `.env.example` vers `.env.local`, puis remplir au minimum:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
MICHAEL_HQ_OWNER_ID=
MICHAEL_HQ_OWNER_EMAIL=
```

Optionnel mais utile pour le formulaire:

```bash
CONTACT_NOTIFICATION_EMAIL=
```

Verifier la presence des variables sans afficher les secrets:

```bash
npm run check:supabase
```

Le script lit `.env.local`, `.env` et l'environnement du process. Il affiche seulement les noms des variables, leur source et les actions manquantes.

## 5. Appliquer le schema

1. Ouvrir `SQL Editor` dans Supabase.
2. Coller le contenu de `db/schema.sql`.
3. Executer le script.
4. Verifier que RLS est active sur:
   - `profiles`
   - `joris_conversations`
   - `joris_messages`
   - `calendar_events`
   - `action_ledger`
   - `joris_memory`
   - `knowledge_items`
   - `opportunities`
   - `documents`
   - `contact_leads`

`contact_leads` n'a volontairement aucune policy publique. Les insertions doivent passer par la route serveur `POST /api/contact`, qui utilise la service role key quand elle est configuree.

## 6. Smoke tests owner/non-owner

Preparer deux comptes Supabase:

- Owner: le user dont le UUID est dans `MICHAEL_HQ_OWNER_ID`.
- Non-owner: un autre user email/password.

Tests app:

1. Demarrer l'app avec `.env.local`.
2. Aller sur `/login`.
3. Se connecter avec le owner.
4. Ouvrir `/dashboard/documents`.
5. Resultat attendu: page accessible, statut de session privee active.
6. Se deconnecter.
7. Se connecter avec le non-owner.
8. Ouvrir `/dashboard/documents`.
9. Resultat attendu: page `Acces refuse`, aucun document affiche.
10. Se deconnecter.
11. Ouvrir `/dashboard/documents` sans session.
12. Resultat attendu: redirection vers `/login`.

## 7. Smoke tests RLS via REST Supabase

Ces tests utilisent les access tokens Supabase des users owner/non-owner. Ne colle pas les tokens dans le repo.

Remplacer les placeholders localement:

```bash
SUPABASE_URL="<project-url>"
SUPABASE_ANON_KEY="<anon-key>"
OWNER_ACCESS_TOKEN="<owner-session-access-token>"
NON_OWNER_ACCESS_TOKEN="<non-owner-session-access-token>"
OWNER_ID="<owner-uuid>"
NON_OWNER_ID="<non-owner-uuid>"
```

Creer des lignes de test dans le SQL Editor:

```sql
insert into public.calendar_events (user_id, title, date_iso, start_time, end_time, source)
values
  ('<OWNER_ID>', 'Smoke owner event', current_date, '09:00', '09:30', 'internal'),
  ('<NON_OWNER_ID>', 'Smoke non-owner event', current_date, '10:00', '10:30', 'internal');

insert into public.documents (user_id, filename, hat, filepath)
values
  ('<OWNER_ID>', 'owner-smoke.md', 'hq', 'docs/hq/owner-smoke.md'),
  ('<NON_OWNER_ID>', 'non-owner-smoke.md', 'hq', 'docs/hq/non-owner-smoke.md');
```

Verifier `calendar_events`:

```bash
curl "$SUPABASE_URL/rest/v1/calendar_events?select=id,title,user_id" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $OWNER_ACCESS_TOKEN"
```

Resultat attendu: le owner voit seulement ses lignes.

```bash
curl "$SUPABASE_URL/rest/v1/calendar_events?select=id,title,user_id" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NON_OWNER_ACCESS_TOKEN"
```

Resultat attendu: le non-owner voit seulement ses lignes, jamais celles du owner.

Verifier `documents` avec la meme logique:

```bash
curl "$SUPABASE_URL/rest/v1/documents?select=id,filename,user_id" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $OWNER_ACCESS_TOKEN"
```

Resultat attendu: le owner voit seulement ses documents. Le non-owner ne voit jamais les documents du owner.

Verifier `contact_leads`:

```bash
curl "$SUPABASE_URL/rest/v1/contact_leads?select=id" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $OWNER_ACCESS_TOKEN"
```

Resultat attendu: aucune ligne retournee ou refus RLS. Les leads ne sont pas lisibles via client anon/authenticated.

Tester une insertion directe anon/authenticated:

```bash
curl "$SUPABASE_URL/rest/v1/contact_leads" \
  -X POST \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $OWNER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test","email":"smoke@example.com","message":"Message de smoke test direct RLS"}'
```

Resultat attendu: insertion refusee par RLS.

## 8. Smoke tests app data

Calendrier:

1. Avec `MICHAEL_HQ_OWNER_ID` et `SUPABASE_SERVICE_ROLE_KEY` presents, creer un evenement via le flux Joris ou `POST /api/calendar/events`.
2. Resultat attendu de l'API: `event.storageMode` vaut `supabase`.
3. Verifier dans Supabase que la ligne existe dans `calendar_events` avec `user_id = MICHAEL_HQ_OWNER_ID`.
4. Appeler `GET /api/calendar/events?limit=8`.
5. Resultat attendu: l'evenement est retourne et l'UI affiche `Supabase`.

Contact:

1. Soumettre le formulaire Oria.
2. Resultat attendu: reponse `201`, `storageMode` vaut `supabase`.
3. Verifier dans Supabase que la ligne existe dans `contact_leads`.
4. Verifier via REST anon/authenticated que la table reste illisible et non inserable directement.

Documents:

1. Verifier d'abord l'auth owner/non-owner sur `/dashboard/documents`.
2. Verifier ensuite RLS sur la table `documents` via REST comme dans la section RLS.
3. Note actuelle: `db/documents.json` est une fixture **dev/test uniquement** (lue par le brief CEO via `document-index.ts`, **fail-closed en prod** — cf. `src/server/documents/file-document-store-guard.ts`). La page `/dashboard/documents` ne lit plus le fichier. La table `documents` est prete cote schema/RLS; plan de migration: `docs/migrations/documents-file-store-to-db.md`.

## 9. Checklist de passage au reel

- [ ] Projet Supabase cree.
- [ ] Email provider active.
- [ ] Owner email/password cree.
- [ ] `MICHAEL_HQ_OWNER_ID` copie depuis Auth user UUID.
- [ ] `.env.local` rempli sans secrets commites.
- [ ] `npm run check:supabase` passe.
- [ ] `db/schema.sql` applique.
- [ ] Owner peut ouvrir `/dashboard/documents`.
- [ ] Non-owner recoit `Acces refuse`.
- [ ] Session absente redirige vers `/login`.
- [ ] `calendar_events` ecrit et lit en mode Supabase.
- [ ] `contact_leads` accepte seulement les insertions serveur.
- [ ] `documents` isole les lignes par `user_id` via RLS.
