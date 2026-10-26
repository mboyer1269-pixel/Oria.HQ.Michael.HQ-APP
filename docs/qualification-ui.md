# Qualification UI locale complémentaire — création idempotente

Le banc monte les vrais `AgentCard`, `AgentNameEditor` et `EmployeeTeam` dans Vite, avec transport synthétique intercepté par Playwright. Il ne lance pas la page Next.js authentifiée et ne remplace aucune garde dans le produit.

## Exécution

```sh
node scripts/qualification-ui/run.mjs
node --test src/features/employees/create-intention.test.mjs
```

Node 22.23.4 a été utilisé. Le banc utilise Chromium `/usr/bin/chromium` et Playwright préinstallé `/opt/codex/cua_node/lib/node_modules/playwright`. Les variables `QUALIFICATION_CHROMIUM` et `QUALIFICATION_PLAYWRIGHT_MODULE` peuvent désigner d'autres installations existantes. Aucun téléchargement automatique. Port local fixe 3128 ; échec s'il est occupé. `QUALIFICATION_UI_OUTPUT` sélectionne le dossier des preuves (défaut `/workspace/oria-idempotency-evidence/ui`). Vite ne charge pas les fichiers d’environnement (`envDir: false`). Les requêtes navigateur hors origine locale sont bloquées. Sans `?qualification=synthetic`, les composants et le transport de test ne démarrent pas.

## Contrat de reprise

La création transmet `creationKey` UUIDv4 et les cinq champs normalisés. Avant tout envoi, le composant conserve cette clé et le contenu initial dans `sessionStorage`, sous une clé séparant propriétaire/workspace/business. Ces trois références viennent de la page serveur pour la récupération d'affichage ; elles ne sont pas transmises comme autorité aux actions métier. L'action continue à dériver et vérifier son propre périmètre côté serveur.

Après résultat incertain, les champs restent figés, une relecture n'envoie rien et annuler l'affichage conserve l'intention : le bouton suivant reprend celle-ci. Rechargement ou retour dans le même périmètre restaurent l'intention sans envoi automatique. Une reprise manuelle réutilise exactement la clé et le contenu initial. La protection contre deux événements synchrones utilise un verrou immédiat et la conservation locale refuse d'écraser une autre intention non résolue. La vraie idempotence demeure celle du repository/contrainte SQL, pas de ce verrou UI.

Une confirmation du serveur permet d'effacer la récupération. Si cet effacement échoue, le profil est affiché mais les nouvelles créations sont bloquées explicitement. Le bouton « Terminer le nettoyage local » permet de réessayer cet effacement sans nouvel appel de création. Une nouvelle intention légitime après confirmation reçoit une nouvelle clé. Au-delà de 24 heures, le record valide est restauré avec avertissement et reprise manuelle explicite, conservant clé et contenu initial. Cette ancienneté concerne uniquement une intention de profil, jamais une autorisation d’exécution. Un record futur ou malformé reste bloqué, jamais effacé automatiquement avec génération d'une nouvelle clé. Une panne de stockage avant envoi bloque l'action.

## Preuves

Quinze scénarios sur les composants réels (résultats détaillés dans `results.json`), couvrant :

1. Opt-in absent : zéro appel au transport synthétique.
2. Nom écrit puis accusé perdu : relecture explicite sans renvoi, ID historique conservé.
3. Création écrite puis accusé perdu : champs figés, lecture échouée puis réussie, annulation/réouverture conservant l'intention.
4. Reload suivi de deux événements de soumission synchrones : exactement une reprise manuelle avec même clé/contenu, une seule ligne synthétique et le même ID.
5. Renommage employé et sortie/réentrée dans les périmètres composites A/B : IDs conservés, absence de fuite d'affichage A vers B.
6. Archivage avec accusé perdu, relecture et reload : ligne archivée conservée, édition absente, un seul envoi d'archivage.
7. Nouvelle intention explicite après confirmation : clé et ID distincts, même nom autorisé.
8. Refus d'écriture de récupération navigateur : aucun appel de création, aucune nouvelle ligne.
9. Clavier : ouverture, annulation et retour au bouton ; validation récupérable avant stockage ; édition sans UUID.
10. Intention âgée de 25 heures après accusé perdu : reprise explicite de la même clé et du contenu initial, aucun envoi automatique.
11. Nettoyage local échoué après confirmation puis réessayé : aucun renvoi serveur.
12. Unicode : 81 emoji refusés avant stockage/envoi, 80 conservés intégralement ; archivage confirmé : focus sur le titre conservé.

Les tests du helper couvrent séparément chaque axe du périmètre, non-écrasement de l'intention, validation des champs/clé et reprise après 24 heures, échec lecture/écriture/nettoyage. Les tests du service/repository sont documentés séparément : le transport de ce banc reproduit leur contrat mais ne les remplace pas comme preuve serveur.

`results.json` contient SHA de base, branche, runtime et empreintes des composants ainsi que les appels synthétiques. Captures 375/390/425/768/1024/1440 pixels étiquetées comme qualification ; styles minimaux de fixture, pas rendu final du cockpit. Aucun cookie, token ni Authstate n'est enregistré.

## Limites

L'état des réponses appartient au processus de test et disparaît à son arrêt. Il ne prouve ni DB, ni RLS, ni Auth, ni concurrence PostgreSQL. Le scénario A/B change propriétaire, workspace et business ensemble : isolation d'affichage composite, pas preuve d'autorisation serveur de chaque axe. Le banc n'exécute aucun SQL et n'active aucun flag produit.

La récupération navigateur n'est pas un stockage de profils durable : elle ne survit pas nécessairement à la fermeture de l'onglet, à la suppression manuelle du stockage ou à un nouvel appareil. Il faut alors rapprocher l'équipe côté serveur avant d'initier une nouvelle création ; deux clés indépendantes représentent deux intentions et peuvent créer deux profils. Les champs de la proposition sont conservés dans cet onglet ; n'y mettre aucun secret. Les flags restent fermés tant que la vraie persistance n'est pas qualifiée.
