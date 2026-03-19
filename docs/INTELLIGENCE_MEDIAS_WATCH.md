# Pistes — intelligence (embeddings, clustering, UX)

## Hiérarchie à trois niveaux (macro → sous-sujets → « sujets ») : utile ?

**Oui, l’intérêt est réel** si l’objectif est la **lecture éditoriale** (« guerre en Iran » → « frappes sur X » → angles par pays / tribunes), pas seulement un mur de cartes.

| Niveau | Rôle | Exemple |
|--------|------|---------|
| **Macro** | Thème dominant sur 24–72 h | Crise Iran — États-Unis |
| **Meso** | Sous-faits ou fils d’actu | Frappes, sanctions, diplomatie |
| **Micro** | Cluster actuel (ou article) | Avis qatari vs saoudien, éditorial israélien |

**Coûts** : modèle de données (ex. `parent_cluster_id` ou table `topic_themes`), **deux passes** de clustering ou un **classifieur** (LLM / embedding) qui assigne chaque cluster micro à un macro, plus complexité UX (fil d’Ariane, replis).

**Recommandation** : commencer par **macro auto** (étiquette LLM + regroupement sémantique des libellés existants) **sans** refaire tout le pipeline ; si ça tient, ajouter le niveau meso. Éviter trois niveaux entièrement « unsupervised » sans contrainte, sinon risque de hiérarchies **arbitraires**.

---

## Implémenté dans le code (2026-03)

- **`src/services/editorial_scope.py`** : blocklist lifestyle / voyage / sport-spectacle ; signaux géopolitiques sans faux positifs « war » / « award » ; pays seuls (Turquie, Qatar…) **insuffisants** sans thème crise.
- **Collecte RSS** : même sur flux *opinion*, exclusion lifestyle ; corps d’article re-vérifié après extraction.
- **Web + Playwright** : même filtre sur titre + corps ; stats `total_filtered` remontées au dashboard.
- **Embeddings** : par défaut seulement types `opinion`, `editorial`, `tribune`, `analysis` (`EMBED_ONLY_EDITORIAL_TYPES=true`).
- **Clustering** : fenêtre **48 h** (`CLUSTERING_WINDOW_HOURS`), HDBSCAN `min_cluster_size=6`, `min_samples=5`, **sous-clustering** si un bloc > 72 articles (`CLUSTER_REFINEMENT_MAX_SIZE`).

Variables d’environnement (optionnel) : `CLUSTERING_WINDOW_HOURS`, `CLUSTER_ONLY_EDITORIAL_TYPES`, `CLUSTER_REFINEMENT_MAX_SIZE`, `EMBED_ONLY_EDITORIAL_TYPES`, `HDBSCAN_MIN_CLUSTER_SIZE`, `HDBSCAN_MIN_SAMPLES`.

---

## Données amont (impact maximal)

- **Filtrer à la source** : ne clusteriser que les articles `article_type` ∈ opinion / éditorial / tribune / analyse (déjà partiellement côté UI articles).
- **Dédoublonnage** avant embedding : même histoire reprise par plusieurs dépêches → un seul vecteur représentatif ou pénalité de similarité.
- **Métadonnées dans le texte embeddé** : préfixer le chunk par `Pays: … | Source: …` pour séparer géopolitiquement les angles.

## Embeddings

- **Modèle multilingue** aligné arabe / hébreu / persan / turc (qualité Cohere actuelle à monitorer par langue).
- **Chunking** : titres + lead + 1er paragraphe plutôt que article entier (bruit ↓).
- Rafraîchir les embeddings seulement si le contenu traduit change.

## Clustering

- **Deux niveaux** : (1) détection de « macro-sujet » (guerre, nucléaire, Syrie…) ; (2) sous-clusters par pays ou par ligne éditoriale.
- **Contraintes** : ne pas mélanger dans un même cluster des articles dont les pays sources sont trop hétérogènes sans thème fort (pénalité dans le score ou post-fusion).
- **HDBSCAN** : continuer à tuner `min_cluster_size` / `min_samples` ; envisager **UMAP** en pré-traitement si la séparation reste floue.
- **Non-thématique** : étiquette explicite « Hétérogène » (labellage LLM) + file de re-clustering manuel ou semi-auto.

## UX produit

- **Vue « par pays »** en parallèle de la vue « sujets du jour ».
- **Fil d’actualité** des derniers éditoriaux traduits (liste simple, sans clustering).
- **Explication** : afficher 2–3 titres représentatifs + pourquoi le cluster existe (similarité / entités communes).
- **Performance** : cache client (React Query), listes paginées, endpoints agrégés (déjà amorcé sur `/api/clusters`).

## Autres technologies (optionnel)

- **Entités nommées** (NER) par langue → features pour le clustering ou le filtre.
- **Topic models** classiques (BERTopic) en complément des embeddings pour étiquettes plus lisibles.
- **Recherche hybride** (BM25 + vecteur) pour la sélection journalistique.
- **File d’attente** asynchrone (Celery / RQ) pour ne pas bloquer l’API sur embedding + LLM.
