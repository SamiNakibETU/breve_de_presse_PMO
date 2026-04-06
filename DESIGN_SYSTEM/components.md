# Composants UI

Liste orientée **média** ; implémentation possible via primitives Tailwind + composants React (Server Components par défaut).

## Navigation

| Composant | Description | Variantes |
|-----------|-------------|-----------|
| **SiteHeader** | Logo, recherche, CTA abonnement, compte | Collapse mobile (menu burger) |
| **RubriquePills** | Fil horizontal de rubriques | État actif, scroll |
| **MegaNav / Drawer** | Arborescence Liban, Monde, Culture, Services… | Panneau latéral ou mega-menu |
| **Footer** | Liens légaux, newsletters, réseaux, autres titres du groupe | Plusieurs colonnes desktop |

## Éditorial

| Composant | Description |
|-----------|-------------|
| **Kicker** | Rubrique au-dessus du titre |
| **ArticleTitle** | H1 + optional chapô |
| **Byline** | Auteur(s), date, temps de lecture |
| **MediaFigure** | Image / vidéo + légende + crédit |
| **ProseArticle** | Corps riche (titres H2/H3, listes, citations) |
| **TagList** | Mots-clés cliquables |
| **RelatedBlock** | « À lire aussi » |
| **LiveTicker** | Bandeau actualisation (direct) |
| **LiveFeed** | Liste chronologique horodatée |
| **FormatBadge** | Préfixe type Éclairage, Reportage, Focus (texte, pas gadget) |

## Conversion & compte

| Composant | Description |
|-----------|-------------|
| **SubscribeCTA** | Bouton discret + variante encart |
| **Paywall** | Message réservé abonnés + lien offre |
| **AuthPanel** | Connexion / inscription / offre essai |

## Utilitaires

| Composant | Description |
|-----------|-------------|
| **SearchField** | Champ recherche header |
| **Pagination** | Index archives |
| **Breadcrumb** | Fil d’ariane (rubrique / sous-rubrique) |

## États interactifs

- **Hover** : soulignement ou léger changement de ton texte ; pas d’animation agressive.
- **Focus** : anneau visible (`focus-visible`) pour clavier.
- **Active (nav)** : accent ou filet sous le lien, pas fond criard.

## Jeux / services (si présents)

- Même grille typographique ; icônes sobres ; pas de style « app arcade ».

## Outil revue de presse (interne) — **référence = production**

La **source de vérité visuelle et comportementale** est le front Next **`frontend/src`** et les utilitaires **`frontend/src/app/globals.css`** (classes `olj-*`). Toute nouvelle page ou composant doit **réutiliser ces classes** avant d’inventer des combinaisons Tailwind ad hoc.

| Classe / composant | Rôle |
|--------------------|------|
| **`olj-btn-primary` / `olj-btn-secondary`** | Seuls styles de CTA principal et secondaire (boutons **et** liens). Ne pas dupliquer `border-accent bg-accent…` ailleurs. |
| **`olj-rubric` / `olj-rule`** | Titres de section discrets ; hiérarchie au-dessus des H1 de page. |
| **`olj-link-action`** | Liens d’action (retour, secondaires). |
| **`olj-kpi-tile`** | Tuiles chiffrées (rédaction, bandeaux). |
| **`EditionMetaStrip`** (`components/edition/edition-meta-strip.tsx`) | Méta édition : fenêtre Beyrouth + corpus + aide repliable. |
| **`StatsDistributionPanels`** (`components/dashboard/stats-distribution-panels.tsx`) | Panorama : pays et langues **visibles en parallèle** (grille 2 colonnes, scroll interne), pas deux `<details>` qui se cachent mutuellement. |
| **`EditionDateRail`** | Rail de dates ; chevrons, calendrier, bandeau collecte sous la piste. |
| **`StatsCards`** | Inventaire 24 h UTC : filets horizontaux, pas cartes multicolores. |
| **Filtres Articles** | Colonne `olj-sidebar-filter` ; `accent-color` OLJ sur cases à cocher. |

**`design/revue-playground`** et **`design/prototype/`** : expérimentation seulement ; **non contractuels** pour la prod. Ne pas y reporter des patterns divergents sans les ramener ensuite dans `globals.css` et le front principal.

Maquette statique historique : `design/prototype/components.css` (préfixe `olj-` aligné sur `globals.css`).

## Classification des textes d’interface (revue interne)

Objectif : éviter les murs de `text-[11px]` sans rôle ; chaque bloc a un **type sémantique** et une échelle typographique documentée.

| Type | Usage | Échelle indicative | Exemple |
|------|--------|-------------------|---------|
| **Rubric** | Titre de section discret | `olj-rubric` + `olj-rule` | « Vue régionale » |
| **Méta primaire** | Donnée métier immédiate | 13–15px serif ou sans, `text-foreground` | Fenêtre Beyrouth dans `EditionMetaStrip` |
| **Méta secondaire** | Compteur ou libellé de colonne | 10–11px uppercase tracking | « Corpus du sommaire » |
| **Aide contextuelle** | Règles métier (UTC vs Beyrouth, vigie) | 11px, `<details>` ou tooltip | Bloc repliable `EditionMetaStrip` |
| **Vigie / global** | Indicateur trans-édition (24 h UTC) | 10px, ton neutre | Ligne sous la méta, pas mélangée au corpus du jour |
| **Voix sujet** | Légende cluster / carte | 10–11px, une phrase fixe | `VOICE_HINTS` dans `cluster-card.tsx` (aligné `TopicSection`) |
| **Action** | CTA | `olj-btn-primary` / `secondary` / `olj-link-action` | « Édition du jour », « Lire » |

Les chaînes **répétées** (voix 1–3, titres de méta) doivent rester **identiques** entre Panorama (`cluster-card`) et édition du jour (`TopicSection` / sommaire) pour éviter la confusion rédactionnelle.
