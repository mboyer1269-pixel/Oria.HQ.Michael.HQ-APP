---
name: Multi-Agent Orchestration
description: >
  Modèle et bonnes pratiques pour orchestrer des workflows multi-agents
  (Cursor + MCP). Contient des rôles, des étapes, des prompts exemples
  et des contrôles de qualité pour produire des `SKILL.md` reproductibles.
---

# Multi-Agent Orchestration

## Objectif
Fournir un template réutilisable pour organiser des workflows impliquant plusieurs
agents nommés (lead, researcher, designer, writer, reviewer) et pour exécuter
ces workflows depuis Cursor (Agent Mode) via un serveur MCP.

## Quand l'utiliser
- Conversion d'un workflow multi-étapes en skill automatisable.
- Création de SKILL.md qui nécessitent recherches, conception, rédaction et revue.
- Mise en place d'un pipeline exécutable depuis Cursor avec handoffs explicites.

## Intégration Cursor / MCP
- Ajouter un fichier `.cursor/mcp.json` à la racine du repo qui référence
  le serveur MCP local (ex : `node ./bin/cli.js mcp start`).
- S'assurer que Cursor reçoit les variables d'environnement requises
  (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).
- Tester la connectivité en démarrant le MCP et en vérifiant que Cursor
  voit le serveur avant d'exécuter le workflow.

## Rôles recommandés
- `lead` / `orchestrator`: définit l'objectif, les critères de succès et publie.
- `researcher`: collecte contexte, conventions, exemples dans le repo.
- `designer`: produit l'outline du skill (`frontmatter`, sections, prompts).
- `writer`: rédige le `SKILL.md` complet à partir de l'outline.
- `reviewer`: vérifie la conformité, formatting et compatibilité Cursor.

## Étapes d'orchestration
1. `lead` : fournis l'objectif, le scope et un exemple de résultat attendu.
2. `researcher` : retourne un résumé structuré (conventions, chemins, exemples).
3. `designer` : produit un outline avec sections et checklist.
4. `writer` : rédige le draft complet de `SKILL.md`.
5. `reviewer` : valide et renvoie des corrections ou approuve.
6. `lead` : publie la version finale et ajoute instructions pour Cursor.

## Checklist
- Frontmatter `name` et `description` présents
- Sections Quick Start, Examples, Checklist incluses
- Références Cursor/MCP présentes si exécutable depuis l'éditeur

---
