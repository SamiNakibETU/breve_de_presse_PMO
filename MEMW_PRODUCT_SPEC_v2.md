# MEMW v2 — Spécifications Produit Complètes

## Document de référence pour la refonte architecture produit

**Projet** : Middle East Media Watch (MEMW) — L'Orient-Le Jour  
**Auteur** : Sami Nakib  
**Version** : 2.0  
**Date** : 21 mars 2026  
**Statut** : Draft — À valider avec Emilie Sueur  

**Diagnostic d'origine** : Le fossé entre le système actuel et la mise en production n'est pas technique — c'est un fossé de design produit entre un outil d'ingestion (pipeline-centric) et un outil de composition éditoriale (edition-centric). Ce document spécifie la transformation complète.

**Métrique nord** : ≤ 30 minutes entre l'ouverture de l'outil par le journaliste et le copier-coller dans le back-office OLJ.

---

## TABLE DES MATIÈRES

1. [Glossaire & Ontologie Produit](#1-glossaire--ontologie-produit)
2. [Architecture Conceptuelle : Le Modèle Édition](#2-architecture-conceptuelle--le-modèle-édition)
3. [Couche 1 — Déduplication & Syndication](#3-couche-1--déduplication--syndication)
4. [Couche 2 — Clustering Éditorial](#4-couche-2--clustering-éditorial)
5. [Couche 3 — Le Curateur (Curation LLM)](#5-couche-3--le-curateur-curation-llm)
6. [Couche 4 — Génération de la Revue](#6-couche-4--génération-de-la-revue)
7. [Architecture UX : Composition vs. Régie](#7-architecture-ux--composition-vs-régie)
8. [Registre des Sources (Source Registry)](#8-registre-des-sources-source-registry)
9. [Stratégie de Prompting](#9-stratégie-de-prompting)
10. [Observabilité & Debug](#10-observabilité--debug)
11. [Plan d'Implémentation Séquencé](#11-plan-dimplémentation-séquencé)
12. [Critères de Validation (Definition of Done)](#12-critères-de-validation-definition-of-done)
13. [Références Académiques & Industrielles](#13-références-académiques--industrielles)

---

## 1. Glossaire & Ontologie Produit

Chaque terme ci-dessous a une définition contractuelle dans le système. Toute ambiguïté dans l'implémentation doit être résolue en revenant à ce glossaire.

**Édition** — L'objet de premier rang du produit. Une Édition représente une intention de publication bornée dans le temps. Elle possède une date de parution cible (ex. lundi 21 mars 2026), une fenêtre de collecte (ex. vendredi 18h Beyrouth → lundi 6h Beyrouth), un état de cycle de vie, et un nombre cible de sujets. Tout le reste du système — articles, clusters, sources, traductions — existe au service d'une Édition. L'Édition n'est pas un wrapper autour d'une Review : c'est le pivot conceptuel autour duquel le pipeline converge.

**Sujet Éditorial (EditionTopic)** — Un regroupement thématique curé par le système et validé par le journaliste, contenant 3 à 8 articles sélectionnés pour l'Édition. Un Sujet Éditorial est le produit de la fusion et du filtrage des clusters bruts du pipeline. Il possède un titre éditorial proposé (style manchette OLJ, 8-12 mots), une carte géographique (quels pays × quels angles), et un rang d'importance. Le nombre cible de Sujets par Édition est 4-8 (jamais 28).

**Article Candidat** — Un article ingéré, traduit, et qualifié pour participer au clustering d'une Édition. Pour devenir candidat, un article doit satisfaire quatre conditions simultanées : (a) publié dans la fenêtre temporelle de l'Édition, (b) traduit avec un score de confiance ≥ 0.70, (c) non identifié comme doublon syndiqué (ou, s'il est syndiqué, être le représentant élu de son groupe), (d) classé « dans le périmètre » par le filtre éditorial.

**Groupe de Syndication** — Un ensemble d'articles identifiés comme reprises d'une même dépêche ou d'un même éditorial source. Le groupe élit un représentant unique (l'article le mieux noté, ou le plus ancien, ou celui issu du média source le plus haut en tier) et conserve la trace de tous les membres pour information (« repris par 5 médias »). Fondement académique : la détection de syndication dans la presse MENA est critique car les dépêches AFP/Reuters et les éditoriaux du groupe SRMG (Asharq Al-Awsat) sont repris systématiquement, comme l'a montré le run du 21 mars (229/275 corps syndiqués, soit 83%).

**Cluster Brut** — Le résultat direct de HDBSCAN sur les embeddings des Articles Candidats de l'Édition. Les clusters bruts sont des artefacts intermédiaires, jamais exposés au journaliste. Ils alimentent le Curateur.

**Curateur** — La couche d'intelligence éditoriale entre le clustering brut et l'interface journaliste. Le Curateur est un appel LLM dédié qui prend les clusters bruts et produit un sommaire éditorial structuré : la liste ordonnée des Sujets Éditoriaux recommandés pour l'Édition, avec pour chacun les articles recommandés, la carte pays, et une proposition de titre. Cette approche s'inspire du paradigme « LLM-as-curator » documenté dans la recherche en journalisme computationnel (cf. Computation + Journalism Symposium 2025 — « LLM-Assisted News Discovery in High-Volume Information Streams »).

**Composition** — L'espace UX où le journaliste travaille : sommaire de l'Édition → sélection de sujets → sélection d'articles → génération → copie CMS. C'est le chemin critique de la métrique ≤ 30 min.

**Régie** — L'espace UX de monitoring technique : santé des sources, stats pipeline, erreurs, JSON brut, logs de dédup. Accessible mais jamais sur le chemin du workflow éditorial quotidien. Conforme à la charte AGENTS.md : « publication d'abord, interface quasi invisible ».

**Source P0/P1/P2** — Classification des sources par criticité éditoriale. P0 = indispensable (l'absence déclenche une alerte), P1 = enrichissement (l'absence appauvrit mais ne bloque pas), P2 = expérimentale (ingérée mais pas dans le périmètre garanti de l'Édition).

---

## 2. Architecture Conceptuelle : Le Modèle Édition

### 2.1 Pourquoi l'Édition est l'objet central

Le système actuel est pipeline-centric : les données coulent de la collecte vers le stockage, et l'interface expose le résultat brut du pipeline. Le journaliste doit reconstruire mentalement ce qui est pertinent pour sa publication. Le modèle cible est edition-centric : l'Édition est créée en amont (automatiquement ou manuellement), et le pipeline converge vers elle.

Ce renversement s'inspire de l'architecture des CMS éditoriaux modernes (Superdesk, Arc XP, Labrador CMS) où le concept d'« édition » ou de « planning éditorial » est l'objet structurant — non pas l'article isolé ni le flux brut. La différence avec un CMS classique est que dans MEMW, le contenu n'est pas produit en interne mais collecté, traduit et curé automatiquement. L'Édition joue donc un rôle de « filtre intentionnel » sur le flux entrant.

### 2.2 Cycle de vie d'une Édition

L'Édition traverse cinq états, chacun avec des invariants stricts :

**SCHEDULED** — L'Édition existe avec ses bornes temporelles mais la fenêtre de collecte n'est pas encore ouverte. Invariant : `publish_date` et `window_start` sont fixés. Aucun article n'est encore associé.

**COLLECTING** — La fenêtre de collecte est ouverte. Le pipeline ingère et associe les articles à cette Édition. Invariant : `window_start ≤ now < window_end`. Les articles dont le `published_at` tombe dans la fenêtre sont automatiquement rattachés.

**CURATING** — La fenêtre est fermée (ou le journaliste a déclenché manuellement la curation). Le pipeline de dédup → clustering → Curateur a produit un sommaire éditorial. Le journaliste voit les Sujets proposés et peut les valider, réordonner, renommer, ou rejeter. Invariant : le sommaire Curateur existe, le journaliste n'a pas encore validé sa sélection finale.

**COMPOSING** — Le journaliste a sélectionné ses Sujets et ses articles. La génération du texte de la revue est en cours ou terminée. Invariant : au moins un Sujet est validé avec au moins 2 articles sélectionnés.

**PUBLISHED** — Le texte généré a été copié vers le CMS OLJ. L'Édition est archivée. Aucune modification n'est possible sauf rollback explicite vers COMPOSING.

### 2.3 Bornes temporelles et fuseaux

La fenêtre temporelle est définie en fuseau Beyrouth (Asia/Beirut, UTC+2 / UTC+3 selon DST). Toutes les comparaisons `published_at` se font dans ce fuseau. Les articles publiés avec un `published_at` ambigu (pas de timezone dans le RSS) sont interprétés en UTC, ce qui est le comportement le plus conservateur.

Configurations types de fenêtres :

Pour l'édition du lundi : fenêtre vendredi 18:00 → lundi 06:00 (Beyrouth). Pour l'édition du mardi au vendredi : fenêtre J-1 18:00 → J 06:00. Ces valeurs sont configurables par Édition. Le système propose des valeurs par défaut basées sur le jour de la semaine, mais Emilie ou le journaliste peut ajuster.

### 2.4 Création automatique des Éditions

Un cron job (ou trigger Railway) crée automatiquement l'Édition du jour suivant à 00:00 Beyrouth, avec les bornes par défaut. Cette création automatique garantit que le pipeline sait toujours vers quelle Édition rattacher les articles entrants. Si une Édition est créée manuellement, la création automatique est supprimée pour cette date.

### 2.5 Modèle de données

Entité `Edition` — Champs : `id` (UUID), `publish_date` (date), `window_start` (datetime avec tz), `window_end` (datetime avec tz), `timezone` (string, défaut "Asia/Beirut"), `target_topics_min` (int, défaut 4), `target_topics_max` (int, défaut 8), `status` (enum des 5 états), `created_at`, `updated_at`, `curator_run_id` (FK nullable vers le run Curateur), `generated_text` (text nullable, le résultat de la génération finale).

Entité `EditionTopic` — Champs : `id` (UUID), `edition_id` (FK), `rank` (int, ordre d'importance), `title_proposed` (string, titre LLM), `title_final` (string nullable, titre validé par le journaliste — si null, utilise `title_proposed`), `status` (enum : proposed | accepted | rejected), `country_coverage` (JSONB, ex. `{"IL": 2, "IR": 1, "LB": 1, "AE": 1}`), `angle_summary` (text, 2-3 phrases du Curateur sur l'angle dominant), `created_at`.

Table de liaison `edition_topic_articles` — Champs : `edition_topic_id` (FK), `article_id` (FK), `is_recommended` (bool, true si proposé par le Curateur), `is_selected` (bool, true si validé par le journaliste), `rank_in_topic` (int nullable).

Relation avec l'existant : le champ `article_id` pointe vers la table `articles` existante. Aucun changement au schéma `articles` n'est requis sauf l'ajout d'un champ `edition_id` (FK nullable) pour le rattachement rapide.

---

## 3. Couche 1 — Déduplication & Syndication

### 3.1 Le problème

Le run du 21 mars montre 229 corps marqués syndiqués sur 275 embeddés, soit un taux de syndication de 83%. Ce taux est cohérent avec la réalité de la presse MENA : les dépêches AP/AFP/Reuters sont reprises par la quasi-totalité des médias anglophones du Golfe, et les éditoriaux des grands groupes (SRMG pour Asharq Al-Awsat, Al Jazeera Media Network) sont distribués à des publications satellites. Si ces doublons entrent dans le clustering, ils créent des méga-clusters artificiels (le cluster « Conflit US/Israël—Iran » à 55 articles en est le symptôme direct) et diluent la diversité éditoriale perçue.

### 3.2 Stratégie de déduplication en deux passes

La littérature académique distingue clairement deux types de similarité textuelle : la similarité de surface (near-duplicate detection) et la similarité sémantique. Pour la presse syndiquée, la première suffit car les reprises sont des copies quasi-exactes avec des modifications mineures (titre adapté, paragraphe d'introduction local, footer de l'éditeur). La recherche récente (NDD-MAC, NAACL 2025 ; RETSim, ICLR 2024 ; SemHash, 2025) confirme que la combinaison de hashing rapide + embeddings pour les cas limites est l'approche optimale en production.

**Passe 1 — Déduplication de surface (avant embedding)**

Objectif : identifier les reprises exactes et quasi-exactes de dépêches. Méthode : MinHash LSH sur les n-grammes du texte traduit en français (après traduction, les variations de surface sont minimisées). Paramètres recommandés : shingle size = 5 mots, nombre de fonctions hash = 128, nombre de bandes = 16, seuil Jaccard ≥ 0.65. Ce seuil est volontairement bas pour capturer les reprises avec paragraphe d'intro ajouté (qui fait baisser le Jaccard global). Pour chaque groupe de doublons identifié, un représentant est élu selon la logique suivante : (a) préférer le média avec le tier le plus élevé dans le registre des sources, (b) à tier égal, préférer l'article publié le plus tôt, (c) à date égale, préférer l'article avec le contenu le plus long (signe d'un article source plutôt que d'une reprise tronquée). Les non-élus sont marqués `syndication_status = "duplicate"` et exclus de l'embedding et du clustering. Leur existence est conservée en base pour l'affichage « repris par N médias ».

**Passe 2 — Déduplication sémantique (après embedding, avant clustering)**

Objectif : identifier les articles qui couvrent le même événement avec le même angle éditorial mais ne sont pas des reprises textuelles (ex. deux dépêches Reuters sur le même briefing du Pentagone, l'une publiée à 14h et l'autre à 17h avec des citations additionnelles). Méthode : cosine similarity sur les embeddings des résumés traduits en français. Seuil : ≥ 0.92. Ce seuil est haut car on ne veut fusionner que les quasi-doublons sémantiques, pas les articles qui traitent du même sujet sous des angles différents. Au-dessus de 0.92, l'expérience montre que les articles sont effectivement des versions d'un même texte source. Même logique d'élection de représentant que la passe 1.

### 3.3 Enrichissement du représentant

L'article représentant élu est enrichi de deux métadonnées : `syndication_group_size` (int, nombre de membres du groupe) et `syndication_group_sources` (liste des noms de médias du groupe). Ces métadonnées sont affichées dans l'interface Composition (« Repris par Gulf News, Arab News, The National ») et permettent au journaliste de jauger le poids éditorial d'une dépêche sans voir tous les doublons.

### 3.4 Seuils et calibration

Les seuils (Jaccard 0.65, cosine 0.92) sont des valeurs initiales basées sur la littérature et le ratio de syndication observé. Un mécanisme de calibration est prévu : pendant la phase de beta, le journaliste peut signaler un faux positif (deux articles différents fusionnés à tort) ou un faux négatif (deux reprises non détectées). Ces signalements alimentent un petit dataset d'évaluation (~50-100 paires annotées) qui permet d'ajuster les seuils. L'objectif est un taux de faux positifs < 2% et un rappel > 85% sur les syndications réelles.

### 3.5 Impact attendu

Sur la base du run du 21 mars : 229 articles syndiqués → passage de ~275 articles embeddés à ~80-100 articles candidats uniques. Le clustering passe de 28 clusters bruts (avec méga-clusters et bruit) à un nombre estimé de 10-15 clusters plus homogènes. Ce chiffre est dans la fourchette cible pour le Curateur.

### 3.6 Debug — Déduplication

Chaque run de déduplication produit un rapport structuré :

Rapport `dedup_surface` — Pour chaque groupe de syndication détecté : hash du groupe, nombre de membres, article élu (id, source, titre), articles exclus (id, source, titre, score Jaccard avec l'élu), raison de l'élection. Format : JSONL, un objet par groupe.

Rapport `dedup_semantic` — Pour chaque paire fusionnée en passe 2 : ids des deux articles, score cosine, article élu, article exclu. Format : JSONL.

Métriques agrégées — `total_before_dedup`, `total_after_dedup`, `groups_surface`, `groups_semantic`, `reduction_ratio`, `avg_group_size`, `max_group_size`, `sources_most_syndicated` (top 5 sources contribuant le plus de doublons).

Vue debug dans l'interface Régie — Tableau des groupes de syndication, triés par taille décroissante, avec possibilité d'inspecter les membres de chaque groupe et de marquer un faux positif/négatif.

---

## 4. Couche 2 — Clustering Éditorial

### 4.1 Changement fondamental

Le clustering actuel opère sur l'ensemble de la base d'articles. Le clustering éditorial opère exclusivement sur les Articles Candidats de l'Édition en cours — c'est-à-dire les articles qui ont survécu au filtre temporel (fenêtre de l'Édition), au filtre de qualité (confiance traduction ≥ 0.70), au filtre de périmètre (editorial_scope), et à la déduplication (représentants élus uniquement).

### 4.2 Pipeline de clustering

**Étape 1 — Réduction dimensionnelle.** UMAP sur les embeddings des Articles Candidats. Paramètres recommandés : `n_components=15`, `n_neighbors=15`, `min_dist=0.1`, `metric='cosine'`. La réduction à 15 dimensions (plutôt que 2-3 pour la visualisation) préserve suffisamment de structure sémantique pour un clustering fiable tout en atténuant la malédiction de la dimensionnalité. La littérature (BERTopic, Grootendorst 2022 ; consensus clustering, Nature HSSCOMMS 2023) montre que UMAP + HDBSCAN est le pipeline standard pour le topic detection sur des corpus de taille modeste (100-500 documents).

**Étape 2 — HDBSCAN.** Paramètres recommandés pour un corpus de 80-150 articles candidats : `min_cluster_size=3`, `min_samples=2`, `cluster_selection_method='leaf'`, `metric='euclidean'`. Le choix de `min_cluster_size=3` (plutôt que les valeurs plus élevées 10-50 recommandées dans la documentation HDBSCAN pour de grands corpus) est adapté à la taille réduite du corpus post-dédup. Le mode `leaf` produit des clusters plus fins que le mode `eom` (Excess of Mass) par défaut, ce qui est souhaitable ici car la fusion sera faite par le Curateur LLM, pas par l'algorithme. Mieux vaut sur-segmenter et fusionner intelligemment que sous-segmenter et mélanger.

**Étape 3 — Gestion du bruit.** HDBSCAN étiquette les points non-clustérisés comme bruit (label -1). Dans le système actuel, 62 articles sont classés bruit sur 576, et 523 sont affichés comme « non classés » — un chiffre qui noie le journaliste. Avec le filtrage temporel + dédup, le bruit attendu est de 5-15 articles. Stratégie : les articles bruit sont collectés dans un pseudo-cluster « Divers / Non classés » envoyé au Curateur. Le Curateur peut décider de les ignorer ou de rattacher les plus pertinents à un Sujet existant.

**Étape 4 — Étiquetage des clusters.** Chaque cluster reçoit un label automatique généré par un appel LLM rapide (Haiku) qui prend les titres + premières phrases des 3 articles les plus centraux du cluster et produit un titre thématique en 5-8 mots. Ce label est un artefact intermédiaire destiné au Curateur — il n'est pas exposé au journaliste.

### 4.3 Post-traitement : Fusion des clusters proches

Avant l'envoi au Curateur, une passe de fusion identifie les clusters dont les centroïdes sont proches (cosine des centroïdes > 0.80). Ces clusters sont envoyés au Curateur comme un groupe fusionnable, avec une suggestion de fusion. Le Curateur décide s'il les fusionne en un seul Sujet ou les maintient séparés.

Justification : le run du 21 mars avait 4-5 variantes « escalade US-Iran ». Avec la fusion post-clustering, ces variantes seraient regroupées et présentées au Curateur comme un seul bloc avec la mention « 4 clusters potentiellement fusionnables ».

### 4.4 Debug — Clustering

Rapport `clustering_run` — Date du run, nombre d'articles en entrée, paramètres HDBSCAN utilisés, nombre de clusters produits, nombre d'articles bruit, distribution de taille des clusters (histogramme), score de silhouette moyen, condensed tree (sérialisé pour visualisation optionnelle).

Rapport `cluster_detail` — Pour chaque cluster : label auto, nombre d'articles, article le plus central (plus proche du centroïde), articles les plus périphériques (plus éloignés du centroïde), pays représentés, score de cohésion interne (distance intra-cluster moyenne).

Rapport `fusion_candidates` — Paires de clusters avec cosine centroïde > 0.80, labels respectifs, décision du Curateur (fusionné / maintenu séparé).

Métriques de qualité — `silhouette_score`, `noise_ratio`, `cluster_count`, `avg_cluster_size`, `max_cluster_size`, `min_cluster_size`, `country_diversity_index` (Shannon entropy sur la distribution pays dans les clusters).

---

## 5. Couche 3 — Le Curateur (Curation LLM)

### 5.1 Rôle et positionnement

Le Curateur est la couche d'intelligence la plus critique du produit. C'est elle qui transforme un résultat algorithmique (clusters HDBSCAN) en une proposition éditoriale lisible et exploitable. Le Curateur n'est pas un chatbot ni un assistant conversationnel — c'est un appel LLM structuré, déterministe (temperature 0.2), qui produit un JSON normé.

L'inspiration vient de deux traditions. La première est le paradigme « LLM-as-curator » documenté dans les travaux récents en journalisme computationnel : un LLM peut être instruit pour simuler un jugement éditorial de premier niveau — priorisation par news value, diversité géographique, contraste des perspectives — avec une fiabilité suffisante pour servir de proposition au journaliste. La seconde est le design de Feedly Leo (AI curation avec dédup, prioritisation, résumé) et des newsletters automatisées Feedly, qui montrent qu'un pipeline collecte → filtre IA → interface éditorialisée fonctionne en production à grande échelle, à condition que l'humain conserve le dernier mot.

### 5.2 Entrée du Curateur

Le Curateur reçoit un JSON structuré contenant :

Les métadonnées de l'Édition : date de parution, fenêtre temporelle, nombre cible de sujets (min/max).

La liste des clusters avec, pour chaque cluster : le label auto, le nombre d'articles, les 5 articles les plus centraux (titre, source, pays, résumé traduit en français, phrase-thèse si disponible), les pays représentés, le score de cohésion. Les clusters proches sont marqués comme fusionnables.

Le cluster « Divers / Non classés » avec ses articles bruit.

Le contexte éditorial minimal : « Revue de presse régionale sur la guerre au Moyen-Orient et au Liban pour L'Orient-Le Jour. Public : lectorat francophone informé, sensibilité libanaise. Priorité aux éditoriaux et analyses, pas aux dépêches factuelles sauf événement majeur. »

### 5.3 Sortie du Curateur

Le Curateur produit un JSON normé contenant :

Un tableau `topics` de 4 à 8 objets, ordonnés par importance éditoriale décroissante. Chaque objet contient : `title` (manchette OLJ, 8-12 mots, en français), `importance_rank` (1 à N), `source_clusters` (ids des clusters bruts fusionnés dans ce sujet), `recommended_articles` (liste ordonnée de 3-5 ids d'articles, avec pour chacun une justification d'une phrase : « Seul regard iranien dans le corpus » ou « Analyse de fond, contrepoint au factuel »), `country_coverage` (dict pays → nombre d'articles), `dominant_angle` (1-2 phrases décrivant l'angle principal), `counter_angle` (1-2 phrases sur le contrepoint s'il existe, ou « Pas de contrepoint identifié »), `editorial_note` (observation optionnelle pour le journaliste : « Le corpus manque de couverture israélienne sur ce sujet »).

Un objet `meta` contenant : `total_articles_considered`, `total_articles_recommended`, `clusters_merged` (nombre de fusions effectuées), `articles_from_noise_rescued` (nombre d'articles bruit rattachés à un sujet), `coverage_gaps` (pays attendus mais absents, ex. « Pas de source israélienne dans la fenêtre »), `edition_summary` (2-3 phrases résumant la tonalité éditoriale globale de l'Édition : « L'Édition du 21 mars est dominée par l'escalade US-Iran, avec un consensus régional rare sur la nécessité de désescalade, rompu par Téhéran »).

### 5.4 Contrat de qualité du Curateur

Le Curateur doit respecter les invariants suivants, vérifiables programmatiquement après chaque run :

Chaque article recommandé existe dans le corpus d'entrée (pas d'hallucination d'id). Chaque article recommandé apparaît dans exactement un sujet (pas de doublons inter-sujets). Le nombre de sujets est dans la fourchette [target_topics_min, target_topics_max]. Au moins 60% des pays présents dans le corpus apparaissent dans au moins un sujet. Aucun sujet n'a moins de 2 articles recommandés. La somme des articles recommandés ne dépasse pas 40 (pour éviter que le Curateur ne recommande tout).

Si un invariant est violé, le run Curateur est marqué comme `failed` et le journaliste voit un message explicite : « La curation automatique a échoué. Vous pouvez relancer ou sélectionner manuellement les articles. » avec un fallback vers l'affichage des clusters bruts étiquetés.

### 5.5 Stratégie de prompting du Curateur

La conception du prompt s'appuie sur trois principes issus de la recherche :

**Principe 1 — Structured Output First.** Le prompt demande une sortie JSON stricte avec un schéma défini. La littérature sur la summarization (Adams et al. 2023, « Chain of Density ») montre que les LLM produisent des résumés plus fiables quand le format de sortie est contraint et itératif. Ici, la contrainte est le schéma JSON + les invariants explicites dans le prompt.

**Principe 2 — Editorial Persona.** Le prompt assigne un rôle éditorial précis : « Tu es le rédacteur en chef de la revue de presse régionale de L'Orient-Le Jour. Ta mission est de produire un sommaire éditorial de cette édition. » Les recherches en prompt engineering montrent que l'assignation d'un persona spécialisé améliore la pertinence des jugements qualitatifs.

**Principe 3 — Critères explicites et hiérarchisés.** Les critères de sélection sont listés dans le prompt par ordre de priorité : (a) importance géopolitique de l'événement, (b) diversité géographique des perspectives, (c) qualité argumentative de l'article (éditorial > analyse > dépêche), (d) contraste des perspectives (un sujet avec un angle iranien ET un angle israélien vaut plus qu'un sujet mono-perspective). Chaque critère a un poids relatif explicite.

**Modèle recommandé pour le Curateur** : Claude Sonnet (meilleur rapport qualité/coût pour une tâche de jugement structuré sur un contexte de 10-20K tokens). Fallback : Claude Haiku (si le contexte est < 8K tokens et la complexité faible). Temperature : 0.2. Max tokens : 4096.

### 5.6 Debug — Curateur

Chaque run du Curateur produit :

Rapport `curator_run` — Timestamp, edition_id, modèle utilisé, temperature, tokens d'entrée, tokens de sortie, durée de l'appel, coût estimé.

Rapport `curator_input` — Le JSON exact envoyé au LLM (sauvegardé pour reproductibilité). Taille en tokens.

Rapport `curator_output_raw` — La réponse brute du LLM avant parsing.

Rapport `curator_output_parsed` — Le JSON parsé et validé contre le schéma.

Rapport `curator_invariants` — Résultat de la vérification de chaque invariant (pass/fail), avec détail de la violation le cas échéant.

Rapport `curator_diff` — Si le journaliste modifie le sommaire proposé (renomme un sujet, rejette un sujet, ajoute un article), le diff est enregistré. Ce diff est la donnée la plus précieuse pour améliorer le Curateur : il montre exactement où le jugement LLM diverge du jugement humain.

Vue debug dans l'interface Régie — Affichage côte-à-côte du sommaire proposé et du sommaire final validé par le journaliste, avec les diffs surlignés.

---

## 6. Couche 4 — Génération de la Revue

### 6.1 Ce qui ne change pas

Le format de sortie reste celui défini par Emilie et déjà implémenté : pour chaque article sélectionné, une phrase-thèse entre guillemets, un résumé de 3-5 phrases, et une fiche (média, pays, date, langue, auteur). Le titre général et le chapeau sont produits par le journaliste dans le CMS OLJ, pas par MEMW.

### 6.2 Ce qui change

Le prompt de génération reçoit désormais un contexte éditorial riche fourni par le Curateur : le titre du Sujet, l'angle dominant, le contrepoint, et l'ordre de présentation des articles dans le sujet. Ce contexte permet au LLM de produire des transitions entre les résumés d'articles (« À contre-courant de cette lecture, l'éditorialiste de Haaretz... ») qui donnent à la revue une cohérence narrative.

### 6.3 Prompting de génération — Chain of Density adapté

La technique de Chain of Density (Adams et al. 2023, NewSum Workshop, ACL) est adaptée pour les résumés d'articles : plutôt qu'une itération en 5 passes (trop coûteuse pour un pipeline de production), la version MEMW utilise une passe unique avec un prompt qui spécifie explicitement la densité cible : « Résumé en 3-5 phrases. Chaque phrase doit contenir au moins une entité nommée (personne, lieu, institution). Aucun filler ('cet article discute', 'l'auteur mentionne'). La phrase-thèse doit être une citation ou paraphrase attribuée directement extraite de l'article, entre guillemets. »

Ce prompt intègre les leçons de la recherche CoD sans le coût computationnel de l'itération : la contrainte de densité est formulée comme une instruction, pas comme un processus multi-étapes. Les tests montrent que Claude Sonnet/Haiku respectent bien ce type de contrainte en one-shot quand elle est formulée précisément.

### 6.4 Regroupement par Sujet

La génération se fait Sujet par Sujet, pas article par article. Le LLM reçoit tous les articles d'un Sujet en une seule requête, avec instruction de produire le bloc complet (phrase-thèse + résumé + fiche pour chaque article, dans l'ordre fourni, avec une transition de 1 phrase entre les articles). Cela garantit la cohérence narrative du sujet et permet au LLM de faire des connexions entre les articles (« Contrairement au Tehran Times, Al Jazeera insiste sur... »).

### 6.5 Debug — Génération

Rapport `generation_run` — Timestamp, edition_id, topic_id, articles_ids, modèle utilisé, tokens d'entrée, tokens de sortie, durée, coût.

Rapport `generation_output_raw` — Texte brut produit par le LLM.

Rapport `generation_quality_check` — Vérification automatique post-génération : chaque article sélectionné a-t-il une fiche ? La phrase-thèse est-elle entre guillemets ? Le résumé fait-il 3-5 phrases ? Les entités nommées dans le résumé sont-elles cohérentes avec l'article source ? (vérification par extraction NER + matching).

---

## 7. Architecture UX : Composition vs. Régie

### 7.1 Principe directeur

L'interface MEMW applique le principe de progressive disclosure : le journaliste ne voit que ce dont il a besoin à l'étape où il se trouve. Le monitoring, le debug, les stats, le JSON brut — tout cela existe mais dans un espace séparé (la Régie) accessible par un lien discret, jamais sur le chemin du workflow éditorial.

Ce design s'oppose au pattern « firehose » (déverser toutes les données et laisser l'humain filtrer) qui caractérise le système actuel. Il s'inspire des meilleurs designs de produits d'intelligence pour professionnels : la différence entre un terminal Bloomberg (tout est visible, l'expert sait où regarder) et un briefing de renseignement (3-5 points clés, sources triées, action recommandée). Le journaliste d'OLJ n'est pas un analyste de données — c'est un rédacteur qui a besoin d'un sommaire, pas d'un dashboard.

### 7.2 Espace Composition — Parcours en 3 écrans

**Écran 1 — Le Sommaire**

C'est la page d'accueil quand le journaliste ouvre MEMW. Il voit immédiatement le sommaire de l'Édition du jour, proposé par le Curateur. L'écran affiche en en-tête le titre de l'Édition (« Édition du lundi 21 mars — 6 sujets, 34 articles »), puis une liste de 4-8 lignes, chacune contenant : le rang (numéro), le titre éditorial proposé, les drapeaux-pays (icônes), le nombre d'articles, et la phrase-thèse la plus saillante du sujet (celle de l'article le plus central). Chaque ligne est cliquable. Le journaliste peut réordonner les sujets par drag-and-drop, renommer un titre en cliquant dessus, ou rejeter un sujet (icône ×).

Si la curation automatique n'a pas encore tourné (fenêtre de collecte encore ouverte), l'écran affiche un état d'attente avec le countdown : « Collecte en cours — 42 articles candidats. Curation disponible à 06:00 ou sur demande. » avec un bouton « Lancer la curation maintenant ».

Si la curation a échoué, l'écran affiche un message d'erreur non-technique et un fallback vers les clusters bruts étiquetés.

Rien d'autre n'est visible sur cet écran. Pas de stats, pas de compteurs de pipeline, pas de barre latérale avec les sources. Juste le sommaire. Le design devrait ressembler à un sommaire de journal — quelques lignes denses, une hiérarchie typographique claire, et du blanc.

**Écran 2 — Le Sujet**

Le journaliste a cliqué sur un sujet. Il voit les articles recommandés par le Curateur, organisés par pays (sous-sections avec drapeau + nom du pays). Pour chaque article : une case à cocher (pré-cochée pour les articles recommandés par le Curateur), la phrase-thèse entre guillemets, le nom du média, l'indicateur de syndication (« Repris par 3 médias » si applicable), et un indicateur de confiance simple (point vert si confiance traduction > 0.85, point gris si 0.70-0.85). Le résumé complet est visible en expansion (clic ou hover), pas affiché par défaut. L'article source (lien vers l'URL originale) est accessible via un bouton discret.

En bas de la vue sujet, une section pliée « Autres articles sur ce sujet » montre les articles du/des cluster(s) brut(s) qui n'ont pas été recommandés par le Curateur. Le journaliste peut les cocher pour les ajouter à sa sélection.

L'angle dominant et le contrepoint produits par le Curateur sont affichés en encart discret en haut de la vue sujet (2-3 lignes, typographie légère).

**Écran 3 — La Composition**

Le journaliste a sélectionné ses articles (en cochant/décochant sur l'Écran 2, pour un ou plusieurs sujets). Il arrive sur un écran de preview du texte généré. L'écran montre le texte final sujet par sujet, dans l'ordre du sommaire, avec les phrases-thèses, résumés et fiches. Le journaliste peut : réordonner les articles au sein d'un sujet (drag-and-drop), éditer légèrement le texte généré (inline editing), et exporter. L'export se fait via deux boutons : « Copier dans le presse-papiers » (pour coller dans le back-office OLJ) et « Télécharger .txt ».

Le titre général et le chapeau ne sont pas générés — Emilie l'a dit, ils sont produits par l'humain dans le CMS.

### 7.3 Espace Régie — Tableau de bord technique

La Régie est accessible via un lien dans la navigation secondaire (icône engrenage ou lien texte « Régie »). Elle contient :

**Vue Santé des Sources** — Tableau des sources par tier (P0/P1/P2) avec pour chacune : statut (active / dégradée / morte), dernier article collecté (date), nombre d'articles dans la fenêtre de l'Édition courante, taux de traduction réussie sur 7 jours, erreurs récentes (type, message, date). Les sources P0 dégradées ou mortes sont surlignées en rouge.

**Vue Pipeline** — Chronologie du dernier run avec durées par étape (collecte, traduction, embedding, dédup, clustering, curation, génération). Erreurs détaillées avec stacktrace. Stats agrégées (articles collectés, traduits, dédupliqués, clusterisés, recommandés, générés).

**Vue Déduplication** — Groupes de syndication détectés, avec possibilité de signaler un faux positif/négatif.

**Vue Clustering** — Visualisation 2D UMAP des clusters (scatter plot interactif), condensed tree HDBSCAN, paramètres utilisés.

**Vue Curateur** — Input/output brut du LLM, diff entre sommaire proposé et sommaire validé, historique des runs.

**Vue Logs** — Stream des logs du pipeline en temps réel (filtrable par niveau : INFO/WARN/ERROR).

---

## 8. Registre des Sources (Source Registry)

### 8.1 Classification en tiers

Le registre actuel (MEDIA_REGISTRY.json) contient ~120 sources avec un traitement uniforme. La réalité du run du 21 mars montre que seules 15-20 sources produisent du contenu exploitable. Le registre v2 introduit une classification à trois niveaux.

**Sources P0 — Indispensables (8-12 sources)**

Critère : sans ces sources, la revue n'a pas de valeur éditoriale. Si une source P0 est down pendant plus de 24h, le système alerte. Si elle n'a pas d'article dans la fenêtre d'édition, le sommaire Curateur le signale explicitement (« Pas de couverture israélienne aujourd'hui »).

Sources P0 recommandées (à valider avec Emilie) :
- Liban : L'Orient-Le Jour (référence maison), Annahar
- Israël : Jerusalem Post, Times of Israel, Haaretz (si paywall résolu)
- Iran : Tehran Times, Press TV
- Golfe : Al Jazeera, Asharq Al-Awsat, Gulf News
- Analyse transversal : Al-Monitor, Foreign Policy

Le trou israélien identifié le 21 mars (Haaretz, Israel Hayom, Ynet à 0 article) est le problème P0 le plus urgent. Jerusalem Post et Times of Israel ont des RSS fonctionnels et des sections opinion/éditorial accessibles. Ils doivent être ajoutés et validés immédiatement.

**Sources P1 — Enrichissement (15-20 sources)**

Critère : enrichissent la diversité sans être critiques. Leur absence appauvrit la revue mais ne la bloque pas.

Sources P1 recommandées : Middle East Eye, Daily Sabah (Turquie), Bianet (Turquie alternative), Mada Masr (Égypte), Iraqi News, Rudaw (Kurdistan), Doha News, The National (EAU), Le Grand Continent (analyse FR), New Lines Magazine.

**Sources P2 — Expérimentales (reste)**

Critère : ingérées mais pas dans le périmètre garanti. Utilisées pour tester de nouvelles sources ou couvrir des événements spécifiques. Les 8 sources mortes identifiées le 21 mars (Ahval, Al-Ahram EN, Gulf Daily News, Khaleej Times, LBCI, MTV Lebanon, Peninsula Qatar, Saba Net) sont soit désactivées, soit reclassées P2 avec suivi.

### 8.2 Metadata de source

Chaque source dans le registre possède : `tier` (P0/P1/P2), `country` (ISO 3166-1 alpha-2), `editorial_line` (1-2 phrases, ex. « Quotidien conservateur proche du gouvernement israélien »), `content_types` (editorial, analysis, wire, news), `language` (ISO 639-1), `scraping_method` (rss, http, playwright), `rss_url`, `opinion_url` (URL de la section opinion/éditorial si distincte), `is_active` (bool), `health_check_interval` (minutes).

### 8.3 Health check automatique

Un cron job vérifie toutes les 6h que chaque source P0 est accessible (HTTP 200 sur le RSS feed). Si une source P0 échoue 3 checks consécutifs (18h d'indisponibilité), une alerte est envoyée (email ou Slack). Les sources P1 sont vérifiées toutes les 12h. Les sources P2 toutes les 24h.

---

## 9. Stratégie de Prompting

### 9.1 Inventaire des prompts système

MEMW utilise 5 prompts LLM distincts, chacun avec un rôle, un modèle, et des contraintes propres :

**Prompt 1 — Traduction + Résumé** (existant, à optimiser). Rôle : traduire un article vers le français et produire un résumé de 3-5 phrases. Modèle : routage par langue (Cerebras pour arabe/persan, Groq pour EN/FR, Anthropic pour hébreu). Contrainte : produire aussi un score de confiance 0-1. Optimisation v2 : ajouter une instruction explicite de densité inspirée de Chain of Density : « Chaque phrase du résumé doit contenir au moins une entité nommée. Aucun filler. La première phrase est la phrase-thèse : une citation ou paraphrase attribuée directement, entre guillemets. »

**Prompt 2 — Étiquetage de cluster** (existant, à optimiser). Rôle : produire un label thématique de 5-8 mots pour un cluster. Modèle : Haiku (rapide, peu coûteux). Contrainte : le label doit être factuel, pas éditorial (« Escalade navale au détroit d'Hormuz » et non « Tensions inquiétantes dans le Golfe »). Optimisation v2 : inclure le pays dominant du cluster dans le label.

**Prompt 3 — Curateur** (nouveau). Décrit en détail dans la Section 5. Modèle : Sonnet. Temperature : 0.2. Format : JSON strict.

**Prompt 4 — Génération de revue** (existant, à restructurer). Rôle : produire le texte final de la revue pour un Sujet, à partir des articles sélectionnés. Modèle : Sonnet. Contrainte : format OLJ (phrase-thèse guillemets, résumé, fiche), transitions entre articles, densité Chain of Density one-shot.

**Prompt 5 — Évaluation de pertinence éditoriale** (nouveau, optionnel). Rôle : scorer la pertinence d'un article par rapport au périmètre éditorial de la revue (guerre au Moyen-Orient, politique régionale, géopolitique) sur une échelle 0-1. Ce prompt remplace le « score de pertinence » actuel qui est en réalité la confiance de traduction. Modèle : Haiku. Contrainte : le score doit refléter la pertinence éditoriale, pas la qualité de traduction. Un article parfaitement traduit mais hors-sujet (recette libanaise) doit scorer 0. Un article mal traduit mais sur l'escalade au Liban-Sud doit scorer 0.8+.

### 9.2 Principes de prompt engineering

Tous les prompts suivent les mêmes conventions : persona explicite en première ligne, format de sortie spécifié (JSON ou texte structuré), contraintes négatives (« Ne fais PAS... ») après les contraintes positives, exemples few-shot quand le format est ambigu (2-3 exemples suffisent pour stabiliser la sortie), et une clause de fallback explicite (« Si tu ne peux pas produire le résultat demandé, retourne un JSON avec un champ 'error' expliquant pourquoi »).

### 9.3 Versioning des prompts

Chaque prompt est versionné (v1, v2, etc.) et stocké dans un fichier dédié (pas hardcodé dans le code Python). Un changement de prompt est un changement de configuration, pas un changement de code. Le rapport de debug de chaque run LLM inclut la version du prompt utilisé.

---

## 10. Observabilité & Debug

### 10.1 Philosophie

Chaque composant du pipeline produit un rapport de debug structuré. Ces rapports ne sont pas des logs textuels — ce sont des objets JSON normés, indexables, et requêtables. L'objectif est qu'en cas de problème (« Pourquoi le sujet Iran n'apparaît pas dans le sommaire ? »), un développeur puisse remonter la chaîne causale en 5 minutes : Édition → Curateur output → Clusters → Dédup → Articles candidats → Source.

### 10.2 Chaîne de traçabilité

Chaque Édition possède un `pipeline_trace_id` (UUID) qui lie tous les rapports de debug produits pour cette Édition. Le parcours de traçabilité est :

`Edition` → `dedup_surface_report` → `dedup_semantic_report` → `clustering_report` → `curator_input` → `curator_output` → `curator_invariants` → `generation_reports` (un par sujet).

Chaque rapport est timestampé, lié à l'Édition, et stocké en JSONB dans une table `pipeline_debug_logs` avec les champs : `edition_id`, `step` (enum : dedup_surface, dedup_semantic, clustering, curation, generation), `payload` (JSONB), `created_at`.

### 10.3 Alertes

Trois niveaux d'alerte : CRITICAL (source P0 down > 18h, curation failed, 0 articles dans la fenêtre d'édition), WARNING (source P1 down > 24h, taux de syndication > 90%, bruit > 20%), INFO (nouvelle source ajoutée, seuil de dédup ajusté).

Les alertes CRITICAL sont envoyées par email (et Slack si configuré). Les WARNING sont visibles dans la Régie. Les INFO sont uniquement dans les logs.

### 10.4 Métriques de suivi produit

Au-delà du debug technique, des métriques produit sont collectées pour mesurer la qualité du système dans le temps :

`curator_acceptance_rate` — Pourcentage de sujets proposés par le Curateur qui sont acceptés par le journaliste (cible > 80%).

`curator_article_acceptance_rate` — Pourcentage d'articles recommandés qui sont effectivement sélectionnés (cible > 70%).

`average_time_to_publish` — Temps moyen entre l'ouverture de l'outil et l'export (cible ≤ 30 min).

`editorial_override_rate` — Pourcentage d'Éditions où le journaliste renomme un titre ou réordonne les sujets (taux élevé = le Curateur a besoin d'ajustement).

`source_coverage_score` — Pour chaque Édition, le pourcentage de pays du périmètre (LB, IL, IR, AE, QA, IQ, TR, EG, SY) présents dans au moins un sujet (cible > 60%).

---

## 11. Plan d'Implémentation Séquencé

### Phase 1 — Fondations (Semaine 1-2)

**Sprint 1.1 — Modèle Édition** : Créer le schéma `editions`, `edition_topics`, `edition_topic_articles`. Implémenter le cron de création automatique. Ajouter le champ `edition_id` à `articles`. Modifier la logique d'ingestion pour rattacher automatiquement les articles à l'Édition ouverte. Critère de validation : un run pipeline produit des articles rattachés à une Édition avec bornes correctes.

**Sprint 1.2 — Déduplication passe 1** : Implémenter MinHash LSH sur les textes traduits. Élection de représentant. Exclusion des doublons avant embedding. Rapport debug `dedup_surface`. Critère de validation : sur un run réel, le nombre d'articles entrant dans le clustering baisse de > 50% et aucun faux positif flagrant (vérification manuelle de 20 groupes).

### Phase 2 — Intelligence éditoriale (Semaine 3-4)

**Sprint 2.1 — Clustering restreint à l'Édition** : Modifier le pipeline de clustering pour ne traiter que les articles candidats de l'Édition. Ajuster les paramètres HDBSCAN (min_cluster_size=3, leaf mode). Implémenter la passe de fusion de clusters proches. Rapport debug `clustering_run`. Critère de validation : sur un run réel, le nombre de clusters bruts est dans la fourchette 8-20 (contre 28 actuellement).

**Sprint 2.2 — Curateur v1** : Implémenter l'appel LLM Curateur avec le prompt de la Section 5. Parser et valider la sortie JSON. Vérifier les invariants. Rapport debug complet. Critère de validation : sur 3 Éditions consécutives, le Curateur produit un sommaire de 4-8 sujets sans violation d'invariant, et Emilie valide > 60% des sujets proposés (validation humaine).

### Phase 3 — Interface (Semaine 5-6)

**Sprint 3.1 — Écran Sommaire + Écran Sujet** : Implémenter les Écrans 1 et 2 de l'espace Composition. Le Sommaire affiche le résultat du Curateur. Le Sujet affiche les articles recommandés par pays. Critère de validation : un journaliste peut naviguer du sommaire à un sujet et cocher des articles en < 3 clics.

**Sprint 3.2 — Écran Composition + Export** : Implémenter l'Écran 3 avec la génération par sujet et l'export copie/téléchargement. Séparer l'espace Régie (lien depuis la navigation). Critère de validation : le workflow complet Sommaire → Sujet → Composition → Copie fonctionne en < 30 minutes sur une Édition réelle.

### Phase 4 — Stabilisation (Semaine 7-8)

**Sprint 4.1 — Sources** : Appliquer la classification P0/P1/P2. Désactiver les 8 sources mortes. Ajouter Jerusalem Post + Times of Israel. Implémenter le health check automatique et les alertes. Critère de validation : toutes les sources P0 sont actives et produisent au moins 1 article par fenêtre d'édition pendant 5 jours consécutifs.

**Sprint 4.2 — Dédup passe 2 + Calibration** : Implémenter la dédup sémantique post-embedding. Mettre en place le mécanisme de feedback (faux positifs/négatifs) et le dataset de calibration. Critère de validation : taux de faux positifs < 5% sur 50 paires vérifiées manuellement.

**Sprint 4.3 — Score de pertinence éditorial** : Implémenter le Prompt 5 (pertinence éditoriale) et remplacer le score de confiance de traduction dans l'interface. Critère de validation : un article hors-sujet mais bien traduit ne score plus > 0.3.

---

## 12. Critères de Validation (Definition of Done)

### 12.1 Critères par composant

**Édition** — DoD : une Édition est automatiquement créée chaque jour, les articles sont correctement rattachés à la fenêtre temporelle, le cycle de vie SCHEDULED → COLLECTING → CURATING → COMPOSING → PUBLISHED fonctionne sans intervention manuelle sauf aux points de décision humaine (validation du sommaire, sélection des articles).

**Déduplication** — DoD : le taux de syndication dans le clustering est passé de 83% à < 15%. Les rapports de debug sont complets et lisibles. Le mécanisme de calibration fonctionne.

**Clustering** — DoD : le nombre de clusters bruts est dans la fourchette 8-20 pour un corpus de 80-150 articles. Le bruit est < 15% du corpus. Les clusters proches sont identifiés pour fusion.

**Curateur** — DoD : le sommaire est produit en < 30 secondes. Les invariants sont respectés dans > 95% des runs. Le taux d'acceptation des sujets par Emilie est > 60% après 2 semaines de calibration du prompt.

**Interface Composition** — DoD : le workflow complet (ouverture → copie CMS) prend < 30 minutes. Le journaliste ne voit aucune donnée technique sauf s'il va dans la Régie. L'interface fonctionne sur un écran 13" (laptop rédaction).

**Interface Régie** — DoD : un développeur peut diagnostiquer un problème (source down, cluster aberrant, curation échouée) en < 5 minutes en utilisant les vues de la Régie.

### 12.2 Critère global de mise en production

MEMW v2 est prêt pour la mise en production quand les 5 conditions suivantes sont réunies simultanément, vérifiées sur 5 Éditions consécutives :

1. Le workflow complet prend < 30 minutes (mesuré par `average_time_to_publish`).
2. Le Curateur produit un sommaire valide dans 100% des Éditions (pas de violation d'invariant).
3. Le journaliste accepte > 60% des sujets proposés.
4. Toutes les sources P0 produisent au moins 1 article par Édition.
5. Aucune alerte CRITICAL n'est restée non-résolue pendant > 2h.

---

## 13. Références Académiques & Industrielles

### Curation LLM et journalisme computationnel

- « LLM-Assisted News Discovery in High-Volume Information Streams: A Case Study » — Computation + Journalism Symposium 2025. Propose le paradigme « LLM-as-curator » pour le monitoring presse. Montre qu'un prompt bien conçu peut encoder un premier niveau de jugement journalistique. Recommandation : le prompt doit inclure des instructions explicites par facette (pertinence, nouveauté, importance) et un format de sortie structuré.

- « Auditing LLM Editorial Bias in News Media Exposure » — arXiv 2510.27489, oct. 2025. Analyse les biais éditoriaux des LLM dans la curation de news. Met en garde contre la concentration des sources (les LLM tendent à sur-représenter certains outlets). Recommandation MEMW : le Curateur doit avoir une contrainte explicite de diversité géographique.

### Summarization et Chain of Density

- Adams, Fabbri, Ladhak, Lehman, Elhadad (2023). « From Sparse to Dense: GPT-4 Summarization with Chain of Density Prompting. » NewSum Workshop, ACL 2023. La technique CoD produit des résumés plus abstractifs, avec moins de lead bias, et une densité préférée par les humains au step 3 (sur 5). Adaptation MEMW : une passe unique avec contrainte de densité explicite plutôt que 5 passes itératives.

- Pan et al. (2025). « Can LLMs Generate Coherent Summaries? Leveraging LLM Summarization for Spanish-Language News Articles. » Applied Sciences 15(21). Montre que le « bottleneck prompting » (filtrage d'entités par saillance avant résumé) améliore la factualité. Pertinent pour MEMW car les articles source sont multilingues.

### Déduplication et détection de syndication

- Tumre, Patil, Kumar (2025). « Improved Near-Duplicate Detection for Aggregated and Paywalled News-Feeds. » NAACL 2025, Industry Track. Propose NDD-MAC : embeddings PLM + métadonnées latentes + community detection pour identifier les clusters de near-duplicates dans les news feeds agrégés. Directement applicable au problème MEMW de syndication AFP/Reuters.

- Marina et al. (2024). « RETSim: Resilient and Efficient Text Similarity. » ICLR 2024. Modèle léger d'embeddings spécialisé near-duplicate detection, robuste aux typos et variations mineures. Alternative aux embeddings lourds pour la passe 1 de dédup MEMW.

- Khan et al. (2024). « LSHBloom: Internet-Scale Text Deduplication. » arXiv 2411.04257. État de l'art sur MinHash LSH avec Bloom filters pour la dédup à grande échelle. Les paramètres de banding et de seuil Jaccard sont directement transposables au cas MEMW (avec ajustement pour la taille de corpus beaucoup plus petite).

- SemHash (van Dongen, Tulkens, 2025). Outil open-source de dédup sémantique rapide basé sur model2vec + vicinity. Utilisable directement pour la passe 2 de dédup MEMW.

### Clustering et topic detection

- Campello, Moulavi, Sander (2013). « Density-Based Clustering Based on Hierarchical Density Estimates. » PAKDD 2013. Papier fondateur de HDBSCAN. Le paramètre `min_cluster_size` est le seul paramètre critique ; le mode `leaf` est recommandé pour obtenir des clusters fins qui peuvent ensuite être fusionnés.

- Nature HSSCOMMS (2023). « Topic detection with recursive consensus clustering and semantic enrichment. » Montre que HDBSCAN combiné avec enrichissement sémantique (word embeddings) produit des topics plus stables que les approches LDA classiques. Recommande la validation par consensus itératif.

- NVIDIA Technical Blog (2023). « Faster HDBSCAN Soft Clustering with RAPIDS cuML. » Benchmarks de performance : CPU HDBSCAN sur 100K documents prend 500s, GPU < 2s. Pour le corpus MEMW (100-200 articles), le CPU suffit largement (<1s).

### Architecture newsroom et workflow éditorial

- Feedly Leo — Plateforme de curation AI pour veille presse. Architecture pertinente : collecte RSS → filtre IA (dédup, prioritisation, résumé) → interface éditorialisée → newsletter automatisée. Le pattern « train the AI by example » (Like-Board skill) est une piste future pour MEMW (le journaliste entraîne le Curateur en validant/rejetant les sujets).

- Superdesk (Sourcefabric) — CMS open-source pour rédactions. Le concept de « planning éditorial » comme objet structurant (équivalent de l'Édition MEMW) est central dans l'architecture. Les workflows sont contrôlés par l'éditorial, pas imposés par le logiciel.

- Arc XP (Washington Post) — CMS enterprise. Le pattern « inbound feeds » (ingestion de contenu externe) + « editorial workflow » + « distribution multi-canal » est l'architecture de référence pour les grandes rédactions. MEMW en est une version verticale (spécialisée revue de presse régionale).

---

*Fin du document de spécifications. Version 2.0 — 21 mars 2026.*
