# Prise en main — développeurs

Ordre de lecture recommandé pour contribuer au dépôt **frontend** + **backend**.

## Lecture minimale

1. [`README.md`](../README.md) à la racine — périmètre du dépôt, installation, conventions.
2. [`docs/README.md`](README.md) — carte de cette documentation.
3. [`docs/plan.md`](plan.md) — backlog technique et produit, ordre de travail suggéré.
4. [`docs/DECISIONS_PO.md`](DECISIONS_PO.md) — décisions tranchées côté produit.
5. [`DESIGN_SYSTEM/README.md`](../DESIGN_SYSTEM/README.md) — design system (tokens, composants).

## Arborescence utile

| Élément | Indication |
|--------|------------|
| Branche de travail courante | souvent `v2/media-watch` |
| Interface production | `frontend/` (Next.js) |
| API | `backend/` (FastAPI) |
| Registre médias validé OLJ | `backend/data/MEDIA_REVUE_REGISTRY.json` (aligné sur le CSV médias revue) |

## Livraison UI

Source de vérité visuelle : **`frontend/src`**, **`frontend/src/app/globals.css`**, **`DESIGN_SYSTEM/`**.

## Flux de travail

- Petits commits ciblés ; vérifier `pytest` côté backend et le build / lint côté frontend selon votre configuration locale.
- Toute évolution majeure du pipeline ou du modèle de données : consigner l’intention dans `docs/plan.md` ou `docs/DECISIONS_PO.md` après validation produit.

---

_Dernière mise à jour : 2026-04-06._
