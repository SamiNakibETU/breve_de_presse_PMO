# Audit technique & éditorial — MEMW / Revue de presse OLJ
## Diagnostic complet + Spécification de finalisation

**Auditeur** : Claude (Opus 4.6) — mandaté par Sami Nakib  
**Date** : 22 mars 2026  
**Périmètre** : dépôt `breve_de_presse_PMO` (branche `v2/media-watch`), run pipeline du 22/03, specs v2, CSV sources Emilie, frontend staging  
**Destination** : porteur du projet (Sami), rédaction OLJ (Emilie Sueur)

---

## SYNTHÈSE EXÉCUTIVE

Le pipeline tient la route techniquement (collecte, traduction, embeddings, clustering fonctionnent). Mais **le produit n'est pas encore un outil de composition éditoriale** — c'est un dashboard de monitoring pipeline avec une vue articles en prime. L'écart entre ce qui existe et ce que la rédaction attend (« ouvrir l'outil, voir les sujets du jour, sélectionner, copier-coller en 30 min ») reste significatif.

Trois axes structurants séparent l'état actuel de la mise en production :

1. **La qualité du signal** : trop de bruit, trop de doublons syndiqués, trop de clusters incohérents, des sources critiques silencieuses.
2. **L'architecture produit** : l'objet « Édition » (borné dans le temps, orienté publication) n'existe pas encore — tout converge vers un flux continu que le journaliste doit décrypter.
3. **Le parcours UX** : le journaliste voit un dashboard technique, pas un sommaire éditorial.

La bonne nouvelle : la spec MEMW v2 que tu as rédigée diagnostique parfaitement le fossé et propose une architecture solide. Le travail restant est de l'implémenter.

---

## PARTIE 1 — DIAGNOSTIC DU RUN DU 22 MARS 2026

### 1.1 Chiffres clés du run

| Métrique | Valeur | Évaluation |
|----------|--------|------------|
| Durée totale pipeline | 3 337 s (~56 min) | Acceptable pour un run bi-quotidien, mais la collecte seule (1 699 s) est lente |
| Articles collectés | 141 nouveaux | Correct mais concentré sur peu de sources |
| Articles filtrés (hors périmètre) | 47 (33%) | Le filtre `editorial_scope` fait son travail |
| Traductions réussies | 202 | Bon volume |
| Articles « à relire » (confiance basse) | 64 (31,7%) | **Trop élevé** — quasi un tiers du corpus est douteux |
| Échecs traduction (`retry_exhausted`) | 3 | Acceptable |
| Erreurs embedding | 1 (critique) | Bug numpy non résolu en production |
| Corps marqués syndiqués | 151 | **Massif** — confirme le problème de doublons |
| Clusters affichés | 6 sujets | Correct en nombre, mais qualité très variable |

### 1.2 Problèmes identifiés dans la sortie éditoriale

**Cluster n°1 — « Hétérogène : revue de presse à resynchroniser »**  
Ce label est littéralement l'aveu du système qu'il ne sait pas quoi faire du cluster. L'extrait principal parle de « choix capillaires des femmes » (Milliyet, Turquie) — un article lifestyle qui n'aurait jamais dû passer le filtre. Le second extrait parle d'un « homme qui cherche à se marier en fonction de son nom » (Al Jarida, Koweït). Ce cluster n'a aucune valeur pour une revue de presse géopolitique.

**Cause racine** : les « hubs d'opinion » (67 sources, 101 articles, 19 filtrés, 23 ignorés courts) ingèrent du contenu lifestyle/société qui passe les filtres actuels. Le filtre `editorial_scope.py` bloque « voyage et cuisine » mais pas « mode », « mariage », « astrologie », « développement personnel ».

**Cluster n°5 — « Turquie : tensions politico-judiciaires, polémiques mémorielles et escalade régionale Iran-Syrie »**  
30 articles, 1 seul pays (Turquie). C'est un méga-cluster mono-pays qui mélange 3-4 sujets distincts. Le clustering n'a pas réussi à séparer les angles éditoriaux.

