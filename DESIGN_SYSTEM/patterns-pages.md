# Patterns de pages

## Accueil / une

**Objectifs** : informer vite, montrer la hiérarchie du jour, orienter vers rubriques et conversion.

**Modules typiques** (à composer sans surcharger) :

- Bandeau **direct** ou sujets du moment
- **Une** principale (image + titre + format)
- Grille ou liste de **secondaires**
- Bloc **opinion** ou éditorial
- Entrées **services** (newsletter, PDF, WhatsApp) — discret
- **Publicité** : emplacement identifié, ne pas confondre avec éditorial

## Article

**Ordre logique** :

1. Header global
2. Kicker / rubrique
3. Titre (H1)
4. Chapô
5. Byline + date
6. Média principal + légende
7. Corps (prose)
8. Tags
9. Commentaires (si activé)
10. Lies / recommandations
11. Paywall ou CTA si modèle freemium

## Direct / briefing

- Fil **chrono** avec heure clairement lisible
- Titre du direct en tête de module
- Distinction visuelle **live** réservée à ce contexte

## Index / archive / rubrique

- Filtres **discrets** (pas tableau de bord)
- Liste dense mais typographiquement lisible
- Pagination ou chargement explicite

## Conversion (abonnement)

- **Argument** éditorial (indépendance, qualité)
- Offres avec **prix et conditions** lisibles
- Contact humain (email, téléphone) si pertinent
- Liens légaux et confiance

## Dossier / série

- Page hub avec **introduction** puis liste d’articles liés
- Navigation latérale ou sommaire léger si long

## Outil revue — édition du jour (sommaire)

- **En-tête** : rubrique « Édition », titre date, **rail de dates** en pleine largeur sous le titre (scroll horizontal mobile).
- **Contexte temporel** : bandeau « fenêtre de collecte » **sous la piste** dans le même cadre que le rail (lisibilité mobile) + **MetaStrip** (période compacte + corpus + aide repliable + vigie 24 h UTC dans `<details>`).
- **Grands sujets** : grille deux colonnes desktop — synthèse éditoriale (titre sujet, points numérotés) | colonne droite par **pays** (max 2 cartes par pays en sommaire, lien « + N textes »). **Bloc contrasté** sous la synthèse : jusqu’à **3 regards** (un par pays différent) avec extrait de thèse + actions **Lire** / **Source** pour éviter de n’avoir que le lien « Voir le détail ».
- **Hiérarchie** : les points saillants du sujet utilisent une liste numérotée unique, `break-inside: avoid` sur les items pour limiter les coupures disgracieuses.

## Outil revue — Panorama

- **Inventaire** en grille sobre (filets 1 px), pas de cartes ombrées multiples.
- **Répartitions** (pays, langue) : deux panneaux **toujours visibles** côte à côte (desktop) avec scroll interne ; sur mobile, **empiler** en une colonne — éviter l’accordéon exclusif qui masque l’un ou l’autre.

## Outil revue — Édition (sommaire)

- **Meta** : grille sémantique — fenêtre Beyrouth (libellé court) | corpus du sommaire (compteurs) ; aide longue et vigie 24 h UTC dans un `<details>`.
- **Rail date** : pastilles avec **zone tactile** confortable sur mobile (`min-height` / `py` renforcés).
- **Avant les listes** : encart « Lecture du sommaire » (2 colonnes) expliquant **grands sujets** vs **regroupements** et le rôle des coches.

## Outil revue — Articles (exploration)

- **Header** : titre + MetaStrip court ; explications longues en panneau repliable **« Comprendre les vues »** ; filtres pays alignés sur les **codes ISO** et libellés FR renvoyés par l’API (`country_labels_fr`).
- **Layout** : filtres en colonne sticky desktop ; **au-dessus du contenu** sur mobile (ou drawer ultérieur si validé).
- **Champ date** : wrapper stylé (bordure, focus accent), pas seul `input` navigateur nu dans un bloc de texte.

## Outil revue — fiche / modal lecture

- Onglets : Analyse | Synthèse | Corps | Source.
- **Analyse** : contexte factuel, thèse en italique serif, idées majeures en liste ordonnée **sans** glyphe secondaire (• / ◇) ni numérotation redondante dans le texte LLM.
- **Métadonnées LLM** (tonalité, fait/opinion, cadrage) : ligne fine ou bloc repliable sous l’analyse, pas alarme visuelle.
- **Corps** : paragraphes séparés (prose) ; drop cap optionnel ; aligner le rendu sur la normalisation du texte traduit (voir `docs/plan.md`).

Maquettes de référence : `design/prototype/*.html`.
