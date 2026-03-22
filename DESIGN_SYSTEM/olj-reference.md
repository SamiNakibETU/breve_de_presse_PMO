# Référence — observations L’Orient-Le Jour (lorientlejour.com)

Document de **benchmark** : observations issues d’un audit navigateur (session 2025–2026). **Ne pas** traiter ces valeurs comme des tokens officiels du présent dépôt — les valider par DevTools si vous calquez dessus.

## Pages effectivement inspectées

- `https://www.lorientlejour.com/` (homepage)
- `https://www.lorientlejour.com/article/1465593/...html` (article)
- `https://www.lorientlejour.com/boutique/` (abonnement)

Certaines routes n’avaient pas rendu dans l’environnement d’audit (erreur minimale) : à revérifier en local (ex. rubrique, recherche dédiée, direct URL seul).

## Patterns UI observés (qualitatif)

- **Header** : logo serif, CTA **« Je m’abonne »** fond jaune/doré, compte, recherche.
- **Fil mobile** : **pills** horizontales scrollables (**Dernières infos**, **Liban**, **Monde**, **Économie**…).
- **Une** : grande image, badge **DIRECT** rouge sur l’actu live, titre très visible.
- **Bandeau** type « En ce moment » avec sujets défilants et flèches.
- **Article** : kicker type « ÉCONOMIE - CONJONCTURE », titre serif large, chapô sans-serif, signature **OLJ / Par [auteur], le [date]**, intertitres H2, **paywall** avec titres marketing (réservé abonnés, offres).
- **Boutique** : H1 argumentaire, cartes d’offres (annuel, mensuel promo, 2 ans), liste d’avantages, contact, réseaux sociaux listés.

## Hiérarchie sémantique (accessibilité)

- Article : **H3** rubrique, **H1** titre, **H2** intertitres, **H4** blocs conversion / paywall.
- Homepage : **H2** titres de modules / une ; **H3** lignes de direct horodatées.

## Signaux éditoriaux textuels

Préfixes fréquents dans les titres de liens : **Éclairage**, **Récit**, **REPORTAGE**, **Focus**, **Commentaire**, **EN DIRECT**.

## Pied de page (boutique)

Mention de partenaires techniques : **Design Datagif**, **développement WhiteBeard**, **SEO Foxglove** ; copyright **© 2022** (vérifier à jour en production).

## Limites techniques pour un export « design tokens »

- Le HTML statique peut être derrière **Cloudflare** ; extraction CSS complète nécessite un navigateur avec session valide et inspection des feuilles chargées.

## Utilisation pour ce projet

S’en inspirer pour **hiérarchie**, **modules** (direct, une, paywall), **ton conversion** — tout en appliquant les **principes** de `principles.md` et `AGENTS.md` (interface plus invisible, moins « carte SaaS » que beaucoup de sites d’actualité).
