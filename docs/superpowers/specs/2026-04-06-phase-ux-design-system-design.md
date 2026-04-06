# Spec — Phase post-backend : design system OLJ & navigation temporelle (timeline)

**Date :** 2026-04-06  
**Références :** [docs/COMPOSER2-HANDOFF.md](../../COMPOSER2-HANDOFF.md) §5, §4 ; [DESIGN_SYSTEM/](../../../DESIGN_SYSTEM/) ; prototype [`design/revue-playground/`](../../../design/revue-playground/).

## Principe

Cette phase démarre **après** livraisons backend ciblées des vagues 1–4 (ou parallèle minimal sans bloquer les correctifs données). Elle ne remplace pas les specs backend ; elle **uniformise** l’expérience utilisateur sur tout le site.

## 1. Design system « SOTA » fidèle OLJ

### Objectifs

- **Unifier** : boutons, icônes, tooltips, échelles typographiques, espacements, rayons, bordures, états focus / hover / disabled — style minimaliste « barely there », journalisme, accent `#dd3b31` (tokens `--color-accent` / `accent`).
- **Tokens de contenu** : sortir les textes épars (méta édition, aide, stats, erreurs) vers des constantes ou fichiers de chaînes classifiés, alignés sur `DESIGN_SYSTEM/components.md` et `patterns-pages.md`.
- **Composants** : même langage de composants entre Édition du jour, Articles, Panorama, Rédaction — pas de variantes ad hoc non documentées.

### Livrables

- Mise à jour progressive de `DESIGN_SYSTEM/*.md` pour refléter les décisions figées du prototype.
- Prototype dans [`design/revue-playground/`](../../../design/revue-playground/) validé avant portage vers [`frontend/src/`](../../../frontend/src/).

### Critères d’acceptation

- `npm run typecheck` sur front et playground après portage par bande.
- Aucune régression des règles [AGENTS.md](../../../AGENTS.md) (français UI, Tailwind uniquement, pas de `any`).

## 2. Barre de date / recherche de journée (continuité temporelle)

### Problème actuel

- Rail date perçu comme « bof » : limites nettes entre jours, peu de continuité, faible lisibilité mobile ([handoff §5.2, §5.3](../../COMPOSER2-HANDOFF.md)).

### Direction produit

- Inspiration : affichage **continu** type règle temporelle / playhead (références visuelles partagées par l’équipe : horloge + graduations, ligne « LIVE »), **sans** calendrier à cases comme seul mode.
- Conserver la **vérité métier** : l’édition du jour reste une fenêtre **Asia/Beirut** ; l’UI ne doit pas suggérer une fenêtre UTC identique à l’édition (voir AGENTS.md).

### Périmètre technique (indicatif)

- Fichiers existants à faire évoluer en priorité dans le playground : [`design/revue-playground/src/components/edition/edition-date-rail.tsx`](../../../design/revue-playground/src/components/edition/edition-date-rail.tsx), [`edition-calendar-popover.tsx`](../../../design/revue-playground/src/components/edition/edition-calendar-popover.tsx), [`beirut-date.ts`](../../../design/revue-playground/src/lib/beirut-date.ts).
- Après validation : répliquer le pattern dans [`frontend/src/`](../../../frontend/src/) (chemins miroir à identifier).

### Critères d’acceptation

- Mobile : sélection de date utilisable au pouce, hiérarchie claire (handoff §5.2).
- Texte d’aide court : période couverte (Beyrouth) visible sans mur de `text-[11px]`.

## 3. Ordre de portage recommandé (front)

1. Rail date + méta édition (bandeau collecte).
2. Panorama + clusters (accordéons / disclosure).
3. Édition du jour (deux colonnes + lecteur).
4. Page Articles + filtres sidebar.
5. Rédaction `/compose` et voisins.

Aligné sur [docs/plan.md](../../../plan.md) « Ordre de travail recommandé » et handoff §4.

## Hors-scope

- Refonte backend déclenchée uniquement pour des besoins UI (préférer champs API déjà prévus dans les vagues 1–4).
