# Design system — journal (projet média)

Ce dossier documente le **design system** à appliquer au site du journal : principes éditoriaux, fondations (couleur, typo, espacement, grille), composants, patterns de pages, et une **référence d’audit** du site public L’Orient-Le Jour (benchmark, non prescriptif pour les valeurs exactes).

## Fichiers

| Fichier | Contenu |
|--------|---------|
| [principles.md](./principles.md) | Mission, ton, anti-patterns, alignement avec le README racine et `docs/DECISIONS_PO.md` |
| [foundations.md](./foundations.md) | Tokens proposés (CSS variables), échelles, conventions nommage |
| [typography.md](./typography.md) | Hiérarchie éditoriale, rôles sémantiques, règles de composition |
| [color.md](./color.md) | Palette sémantique, états, accent éditorial |
| [layout-and-spacing.md](./layout-and-spacing.md) | Grille, largeurs, rythme vertical, responsive |
| [components.md](./components.md) | Inventaire des composants UI et variantes |
| [patterns-pages.md](./patterns-pages.md) | Types de pages et modules récurrents |
| [olj-reference.md](./olj-reference.md) | Observations sur lorientlejour.com (benchmark) |

## Rapport au code

- Le projet cible **Next.js**, **Tailwind CSS**, **TypeScript** (voir `README.md` à la racine du dépôt).
- Les tokens en `foundations.md` sont pensés pour être mappés dans `tailwind.config` ou `:root` — à valider en implémentation.

## Source de vérité

- **Principes produit** : `README.md`, `docs/plan.md`, `docs/DECISIONS_PO.md`.
- **Valeurs mesurées sur un site tiers** : à compléter par inspection DevTools si besoin (voir `olj-reference.md`).
