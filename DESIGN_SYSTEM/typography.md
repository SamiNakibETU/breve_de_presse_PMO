# Typographie

## Rôles

| Rôle | Usage | Sémantique HTML | Police suggérée |
|------|--------|-----------------|-----------------|
| **Marque / une** | Logo, très grands titres de une | Selon composant | **Serif** (display) |
| **Titre article** | H1 page article | `h1` | Serif display |
| **Titre de liste** | Cartes fil, listes rubrique | `h2` ou `h3` | Serif ou sans selon densité |
| **Intertitre** | Corps long | `h2`, `h3` | Sans body, graisse moyenne à forte |
| **Chapô** | Sous-titre sous H1 | `p.deck` ou `p.lead` | Sans, taille `lg`–`xl` |
| **Rubrique / kicker** | Fil d’info au-dessus du titre | `p` ou `span` | Sans, **petites caps** ou uppercase tracking léger, couleur secondaire |
| **Métadonnées** | Date, auteur, temps de lecture | `time`, `address`, `p` | Sans `sm`, couleur tertiaire |
| **Corps** | Article | `p` | Sans `base`–`lg`, interligne confortable |
| **Légende** | Sous média | `figcaption` | Sans `xs`–`sm`, couleur secondaire |
| **Citation** | Tirage de citation | `blockquote` | Serif ou italique body |
| **Label UI** | Boutons, filtres | `span`, `label` | Sans `xs`–`sm` |

## Hiérarchie éditoriale

- **Un seul `h1`** par page article.
- Les **intertitres** dans le corps ne sautent pas de niveaux incohérents (éviter `h4` sous `h1` sans `h2`/`h3` intermédiaires si la structure le permet).
- **Kicker + titre + chapô** : espacement vertical net ; le kicker plus serré vers le titre que le chapô vers le corps.

## Rythme

- **Longues lectures** : interligne relâché (`leading-relaxed`), longueur de ligne ciblée (~ 65–75 caractères) via `max-width` sur le bloc prose.
- **Listes d’articles** : lignes plus serrées, taille intermédiaire pour scanner.

## Oppositions (produit vs benchmark OLJ)

- **Projet** : privilégier **sobriété** et **peu de graisses** ; accent par la taille et le blanc, pas par trois graisses différentes sur la même ligne.
- **OLJ (référence)** : mélange serif titre / sans UI observé sur mobile — voir `olj-reference.md`.

## Chiffres et tableaux

- Préférer **tabular nums** (`font-variant-numeric: tabular-nums`) pour colonnes de chiffres alignés.
