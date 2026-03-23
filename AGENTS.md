# AGENTS.md — Instructions pour l'agent Cursor

Ce fichier est lu automatiquement par Cursor. Il définit le contexte, les règles et le plan d'implémentation pour le projet Revue de Presse OLJ.

Voir `CURSOR_AGENT_PROMPT.md` à la racine pour le prompt système complet avec l'architecture, les décisions actées, et le plan phase par phase.

## Règles critiques (toujours actives)

1. Ne jamais modifier : `generator.py`, `editorial_scope.py`, `llm_router.py`, `collector.py`
2. Migrations Alembic additives uniquement — jamais de DROP
3. Tout le frontend en français
4. Italique pour les thèses dans l'UI, guillemets « » dans le texte généré uniquement
5. Tailwind uniquement, rouge OLJ `#c8102e`
6. Types stricts partout — pas de `any` côté TS

## Ordre d'exécution

Phase 1 → modèles + migration
Phase 2 → enrichir traduction (editorial_angle, score persisté)
Phase 3 → route DailyEdition + recherche texte
Phase 4 → normalisation pays
Phase 5 → types TS + API client
Phase 6 → page Édition du jour (LE livrable principal)
Phase 7 → indicateur couverture géographique
Phase 8 → concurrence traduction
Phase 9 → tests