**Cause racine** : les hubs d'opinion turcs (Sabah, Milliyet, Sozcu, etc.) produisent beaucoup de volume. Sans dédup de surface efficace, les colonnes turques dominent le corpus et créent des blocs monolithiques.

**Cluster n°4 — « Déclin de l'hégémonie américaine au Moyen-Orient »**  
14 articles, 5 pays. Le meilleur cluster du lot — bon sujet, bonne diversité géographique. Mais l'auteur du premier extrait (Annahar, Liban) est identifié comme « أسعد عبود » en arabe, non nettoyé.

**Problème transversal — « Auteur = URL Facebook »**  
Le second extrait du cluster Aïd montre `https://www.facebook.com/middleeasteye/` comme source du Middle East Eye. L'auteur n'est pas extrait, c'est l'URL du RSS qui est affichée. Le correctif `clean_author_for_display` existe dans le code mais le nettoyage n'est pas assez agressif.

### 1.3 Sources silencieuses

Sur les ~48 sources affichées dans le dashboard « État des sources », la grande majorité montre **0 articles sur 72h**. Les seules sources productrices significatives sont :

- Al Jazeera English : 80 articles (dont combien sont des dépêches factuelles ?)
- Annahar : 20 articles
- Foreign Policy : 13 articles
- Le Grand Continent : 11 articles
- Gulf Times : 6 articles
- Arab Times : 3 articles

**Sources P0 absentes (0 article) :**
- Haaretz (paywall)
- Israel Hayom
- Iran International
- Ynet News
- Al-Ahram (Playwright échoue)
- Mada Masr
- Khaleej Times (Playwright)
- Jordan Times (Playwright)

Le « trou israélien » identifié dans la spec v2 est confirmé : aucune source israélienne n'a produit d'article dans le dernier run.

### 1.4 Bug technique bloquant

L'erreur `"The truth value of an array with more than one element is ambiguous"` dans l'étape embeddings empêche la chaîne embedding → dédup sémantique → clustering → labels de fonctionner correctement. Le correctif existe dans le commit `1f4f0cc` (test explicite `raw is None` dans `semantic_dedupe.py`) mais **n'est pas déployé en production**.

---

## PARTIE 2 — ÉCART ENTRE SPEC V2 ET IMPLÉMENTATION ACTUELLE

La spec MEMW v2 est un document de qualité exceptionnelle — bien structuré, bien référencé académiquement, avec des critères de validation clairs. Voici ce qui est implémenté vs. ce qui reste à faire :

### 2.1 Matrice spec vs. réalité

| Composant spec v2 | État actuel | Effort restant |
|---|---|---|
| **Objet Édition** (fenêtre temporelle, cycle de vie) | ❌ Non implémenté | P0 — Modèle + migration + cron |
| **EditionTopic** (sujets curatés) | ❌ Non implémenté | P0 — Dépend de Édition + Curateur |
| **Dédup passe 1** (MinHash LSH) | ❌ Non implémenté — seul simhash corps existe | P0 — Module nouveau |
| **Dédup passe 2** (cosinus sémantique) | ⚠️ Existe (`semantic_dedupe.py`) mais buggé (numpy) | P1 — Fix + déploiement |
| **Clustering restreint à l'Édition** | ❌ Cluster sur tout le corpus 48h | P0 — Refactor `clustering_service.py` |
| **UMAP pré-HDBSCAN** | ❌ Non implémenté | P1 — Amélioration qualité |
| **Curateur LLM** (couche 3 spec) | ❌ Non implémenté | P0 — Module nouveau central |
| **Génération par Sujet** (transitions narratives) | ❌ Génération article par article | P1 — Refactor `generator.py` |
| **UX Sommaire → Sujet → Composition** | ❌ Le frontend est un dashboard technique | P0 — Refonte parcours |
| **UX Régie** (séparation monitoring/éditorial) | ❌ Tout est mélangé | P1 — Réorganisation navigation |
| **Classification sources P0/P1/P2** | ❌ Toutes sources traitées uniformément | P0 — Registre + alertes |
| **Prompt v2** (Chain of Density one-shot) | ❌ Prompts v1 en production | P1 — Mise à jour fichiers YAML |
| **Health check automatique sources** | ⚠️ Existe partiellement (`source_health_metrics`) mais métriques faussées par alias | P1 |
| **Score pertinence éditoriale** (distinct de confiance traduction) | ❌ Le score actuel mélange les deux | P2 |
| **Traçabilité `pipeline_trace_id`** | ❌ | P2 |
| **Feedback faux positifs dédup** | ❌ | P3 |

