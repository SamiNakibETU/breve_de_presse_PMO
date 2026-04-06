# Documentation produit (dépôt)

Ce dossier est volontairement **réduit** : backlog, médias validés, périmètre légal, specs de livraison, décisions PO.

| Fichier / dossier | Rôle |
|-------------------|------|
| [`plan.md`](plan.md) | Backlog backend & produit (analyse LLM, pays, corps, pipeline, perf, sessions journalistes). |
| [`ONBOARDING.md`](ONBOARDING.md) | Entrée agents / prompt court. |
| [`DECISIONS_PO.md`](DECISIONS_PO.md) | Décisions architecture & produit synthétiques. |
| [`MEMW_LEGITIMATE_SCRAPING_SCOPE.md`](MEMW_LEGITIMATE_SCRAPING_SCOPE.md) | Périmètre légal / technique de la collecte (référencé par `AGENTS.md`). |
| [`MEDIA_REVUE.md`](MEDIA_REVUE.md) | Registre revue, API santé, réconciliation CSV ↔ base. |
| [`MEDIA_SOURCE_CSV.md`](MEDIA_SOURCE_CSV.md) | Import CSV, scripts, chemin canonique du fichier médias. |
| [`superpowers/specs/`](superpowers/specs/README.md) | Specs techniques par vagues (backend + phase UX / design system). |

## Hors dépôt (copie locale)

Les **runbooks**, guides déploiement Railway/Docker, SLO, recette staging, playbooks remédiation détaillés et variantes MEMW ont été déplacés en copie sous :

`archive/docs-ops-2026-04-06/`

Ce dossier `archive/` est **ignoré par git** (voir `.gitignore`) : chaque poste peut garder sa copie sans alourdir le dépôt. Pour réintroduire un fichier dans git, le déplacer ici et faire un commit ciblé.
