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
