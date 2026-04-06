# Onboarding — agents & développeurs

Complète **`AGENTS.md`** (règles projet, lu par Cursor) et **`docs/plan.md`** (backlog backend, diagnostic pipeline).

## Lecture minimale

1. `docs/README.md` — carte du dossier `docs/` (fichiers conservés vs archive locale).
2. `AGENTS.md` — contraintes (fichiers interdits, migrations, temporalités Beyrouth vs UTC, registre médias revue).
3. `docs/plan.md` — phases livraison, analyse d’articles, pays, embeddings, perf, sessions journalistes.
4. `docs/superpowers/specs/README.md` — index des specs techniques (vagues backend + phase UX / design system).
5. `DESIGN_SYSTEM/README.md` — tokens et composants éditoriaux.

## Dépôt (à vérifier avec `git`)

| Élément | Indication |
|--------|------------|
| Branche de travail courante | souvent `v2/media-watch` |
| Front production | `frontend/` (Next.js, UI en français) |
| Backend | `backend/` (FastAPI) |
| Registre médias validé OLJ | `backend/data/MEDIA_REVUE_REGISTRY.json` ← CSV « media revue - Sheet1.csv » |
| Prototype UI non contractuel | `design/revue-playground/` (voir son `README.md`) |

## Livraison UI

Référence visuelle : **`frontend/src`** + **`frontend/src/app/globals.css`** (`olj-*`) + **`DESIGN_SYSTEM/`**. Le playground sert d’expérimentation ; ce qui est validé y est **reporté** en prod et dans la doc design system.

## Flux idées → implémentation

Pour un cadrage structuré avant code : skill **superpowers brainstorming** (la commande `/brainstorm` Cursor est dépréciée).

## Prompt court (nouvelle conversation)

```
Tu reprends le projet Revue de presse OLJ. Lis AGENTS.md, docs/ONBOARDING.md et docs/plan.md.

Mission : itérer sur l’UI dans frontend/src + DESIGN_SYSTEM/ (prototype design/revue-playground si besoin), design system unifié OLJ, mobile-first : rail date, méta édition, panorama, édition du jour, page Articles, lecteur article.

Backend : suivre docs/plan.md ; pas de gros chantier sans validation UI sauf correctifs bloquants.

Règles : ne pas modifier generator.py, editorial_scope.py, llm_router.py, collector.py ; migrations additives ; Tailwind + accent #dd3b31 ; TS strict ; UI en français.

Itération : petits commits, tests utilisateur entre les pushes.
```

---

_Dernière mise à jour : 2026-04-06 — remplace l’ancien handoff « Composer 2 » (archivé localement sous `archive/docs-residues-2026-04-06/`)._