### 2.2 Écart sources OLJ vs. registre implémenté

La liste CSV d'Emilie contient **~90 sources uniques** dans **15 pays** (incluant Oman, Bahreïn, Algérie — absents du registre actuel). Le `MEDIA_REGISTRY.json` contient 39 sources. Les hubs d'opinion alimentent 67 sources supplémentaires (probablement issues de la liste Emilie mais avec un mapping opaque).

**Sources présentes chez Emilie mais absentes du registre :**
- Oman (7 sources : Al Roya, Al Watan, Oman Daily, Oman Observer, Muscat Daily, Times of Oman, Al Shabiba)
- Bahreïn (Akhbar el-Khaleej, Al-Watan)
- Algérie (El Chourouk el-Yom)
- Turquie (Cumhuriyet, Sabah, Sozcu, Milliyet — présents dans les hubs d'opinion mais pas dans le registre formel)
- Israël (Maariv, Yediot Aharonot — en hébreu)
- Iran (Donya-e-Eqtesad, Shargh — en farsi)
- Syrie (Syria TV, Al Hal, Ultra Syria, al Thawra, Kassioun, Levant24)
- Koweït (Al Qabas, Al Seyassah, Al Anba, Al Jarida)
- Qatar (Al Raya, Al Sharq, Al Watan)

**Implication** : le système tourne avec un sous-ensemble des sources demandées par la rédaction. Les sources arabophones (la majorité de la liste Emilie) sont sous-représentées.

---

## PARTIE 3 — PROBLÈMES TRANSVERSAUX

### 3.1 Qualité de la traduction et du résumé

Le taux de 31,7% d'articles « à relire » (confiance < 0.70) est trop élevé. Causes probables :

- **Contenu trop court** : le collecteur garde des articles avec `content_original` très court (RSS summary seul quand trafilatura échoue). Le prompt LLM ne peut pas produire un résumé dense à partir de 3 phrases.
- **Mélange factuel/opinion** : le filtre `editorial_scope` ne distingue pas assez bien les dépêches factuelles des opinions. Al Jazeera (80 articles) a un RSS généraliste, pas un flux opinion dédié.
- **Score de confiance = auto-évaluation** : le `compute_confidence` dans `translator.py` est un heuristique maison (pénalités par signal), pas un retour du LLM. Les pénalités sont arbitraires.

**Recommandation** : implémenter le `quality_flags` de la spec v2 des prompts. Séparer le score de confiance de traduction (fiabilité linguistique) du score de pertinence éditoriale (intérêt pour la revue).

### 3.2 Coût et performance LLM

Le routage multi-provider (Groq/Cerebras/Anthropic) est bien conçu. Mais l'absence de structured outputs (JSON Schema enforced) signifie que le parsing JSON échoue parfois (les 3 `retry_exhausted` sont probablement des `ValueError` de parsing JSON). La spec v2 des prompts recommande les structured outputs Anthropic — c'est la bonne direction mais ça ne marche qu'avec Anthropic, pas avec Groq/Cerebras via OpenAI API.

**Recommandation** : pour Groq/Cerebras, utiliser `response_format: { type: "json_object" }` (disponible sur les API OpenAI-compatible) et ajouter un validateur JSON Schema post-réponse.

### 3.3 Architecture frontend

Le frontend Next.js est propre, bien typé, avec React Query, Tailwind, et un design éditorial sobre conforme à `AGENTS.md`. Mais il expose le pipeline (boutons Collecte/Traduction/Refresh clusters) en première page, ce que la spec v2 veut reléguer en Régie. Le parcours actuel est :

```
Dashboard (stats + pipeline + clusters) → Cluster détail → Sélection → Review
```

Le parcours cible de la spec v2 est :

```
Sommaire de l'Édition → Sujet détail (par pays) → Composition → Export
```

Ce n'est pas un ajustement cosmétique — c'est une refonte de la navigation et de l'architecture des pages.

### 3.4 Déduplication syndication — le problème central

151 corps marqués syndiqués sur un run de ~200 articles traduits = le journaliste voit le même contenu dupliqué partout. Le simhash actuel marque les doublons mais ne les élimine pas du clustering. La spec v2 propose MinHash LSH + cosinus, avec élection de représentant — rien de cela n'est implémenté.

**Impact direct** : les clusters sont dominés par des reprises de dépêches, pas par des voix éditoriales distinctes.

### 3.5 Sécurité et secrets

Le `.env.example` expose les patterns de clés API (Groq, Cerebras, Anthropic, Cohere). Le `INTERNAL_API_KEY` mentionné dans l'audit n'est pas documenté. Les endpoints pipeline (`POST /api/pipeline`, `/api/collect`, `/api/translate`) n'ont aucune authentification — n'importe qui peut déclencher le pipeline si l'URL est connue.

**Recommandation P1** : ajouter un middleware d'authentification basique (bearer token) sur les endpoints de mutation.

---

## PARTIE 4 — SPÉCIFICATION DE FINALISATION

Objectif : transformer le prototype actuel en produit utilisable par la rédaction en **4 semaines** (8 sprints de 2-3 jours).

### Phase 1 — Stabilisation du signal (Semaine 1)

**Sprint 1.1 — Déployer les correctifs existants et combler les sources P0**

| Action | Détail | Critère de validation |
|--------|--------|----------------------|
| Déployer commit `1f4f0cc` | Fix numpy dedupe + alias santé | Pipeline complet sans erreur embedding |
| Ajouter auth sur endpoints mutation | Bearer token via env var `INTERNAL_API_KEY` | `POST /api/pipeline` sans token → 401 |
| Auditer les 8 sources P0 cibles | Jerusalem Post, Times of Israel, Haaretz (RSS summary), Tehran Times, Press TV, Al Jazeera opinions, Asharq Al-Awsat, Gulf News | Chaque source P0 produit ≥1 article/run |
| Corriger le flux Al Jazeera | Ajouter filtrage opinion ou utiliser une URL de section opinion | Moins de 30 articles AJ par run (vs. 80 actuellement) |

**Sprint 1.2 — Renforcer le filtre éditorial**

| Action | Détail | Critère de validation |
|--------|--------|----------------------|
| Élargir `LIFESTYLE_TRAVEL_SUBSTRINGS` | Ajouter : mode/fashion, coiffure/hair, mariage/wedding, astrologie/horoscope, développement personnel, sport-spectacle | Le cluster « choix capillaires » ne passe plus |
| Ajouter un filtre post-traduction | Après traduction, le LLM flag `wire_copy` → exclure du clustering | Les dépêches factuelles ne polluent plus les clusters |
| Tester les hubs d'opinion turcs | Les colonnes turques (Sabah, Milliyet, Sozcu) dominent le corpus → vérifier que les filtres lifestyle marchent en turc | Pas de cluster mono-pays Turquie avec >20 articles |

### Phase 2 — Dédup + Clustering éditorial (Semaine 2)

**Sprint 2.1 — Dédup de surface (MinHash LSH)**

| Action | Détail |
|--------|--------|
| Implémenter `dedup_surface.py` | MinHash LSH sur `summary_fr` (shingle=5 mots, 128 hashes, 16 bandes, seuil Jaccard ≥ 0.65) |
| Élection de représentant | Tier source > date publication > longueur contenu |
| Enrichissement représentant | `syndication_group_size` + `syndication_group_sources` |
| Intégrer dans `scheduler.py` | Après traduction, avant embedding |
| Rapport debug JSONL | Groupes détectés, élu, exclus, scores |

**Critère de validation** : le nombre d'articles entrant dans le clustering baisse de >50%. Vérification manuelle de 20 groupes : <5% faux positifs.

**Sprint 2.2 — Clustering restreint + paramètres ajustés**

| Action | Détail |
|--------|--------|
| Fenêtre temporelle stricte | Seuls les articles de la fenêtre d'Édition (pas tout le corpus 48h) |
| Paramètres HDBSCAN | `min_cluster_size=3`, `min_samples=2`, `cluster_selection_method='leaf'` |
| Ajouter UMAP pré-clustering | `n_components=15`, `n_neighbors=15`, `min_dist=0.1`, `metric='cosine'` |
| Post-traitement fusion | Clusters avec centroïdes cosinus > 0.80 → marqués fusionnables |
| Refactor sous-clustering | Remplacer le `_refine_mega_clusters` actuel par la fusion au niveau Curateur |

**Critère de validation** : 8-20 clusters bruts (vs. 28 actuellement) sur un corpus de 80-150 articles post-dédup.

### Phase 3 — Curateur + Modèle Édition (Semaine 3)

**Sprint 3.1 — Modèle Édition**

| Action | Détail |
|--------|--------|
| Migration Alembic | Tables `editions`, `edition_topics`, `edition_topic_articles` |
| Champ `edition_id` sur `articles` | FK nullable |
| Cron création Édition | À 00:00 Beyrouth, crée l'Édition du lendemain avec fenêtre par défaut |
| Rattachement automatique | À l'ingestion, chaque article est rattaché à l'Édition ouverte |
| Cycle de vie | SCHEDULED → COLLECTING → CURATING → COMPOSING → PUBLISHED |

**Sprint 3.2 — Curateur v1**

| Action | Détail |
|--------|--------|
| Nouveau module `curator_service.py` | Appel LLM structuré (Sonnet, temp 0.2) |
| Input | Clusters bruts + métadonnées Édition + contexte éditorial |
| Output | JSON normé : 4-8 sujets ordonnés, articles recommandés, carte pays, angle/contrepoint |
| Invariants programmatiques | Pas d'hallucination d'id, pas de doublon inter-sujets, fourchette sujets respectée |
| Fallback | Si invariant violé → afficher clusters bruts avec message d'erreur non-technique |

**Critère de validation** : sur 3 Éditions consécutives, le Curateur produit un sommaire sans violation d'invariant, et Emilie valide >60% des sujets proposés.

### Phase 4 — Refonte UX (Semaine 4)

**Sprint 4.1 — Espace Composition (3 écrans)**

**Écran 1 — Sommaire** (remplace le dashboard actuel comme page d'accueil)
- En-tête : date de l'Édition, nombre de sujets, nombre d'articles candidats
- Liste de 4-8 lignes : rang, titre éditorial, drapeaux pays, nombre d'articles, phrase-thèse saillante
- Drag-and-drop pour réordonner, inline-edit pour renommer, × pour rejeter
- Si curation pas encore faite : countdown + bouton « Lancer la curation »
- Rien d'autre sur cet écran. Pas de stats, pas de pipeline, pas de compteurs.

**Écran 2 — Sujet** (remplace `/clusters/[id]`)
- Articles recommandés par pays (sous-sections avec drapeau)
- Cases à cocher pré-cochées pour les articles recommandés par le Curateur
- Phrase-thèse entre guillemets, média, indicateur syndication, indicateur confiance
- Résumé en expansion (pas affiché par défaut)
- Section pliée « Autres articles sur ce sujet » (non recommandés)

**Écran 3 — Composition** (refonte de `/review`)
- Preview du texte généré sujet par sujet
- Drag-and-drop articles au sein d'un sujet
- Inline editing léger
- Boutons « Copier » et « Télécharger .txt »
- Le titre général et le chapeau ne sont PAS générés — Emilie l'a confirmé

**Sprint 4.2 — Espace Régie** (accessible via lien secondaire)
- Santé des sources (P0 surlignées si dégradées)
- Pipeline (chronologie, durées, erreurs)
- Dédup (groupes de syndication)
- Curateur (input/output brut, diff)
- Les boutons « Collecte », « Traduction », « Refresh clusters », « Pipeline complet » migrent ici

---

## PARTIE 5 — POINTS SPÉCIFIQUES À TRAITER

### 5.1 Le format de sortie OLJ — derniers ajustements

Le format actuel dans `generator.py` est presque bon. Problèmes résiduels observés dans `exemple_revue.txt` :

- **Résumé du 3ème article (Asharq Al-Awsat)** : le résumé parle du trafic maritime à Hormuz, mais le titre parle de fonds supplémentaires du Pentagone. Le LLM a confondu deux articles ou mal restitué.
- **Auteur = "author"** : le 3ème article montre `Nom de l'auteur : author` — le champ auteur n'a pas été extrait.
- **Résumé du 4ème article** : très similaire au 3ème — probable doublon syndiqué (même dépêche AFP sur le détroit d'Hormuz reprise par Asharq et Iraqi News).

**Action** : la génération par Sujet (pas article par article) résoudra la confusion inter-articles. Le Curateur identifiera les doublons et ne recommandera que le représentant.

### 5.2 Prompts — migration v1 → v2

Les prompts actuels sont hardcodés dans `translator.py` et `generator.py`. La spec v2 propose 5 prompts versionnés dans des fichiers YAML séparés. Migrer progressivement :

1. Extraire les prompts actuels dans `backend/config/prompts/` (déjà amorcé pour `cluster_label_v2.yaml`)
2. Implémenter le prompt Traduction v2 (avec `quality_flags` et densité d'entités)
3. Implémenter le prompt Curateur (nouveau)
4. Restructurer le prompt Génération (par Sujet, avec transitions)

### 5.3 Registre des sources — réconciliation avec la liste Emilie

La liste CSV d'Emilie est la source de vérité éditoriale. Créer un mapping explicite :

1. Pour chaque ligne du CSV → vérifier si une entrée existe dans `MEDIA_REGISTRY.json`
2. Si oui → vérifier que l'URL opinion correspond
3. Si non → créer l'entrée avec `is_active: false` et `tier: "P2"` (à valider avec Emilie)
4. Demander à Emilie de valider la classification P0/P1/P2

**Priorité** : les sources israéliennes (Jerusalem Post opinion RSS fonctionne, Times of Israel fonctionne) et les sources turques (déjà dans les hubs d'opinion mais pas formalisées).

### 5.4 Hubs d'opinion — comprendre et documenter

Le pipeline collecte 67 « hubs d'opinion » qui produisent 101 articles. Ce mécanisme n'est pas documenté dans le README ni dans les specs. Il semble correspondre à un scraping parallèle des pages opinion des sources de la liste Emilie. Questions à clarifier :

- Comment les hubs d'opinion sont-ils configurés ? (fichier de config ? Code ?)
- Pourquoi 67 hubs pour ~90 sources Emilie ? (mapping incomplet ?)
- Les hubs d'opinion respectent-ils le filtre éditorial ?
- Le taux de 23 articles « trop courts » ignorés sur 101 (22,8%) suggère un problème d'extraction.

### 5.5 Performance et coûts

| Poste | Estimation mensuelle actuelle | Cible |
|-------|-------------------------------|-------|
| Collecte + traduction (2 runs/jour) | ~$30-40 LLM (Groq/Cerebras principalement) | Stable |
| Embeddings Cohere | ~$1-2 | Stable |
| Curateur (nouveau) | ~$5-10 (1 appel Sonnet/Édition) | Nouveau coût |
| Génération OLJ | ~$5-10 (3-5 articles/jour × Sonnet) | Stable |
| Infrastructure Railway | ~$20-30 | Stable |
| **Total mensuel estimé** | **~$60-90** | Budget OK |

---

## PARTIE 6 — RECOMMANDATIONS PRIORISÉES

### P0 — Bloquants (Semaine 1-2)

1. **Déployer le fix numpy + alias** — sans ça, le pipeline produit des résultats incohérents
2. **Combler le trou israélien** — ajouter et tester Jerusalem Post + Times of Israel opinion RSS
3. **Implémenter la dédup MinHash LSH** — sans ça, les clusters restent noyés de syndication
4. **Ajouter l'auth sur les endpoints** — le pipeline est déclenchable sans authentification
5. **Élargir le filtre lifestyle** — mode, mariage, astrologie, sport-spectacle

### P1 — Structurants (Semaine 3-4)

6. **Modèle Édition** — le pivot conceptuel du produit
7. **Curateur LLM** — la couche d'intelligence éditoriale manquante
8. **Refonte UX Sommaire → Sujet → Composition** — le parcours journaliste
9. **Séparation Composition / Régie** — le journaliste ne doit plus voir le pipeline
10. **Migration prompts v2** — qualité des résumés et des labels

### P2 — Améliorations (Post-lancement)

11. Score de pertinence éditoriale (distinct de confiance traduction)
12. UMAP pré-clustering
13. Génération par Sujet avec transitions narratives
14. Traçabilité `pipeline_trace_id`
15. Health check automatique avec alertes Slack
16. Réconciliation complète registre sources / CSV Emilie (Oman, Bahreïn, sources arabophones)

### P3 — Évolutions futures

17. Feedback faux positifs dédup (dataset de calibration)
18. Métriques produit (`curator_acceptance_rate`, `average_time_to_publish`)
19. Détection de biais comparée (même événement, angles différents)
20. BERTrend (signaux faibles, topics émergents)

---

## PARTIE 7 — QUESTIONS OUVERTES POUR EMILIE

Avant de lancer la phase de finalisation, ces questions doivent être tranchées avec la rédaction :

1. **Classification P0** : quelles sont les 8-12 sources dont l'absence rendrait la revue non publiable ?
2. **Fenêtre temporelle** : confirmer « édition du lundi = fenêtre vendredi 18h → lundi 6h Beyrouth » et « mardi-vendredi = J-1 18h → J 06h »
3. **Nombre de sujets cible** : 4-8 sujets par Édition, c'est correct ?
4. **Sources arabophones** : la liste Emilie contient beaucoup de sources en arabe pur (pas de version anglaise). Le système traduit-il correctement depuis l'arabe ? Tester sur un échantillon de 10 articles arabes avec relecture humaine.
5. **Hébreu** : Maariv et Yediot Aharonot sont en hébreu. Anthropic est le seul provider fiable pour l'hébreu. Coût additionnel acceptable ?
6. **Farsi** : Donya-e-Eqtesad, Shargh — même question pour le persan.
7. **Le chapeau** : « voici la revue de presse régionale de ce [jour]. On y parle de X, Y, Z » — est-ce que le système devrait pré-proposer une liste de sujets pour le chapeau, même si le journaliste le rédige ?

---

*Fin de l'audit. Document à partager avec Emilie pour arbitrage éditorial des questions ouvertes, et avec l'équipe technique pour planification des sprints.*
