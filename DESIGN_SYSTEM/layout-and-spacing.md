# Grille, layout, espacement

## Principes

- **Contenu au centre** avec marges latérales généreuses sur grand écran.
- **Une colonne** pour le corps d’article (prose) ; multi-colonnes pour la **une** et les **index** avec hiérarchie claire (module principal vs secondaire).
- **Pas de cartes à tout va** : préférer filets horizontaux fins et espacement pour séparer.

## Largeurs indicatives

| Zone | Largeur max | Note |
|------|-------------|------|
| Prose article | ~ 40 rem | Lisibilité |
| Conteneur global | ~ 72–80 rem | À unifier header / footer / contenu |
| Rail métadonnées (desktop) | Colonne fixe ou fluide | Optionnel, discret |

## Espacement

- Échelle **4 px** (0.25 rem) comme base.
- **Sections** : `space-12` à `space-20` entre modules majeurs sur la home.
- **Dans un module** : `space-4` à `space-8` entre titre et liste.

## Responsive

- **Mobile** : une colonne ; navigation secondaire souvent en **scroll horizontal** pour les rubriques (pattern fréquent médias) — garder la **zone tactile** suffisante.
- **Breakpoints** : à définir dans Tailwind ; tester la une à `md` et `lg` pour passage 1 → 2 → 3 colonnes.

## Filets et séparateurs

- **1 px**, couleur `border`, opacité pleine ou légèrement atténuée.
- Éviter les doubles bordures épaisses et les ombres portées marquées.

## Sticky

- Header ou barre d’outils article : **fond opaque** ou léger flou si besoin, **filet bas** 1 px pour ne pas flotter sans ancrage visuel.
