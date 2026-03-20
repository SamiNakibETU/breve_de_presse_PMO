# Middle East Media Watch — Spécifications Complètes
## Vers le produit parfait pour L'Orient-Le Jour

**Auteur** : Audit collaboratif Sami Nakib + Claude  
**Date** : 20 mars 2026  
**Statut** : Spécifications long terme — vision produit état de l'art

---

## 1. VISION PRODUIT

### 1.1 Ce que ce produit EST

Un **observatoire des positions éditoriales du Moyen-Orient** qui permet à un journaliste OLJ de comprendre en 5 minutes ce que la presse régionale dit des crises en cours, de sélectionner les voix les plus pertinentes, et de produire une revue de presse quotidienne prête à publier.

Ce n'est pas un agrégateur de news. C'est un outil d'**intelligence narrative** : il montre comment le même événement est cadré différemment par un éditorialiste iranien, un analyste saoudien, un chroniqueur israélien et un commentateur turc. La valeur ajoutée n'est pas dans la collecte (n'importe quel agrégateur peut faire ça) — elle est dans la **mise en regard des angles**.

### 1.2 Ce que ce produit N'EST PAS

- Un moteur de recherche (le journaliste ne cherche pas, il parcourt)
- Un outil de veille exhaustif (il ne couvre pas tout, il couvre l'essentiel)
- Un remplaçant du journaliste (l'IA prépare, l'humain choisit et relit)
- Un outil technique (l'utilisateur final ne voit jamais un JSON, un score, un embedding)

### 1.3 Métrique de succès unique

**Temps entre l'ouverture de l'interface et la publication de la revue de presse dans le CMS** : objectif < 30 minutes (actuellement estimé à > 2 heures de travail manuel équivalent).

**Checklist chronométrage (cible 30 min)** : voir `docs/memw_validation_checklist_30min.md`.

---

## 2. ARCHITECTURE PIPELINE — Spécifications par couche

### 2.1 COUCHE 1 — Collecte (Ingestion)

#### 2.1.1 Objectif
Récupérer quotidiennement les contenus éditoriaux (opinions, éditoriaux, tribunes, analyses) des médias MENA cibles, dans leur langue d'origine, avec métadonnées complètes.

#### 2.1.2 Sources — Stratégie de couverture

**Principe directeur** : 3 sources par pays représentant des lignes éditoriales divergentes (pro-gouvernement, indépendant, opposition/diaspora quand disponible). Cela garantit que chaque pays offre une pluralité de perspectives, pas une voix monolithique.

**Couverture géographique cible** (14 pays, ~42 sources) :

| Pays | Sources prioritaires | Langues | Difficulté |
|------|---------------------|---------|------------|
| Liban | Annahar (AR), OLJ (FR), Al Akhbar (AR) | ar, fr | Mixte |
| Israël | Jerusalem Post (EN), Haaretz (EN/HE), Israel Hayom (EN/HE) | en, he | Paywall Haaretz |
| Iran | Press TV (EN), Tehran Times (EN), Iran International (EN/FA) | en, fa | Sanctions/censure |
| EAU | Gulf News (EN), The National (EN), Khaleej Times (EN) | en | SPA |
| Arabie Saoudite | Asharq Al-Awsat (EN/AR), Arab News (EN), Saudi Gazette (EN) | en, ar | WAF |
| Turquie | Daily Sabah (EN), Hurriyet Daily News (EN), Bianet (EN) | en, tr | Facile |
| Irak | Iraqi News (EN), Rudaw (EN/KU), Kurdistan24 (EN/KU) | en, ku | Facile |
| Syrie | Syrian Observer (EN), Enab Baladi (EN), SANA (EN) | en, ar | Facile |
| Qatar | Al Jazeera (EN), Gulf Times (EN), Peninsula Qatar (EN) | en | SPA |
| Jordanie | Jordan Times (EN), Al Ghad (AR), Roya News (EN) | en, ar | SPA |
| Égypte | Daily News Egypt (EN), Mada Masr (EN), Al-Ahram (EN) | en, ar | Paywall |
| Koweït | Kuwait Times (EN), Arab Times (EN), KUNA (EN) | en | Timeout |
| Yémen | Yemen Times / Saba Net (en recherche) | en, ar | Instable |
| Bahreïn | Gulf Daily News / Al Ayam (en recherche) | en, ar | Facile |

**Sources transversales** (analyses MENA anglophones) : Al-Monitor, Middle East Eye, New Lines Magazine.

#### 2.1.3 Méthode de collecte — Hiérarchie de fiabilité

1. **RSS opinion dédié** (quand disponible) → Priorité absolue. Le flux RSS d'une rubrique opinion/editorial ne contient que du contenu éditorial. Pas de filtrage nécessaire en aval.
2. **RSS général + filtre éditorial** → Deuxième choix. Le flux RSS général est filtré côté serveur par des heuristiques de classification (mots-clés géopolitiques, exclusion lifestyle, signal opinion).
3. **Scraping HTML (SSR)** → Pour les sites sans RSS. BeautifulSoup + trafilatura sur les pages opinion/editorial des sites rendus côté serveur.
4. **Playwright headless** → Dernier recours. Pour les SPA (Single Page Applications) et les sites avec protection anti-bot (WAF, Cloudflare). Plus lent, plus fragile, plus coûteux en ressources.

**Spec critique** : Chaque source dans le MEDIA_REGISTRY doit avoir un champ `rss_opinion_url` renseigné quand il existe, et un champ `opinion_page_url` pour le scraping. Le collecteur doit toujours préférer `rss_opinion_url` à `rss_url`.

#### 2.1.4 Filtrage éditorial à l'ingestion

**Objectif** : Ne laisser entrer dans le pipeline que les contenus qui ont une chance d'être utiles pour la revue de presse. Tout article qui passe ce filtre sera traduit (coûteux en tokens LLM), donc le filtre doit être agressif.

**Règles de filtrage** :

1. **Sur flux opinion dédié** : Tout passe sauf le lifestyle/voyage/sport pur (blocklist de sous-chaînes). Un flux opinion a déjà été filtré par la rédaction du média source.
2. **Sur flux général** : Signal géopolitique obligatoire (au moins un mot-clé fort type « war », « strike », « sanctions », « ceasefire » etc. — pas un simple nom de pays seul). Exclure lifestyle, sport-spectacle, cuisine, tourisme.
3. **Post-extraction du corps** : Re-vérifier sur les 2500 premiers caractères du corps. Si le contenu est du lifestyle même avec un titre géopolitique (clickbait), rejeter.

**Spec critique** : Le filtre actuel (`editorial_scope.py`) est bon. Une **classification LLM légère** est implémentée pour les flux **non opinion** : `needs_ingestion_llm_gate` détecte les cas à signal « faible » ou titre très court, puis `ingestion_llm_gate.confirm_geopolitical_relevance` envoie titre + extrait (résumé RSS étendu, et optionnellement extrait de corps post-fetch si le flag `ingestion_llm_gate_post_body_enabled` est actif). Recommandation produit : garder le gate désactivable via `INGESTION_LLM_GATE_ENABLED` pour les environnements sans clés LLM.

#### 2.1.5 Extraction de contenu

**Chaîne d'extraction** (dans l'ordre, avec fallback) :

1. Trafilatura favor_recall=True (récupère le maximum de texte)
2. Trafilatura favor_precision=True (récupère un texte plus propre)
3. Fetch direct + trafilatura sur HTML brut
4. Résumé RSS (si ≥ 80 caractères après nettoyage HTML)
5. Titre + résumé RSS combinés (si ≥ 80 caractères)

**Métadonnées extraites par article** :

| Champ | Source primaire | Fallback |
|-------|---------------|----------|
| URL | RSS entry.link | — |
| Titre original | RSS entry.title | HTML og:title / h1 |
| Contenu intégral | trafilatura | RSS summary |
| Auteur | RSS entry.author | HTML meta author / schema.org |
| Date de publication | RSS published_parsed | HTML article:published_time |
| Langue détectée | py3langid + heuristique source | Langue déclarée de la source |

**Note implémentation** : `_extract_rss_summary` dans `collector.py` nettoie bien le HTML hors du bloc vide (le bug d’indentation historique est corrigé). La chaîne §2.1.5 est alignée sur le code : trafilatura `fetch_url` + `extract` (recall / precision), puis fetch direct + `extract`, puis RSS.

#### 2.1.6 Déduplication

**Niveau 1 — URL** : Hash SHA-256 de l'URL normalisée. Déjà implémenté, fonctionne.

**Niveau 2 — Contenu** (implémenté) : SimHash 64 bits sur extrait normalisé du **corps** (`simhash_dedupe.py`, seuil Hamming `body_simhash_max_hamming`). Les reprises proches sont marquées `is_syndicated` avec `canonical_article_id` vers l'article le plus ancien du groupe. **Évolution UX restante** : vue liste « une entrée visible » (groupement ou filtre reprises par défaut) — voir produit / `hide_syndicated` sur l'API liste articles.

#### 2.1.7 Santé des sources

**Healthcheck automatique** : Chaque run de collecte doit vérifier si chaque source active a produit au moins 1 article dans les dernières 72h. Si une source ne produit rien pendant 3 runs consécutifs, elle est automatiquement marquée `health_status: degraded` et un warning est affiché dans le dashboard. Après 7 jours sans article, `health_status: dead`.

**Métriques par source** (à stocker) :
- Nombre d'articles collectés par run
- Taux de réussite de l'extraction (trafilatura success rate)
- Taux de traduction réussie
- Dernière collecte réussie
- Temps moyen d'extraction

---

### 2.2 COUCHE 2 — Traduction & Enrichissement

#### 2.2.1 Objectif
Traduire chaque article en français, produire un résumé dense de 150-200 mots, extraire une phrase-thèse, classifier le type éditorial, et extraire les entités nommées — le tout en un seul appel LLM optimisé.

#### 2.2.2 Routage LLM par langue

**Principe** : Router chaque article vers le provider LLM le moins cher capable de produire un résultat de qualité suffisante pour cette langue.

| Langue source | Provider primaire | Modèle | Rationale |
|--------------|------------------|--------|-----------|
| Arabe (MSA) | Cerebras | Qwen 3 235B | Excellent multilingue, très rapide, quasi-gratuit |
| Persan | Cerebras | Qwen 3 235B | Correct, mais flaguer pour relecture humaine prioritaire |
| Turc | Cerebras | Qwen 3 235B | Bon sur le turc |
| Kurde | Anthropic | Claude Haiku 4.5 | Cerebras incertain sur le kurde, Claude plus fiable |
| Hébreu | Anthropic | Claude Haiku 4.5 | Seul provider fiable pour HE→FR |
| Anglais | Groq | Llama 4 Scout | Pas de traduction nécessaire, juste résumé/classification |
| Français | Groq | Llama 4 Scout | Pas de traduction, juste résumé/classification |

**Fallback universel** : Si le provider primaire échoue (timeout, rate limit, erreur), fallback vers Anthropic Claude Haiku qui gère toutes les langues.

**Spec critique — Détection de langue** : py3langid confond arabe et persan. Règle : si py3langid dit « arabe » mais que la source est iranienne (country_code=IR), overrider vers « persan ». Si py3langid dit « persan » mais la source est arabe, overrider vers « arabe ». La métadonnée de la source est plus fiable que le détecteur statistique pour les paires confuses (ar/fa, ar/ur).

#### 2.2.3 Prompt de traduction-enrichissement

**Sortie attendue** (JSON structuré, un seul appel) :

```
{
  "translated_title": "Titre traduit en français",
  "thesis_summary": "Phrase-thèse assertive de l'auteur en ≤ 20 mots",
  "summary_fr": "Résumé dense de 150-200 mots exactement",
  "key_quotes_fr": ["Citation 1 traduite", "Citation 2 traduite"],
  "article_type": "opinion|editorial|tribune|analysis|news|interview|reportage",
  "entities": [
    {"name": "nom original", "type": "PERSON|ORG|GPE|EVENT", "name_fr": "nom français"}
  ],
  "translation_notes": "difficultés éventuelles"
}
```

**Règles du résumé** :

1. **Ton** : Neutre, restitutif. Le résumé restitue l'argument de l'auteur sans le juger.
2. **Attribution** : Systématique. « L'auteur estime que… », « Selon le chroniqueur… », « L'éditorialiste du journal affirme que… ».
3. **Structure QQQOCP** : Les deux premières phrases répondent à Qui, Quoi, Quand, Où, Comment, Pourquoi.
4. **Présent de narration** comme temps principal.
5. **Guillemets français** « » pour toute citation traduite.
6. **Translittération simplifiée** des noms propres arabes/persans/hébreux.
7. **Pas de superlatifs** sauf citation directe.
8. **150-200 mots EXACTEMENT** — le LLM doit compter.

**Règles de la phrase-thèse** :

La phrase-thèse est **la conviction centrale de l'auteur en une phrase percutante**, comme s'il la prononçait. Ce n'est pas un résumé, c'est une affirmation. Exemples corrects :
- « La guerre contre les pays du Golfe est une hérésie »
- « Le régime iranien sortira encore plus radicalisé de cette guerre »
- « Le gouvernement israélien veut rétablir le Grand Israël, et voilà tout »

Exemples incorrects :
- « Analyse de la stratégie militaire américaine au Moyen-Orient » (c'est un titre, pas une thèse)
- « L'auteur examine les conséquences de la guerre » (c'est une description, pas une affirmation)

**Spec critique — Chain of Density** : Le prompt actuel simule Chain of Density en un seul appel (« suis ce processus mental »). Pour un produit parfait, implémenter le vrai Chain of Density itératif en 3 passes pour les articles les plus importants (score de pertinence > 80). Pour les articles standard, le prompt single-shot suffit. Coût additionnel : ~$0.012/article pour 3 passes vs $0.004 pour 1 passe. Sur 10 articles « top » par jour : +$0.08/jour, négligeable.

#### 2.2.4 Score de confiance

**Calculé côté serveur**, jamais auto-rapporté par le LLM. Composantes :

| Signal | Poids | Détail |
|--------|-------|--------|
| Longueur du contenu source | -0.30 si < 100 mots, -0.15 si < 300 mots | Articles courts = résumés moins fiables |
| Fallback RSS utilisé | -0.20 | Résumé RSS = moins de matière |
| Longueur du résumé produit | -0.30 si < 80 mots, -0.10 si < 140 mots | Résumé trop court = extraction ratée |
| Présence de la thèse | -0.10 si absente | Champ vide = le LLM n'a pas compris l'article |
| Présence de citations | -0.05 si aucune | Pas de citation = article peut-être mal extrait |
| Présence d'entités | -0.05 si aucune | Pas d'entité = article probablement trop court |
| Langue source difficile | -0.05 pour he, fa, ku | Traduction moins fiable |
| Article déjà en français | +0.05 | Pas de traduction, juste résumé |

**Seuils** :
- ≥ 0.70 → `translated` (prêt pour affichage)
- 0.50–0.69 → `needs_review` (affichage avec badge d'avertissement)
- < 0.50 → `low_quality` (masqué par défaut, visible avec toggle)

#### 2.2.5 Articles français — Traitement spécifique

Les articles de sources francophones (OLJ, Middle East Eye FR) n'ont pas besoin de traduction. Mais ils ont besoin de résumé, classification, extraction d'entités. Le prompt doit être adapté : pas de consigne de traduction, juste « Résume et classifie cet article francophone ».

**Spec critique** : Les articles anglais ne devraient PAS être traduits s'ils proviennent de sources où la version française existe (Middle East Eye a une version FR). Vérifier si l'article existe en FR avant de traduire depuis l'EN.

**Activation conditionnelle (P2)** : variable d’environnement optionnelle **`MEE_RSS_FR_URL`** (ou équivalent documenté dans `DEPLOY.md`) — tant qu’aucune URL de flux FR n’est fournie par l’OLJ, aucune collecte RSS FR dédiée Middle East Eye n’est branchée ; la détection URL FR côté traduction (`translator.py`) reste disponible.

#### 2.2.6 Optimisation des coûts

**Prompt caching** (Anthropic) : Le system prompt (~500 tokens) est identique pour tous les articles. Avec `cache_control: {"type": "ephemeral"}` sur le bloc system, Anthropic ne facture le system prompt qu'une fois par fenêtre de 5 minutes. Économie estimée : -45% sur les tokens d'entrée Anthropic.

**Batch API** (Anthropic) : Pour les articles non urgents (collectés la nuit, pas besoin du résultat avant 6h), utiliser l'API batch qui offre -50% sur le prix. Le pipeline de 06h00 utilise le batch pour les articles collectés entre 14h et 06h.

**Skip translation pour les articles anglais** : Si la revue de presse est en français mais que le journaliste OLJ lit l'anglais (ce qui est le cas), on peut envisager un mode « résumé FR + corps EN original accessible ». Ça divise par 2 le coût de traduction pour les ~60% d'articles en anglais. Question à valider avec Émilie.

---

### 2.3 COUCHE 3 — Intelligence Thématique (Clustering & Narrative)

C'est la couche qui fait la différence entre un agrégateur et un observatoire. C'est aussi la couche actuellement cassée.

#### 2.3.1 Objectif

Regrouper automatiquement les articles en sujets thématiques (« Conflit Iran-USA et sécurité énergétique », « Offensive terrestre israélienne au Liban sud », « Diplomatie qatarie de médiation ») et montrer pour chaque sujet **quels pays/médias en parlent et comment ils le cadrent différemment**.

#### 2.3.2 Pipeline de clustering — État de l'art 2026

Le pipeline standard validé par BERTopic (Maarten Grootendorst), par les benchmarks JITK (février 2026, Silhouette 0.215 / coherence 0.87), et par les guides HDBSCAN 2025 est :

**Embeddings → Réduction de dimensionnalité (UMAP) → Clustering (HDBSCAN) → Labelling (LLM)**

L'étape UMAP est **obligatoire**. Sans elle, HDBSCAN ne peut pas détecter de zones denses dans un espace de 1024 dimensions (malédiction de la dimensionnalité). C'est la raison pour laquelle le clustering actuel produit 638/640 articles en bruit.

#### 2.3.3 Embeddings

**Modèle** : Cohere `embed-multilingual-v3.0` (1024 dimensions)

**Pourquoi Cohere** :
- Entraîné sur des données multilingues équilibrées (pas English-dominant)
- Performances supérieures de 15-20% sur les langues non-latines (arabe, chinois, hindi) par rapport à OpenAI (benchmarks indépendants 2025)
- Support natif de la compression (int8 / binary) pour réduire le stockage
- Coût quasi-nul : ~$0.001/jour pour 300 articles

**Texte embeddé** : `"{titre_fr} — {résumé_fr}"` (le titre donne le sujet, le résumé donne le contexte). Ne PAS embedder le corps complet — trop de bruit, trop long, et le résumé est déjà une compression fidèle.

**Spec critique** : Ne PAS embedder les articles de type `news` ou `reportage` — uniquement `opinion`, `editorial`, `tribune`, `analysis`. Les news factuelles diluent les clusters thématiques parce qu'elles sont toutes sémantiquement proches (« même événement, même faits ») alors que les opinions divergent (« même événement, angles différents »). C'est déjà le comportement configuré (`embed_only_editorial_types=True`) mais doit être maintenu strictement.

#### 2.3.4 Réduction de dimensionnalité — UMAP

**Paramètres recommandés** :

```
UMAP(
  n_neighbors=15,      # Balance local/global : 15 est le sweet spot pour 500-1000 articles
  n_components=5,       # 5D suffit pour HDBSCAN, pas besoin de 2D (c'est pour la visu)
  min_dist=0.0,         # Clusters serrés = meilleure densité pour HDBSCAN
  metric='cosine',      # Cosine sur des embeddings normalisés = standard
  random_state=42       # Reproductibilité stricte
)
```

**Pourquoi `n_components=5` et pas 2** : 2D est pour la visualisation humaine. HDBSCAN travaille sur la densité et fonctionne mieux en 5D qu'en 2D parce qu'il y a plus d'information préservée. Les benchmarks BERTopic recommandent systématiquement 5.

**Pourquoi `min_dist=0.0`** : On veut des clusters aussi serrés que possible pour que HDBSCAN les détecte facilement. `min_dist=0.0` force UMAP à compresser les points similaires ensemble.

**Pourquoi `metric='cosine'`** : Les embeddings Cohere sont des vecteurs directionnels — la similarité cosinus est la mesure naturelle. Euclidienne après normalisation est équivalent, mais cosinus est plus explicite.

**Dépendance à ajouter** : `umap-learn>=0.5` dans `requirements.txt`. N'est PAS actuellement dans les dépendances.

#### 2.3.5 Clustering — HDBSCAN

**Paramètres recommandés** :

```
HDBSCAN(
  min_cluster_size=5,              # Minimum 5 articles pour former un sujet
  min_samples=3,                   # Densité minimale pour être considéré comme core point
  metric='euclidean',              # Euclidien APRÈS UMAP (en 5D, c'est correct)
  cluster_selection_method='leaf'  # Clusters plus fins et plus nombreux (vs 'eom')
)
```

**Pourquoi `cluster_selection_method='leaf'`** : Pour une revue de presse quotidienne, on veut des sujets granulaires (« frappes sur South Pars » vs « négociations de cessez-le-feu ») plutôt que des méga-sujets (« guerre Iran-USA »). `leaf` produit des clusters plus petits et plus spécifiques que `eom` (Excess of Mass).

**Pourquoi `min_cluster_size=5`** : Avec une fenêtre de 48h et ~100-200 articles éditoriaux, 5 est le bon seuil. En dessous, on crée des clusters de 2-3 articles qui ne sont pas de vrais sujets. Au-dessus, on fusionne des sujets distincts.

#### 2.3.6 Gestion du bruit (articles non-clusterisés)

Le bruit HDBSCAN est inévitable — certains articles sont des outliers thématiques (un éditorial sur l'éducation au Koweït pendant une semaine dominée par le conflit Iran-USA). Le taux de bruit cible est **10-25%** (pas 97% comme actuellement).

**Stratégie hybride HDBSCAN + K-means** (validée par les travaux MECS Press 2025 sur le clustering de posts Telegram) :

1. HDBSCAN identifie les clusters denses (les « vrais » sujets)
2. Pour les articles bruit, calculer la distance cosinus vers le centroïde de chaque cluster
3. Si la **similarité** cosinus vers le centroïde le plus proche dépasse un seuil (dans le code : `clustering_soft_assign_min_cosine`, défaut **0.65** = similarité directe sur embeddings normalisés), assigner l'article au cluster avec `cluster_soft_assigned=True`. La valeur **0.35** ci-dessus correspond à une formulation en **distance** (1 − similarité) dans certains documents ; ne pas la confondre avec le seuil de similarité dans `config.py`. Un second réglage expérimental `memw_compat_soft_cosine` peut être ajouté pour caler des tests sur d’autres métriques.
4. Si la distance est > seuil, l'article reste « non classé » — il apparaît dans une section séparée de l'interface

**Bénéfice** : Le journaliste ne voit pas 638 articles en vrac. Il voit 15-20 sujets thématiques bien définis + une poignée d'articles isolés qui méritent peut-être une attention individuelle.

#### 2.3.7 Labelling des clusters

**Méthode** : LLM (Groq Llama 3.3 ou Claude Haiku) sur les 5-8 premiers titres + débuts de résumé du cluster.

**Prompt de labelling** :

Le label doit être :
- **Court** : 6-14 mots maximum
- **Factuel** : pas de verbe conjugué (style manchette de journal)
- **Spécifique** : « Frappes sur les infrastructures énergétiques iraniennes et riposte sur le Qatar » plutôt que « Guerre au Moyen-Orient »
- **En français**

**Enrichissement du label** :
- Nombre d'articles dans le cluster
- Nombre de pays représentés
- Liste des pays (avec drapeaux emoji)
- Fenêtre temporelle (« depuis 2 jours » / « aujourd'hui »)

#### 2.3.8 Intelligence narrative — Au-delà du clustering (différenciateur produit)

C'est ce qui transforme un clustering basique en un observatoire des positions. Pour chaque cluster thématique, le système doit être capable de montrer :

**2.3.8.1 La matrice des positions par pays**

Pour chaque sujet, une vue qui montre côte à côte :
- 🇮🇱 Israël : « Netanyahu affirme qu'Israël gagne la guerre » (Jerusalem Post, opinion)
- 🇮🇷 Iran : « Le martyre renforce la résilience iranienne » (Tehran Times, éditorial)
- 🇸🇦 Arabie Saoudite : « Les objectifs de Trump restent flous » (Asharq Al-Awsat, analyse)
- 🇹🇷 Turquie : « La guerre frappe les économies asiatiques » (Daily Sabah, analyse)

Ce n'est pas juste un groupement — c'est une **mise en regard des cadrage narratifs** (framing analysis). Le système ne dit pas qui a raison. Il montre comment le même événement est présenté différemment selon la perspective géographique et éditoriale.

**2.3.8.2 Détection de cadrage (framing)**

Pour chaque article dans un cluster, extraire automatiquement via LLM :

| Dimension | Question | Exemple |
|-----------|----------|---------|
| **Acteur principal** | Qui est présenté comme l'acteur central ? | « L'Iran » vs « Les États-Unis » vs « Israël » |
| **Cadrage causal** | Quelle est la cause attribuée ? | « Agression israélienne » vs « Riposte légitime » vs « Escalade mutuelle » |
| **Tonalité évaluative** | L'auteur approuve-t-il, condamne-t-il, ou reste-t-il neutre ? | Approbation / Condamnation / Neutre-analytique |
| **Victimisation** | Qui est présenté comme victime ? | « Le peuple iranien » vs « Les civils du Golfe » vs « Les marins » |
| **Prescription** | Que faudrait-il faire selon l'auteur ? | « Négocier » vs « Intensifier les frappes » vs « Sanctions » |

Ce n'est pas du sentiment analysis basique (positif/négatif). C'est de l'**analyse de cadrage narratif** (narrative framing analysis), un champ de recherche actif en computational journalism (ACL 2025, Frontiers in Political Science 2025). Le LLM peut extraire ces dimensions avec un prompt structuré sans fine-tuning.

**Coût** : Un appel LLM supplémentaire par article (~$0.003 avec Haiku). Pour 100 articles éditoriaux/jour : $0.30/jour. C'est le coût d'un cadrage narratif automatique complet.

**2.3.8.3 Signaux faibles et émergence**

Détecter les sujets qui « montent » : un thème qui n'existait pas hier et qui apparaît aujourd'hui dans 3+ sources de pays différents. Concrètement :
- Comparer les clusters du jour J avec ceux du jour J-1
- Si un cluster J n'a pas d'équivalent sémantique à J-1 (distance cosinus entre centroïdes > 0.4), c'est un sujet **émergent**
- Afficher un badge « Nouveau sujet » dans l'interface

---

### 2.4 COUCHE 4 — Génération de la revue de presse

#### 2.4.1 Objectif
Produire un texte prêt à copier-coller dans le CMS OLJ, au format exact demandé par Émilie, pour les articles sélectionnés par le journaliste.

#### 2.4.2 Format de sortie — Spécification exacte

Le livrable de l'IA est un **seul bloc de texte continu** qui enchaîne les blocs article. Le journaliste ajoute ensuite son propre titre général et chapeau.

Pour chaque article sélectionné, le bloc suit exactement ce format :

```
« [Phrase-thèse assertive et percutante, comme si l'auteur la prononçait] »

Résumé : [Résumé de 150-200 mots exactement. Ton neutre, restitutif.
Français soutenu mais accessible. Présent de narration. Attribution systématique.
Guillemets français « » pour les citations traduites.]

Fiche :
Article publié dans [nom exact du média]
Le [JJ mois AAAA en toutes lettres]
Langue originale : [langue en français]
Pays du média : [pays en français]
Nom de l'auteur : [Prénom Nom ou « Éditorial non signé »]
```

**Séparateur entre blocs** : Deux sauts de ligne simples. Pas de séparateur visuel (pas de `---`, pas de `***`), pas de numérotation.

**Ce que l'IA ne génère PAS** :
- Le titre général de la revue (fait par l'humain)
- Le chapeau d'introduction (fait par l'humain)
- Le choix des articles (fait par l'humain)
- Les commentaires ou opinions sur les articles

#### 2.4.3 Modèle de génération

**Pour le formatage OLJ** : Claude Sonnet 4.5 (pas Llama 3.3). La qualité du français, la capacité à produire des titres-thèses percutants en français journalistique soutenu, et la fiabilité du suivi d'instructions complexes justifient le surcoût. On ne génère que 3-5 blocs par jour — le coût total est de ~$0.15/jour en Sonnet, vs ~$0.02 en Llama 3.3. La différence est négligeable et la qualité perceptible.

**Alternative acceptable** : Llama 3.3 70B via Groq POUR LE RÉSUMÉ, puis Claude Sonnet UNIQUEMENT pour le titre-thèse. Ça réduit le coût Anthropic au strict minimum tout en gardant la qualité sur la partie la plus visible (le titre entre guillemets).

#### 2.4.4 Validation post-génération

Après chaque bloc généré, vérifier :

| Critère | Action si échec |
|---------|----------------|
| Word count résumé entre 140-220 | Retry avec prompt de correction |
| Présence des guillemets « » dans le titre | Ajouter automatiquement |
| Format de la fiche complet | Retry |
| Pas de texte en langue étrangère (hors noms propres) | Warning |
| Présence du mot « Résumé : » | Ajouter automatiquement |

#### 2.4.5 Copier-coller

Le bouton « Copier » doit produire du **texte brut** (pas de HTML, pas de Markdown). Le journaliste colle dans le CMS OLJ qui a son propre éditeur de mise en page. Si le texte copié contient des balises HTML ou des astérisques Markdown, ça casse la mise en page du CMS.

---

### 2.5 COUCHE 5 — Interface Journaliste (UX)

#### 2.5.1 Principe directeur

L'interface est conçue pour **un journaliste pressé qui a 30 minutes pour produire sa revue de presse quotidienne**. Chaque clic, chaque scroll, chaque décision doit être justifié par un gain de temps ou de compréhension. Aucun élément technique visible (pas de scores numériques, pas de noms de modèles, pas de JSON).

#### 2.5.2 Page d'accueil — Sujets du jour

C'est la porte d'entrée quotidienne du journaliste. Il arrive, il voit immédiatement les 10-20 sujets du jour.

**Structure** :

```
┌──────────────────────────────────────────────┐
│  L'ORIENT-LE JOUR — Revue de presse          │
│  Sujets | Articles | Revue de presse         │
├──────────────────────────────────────────────┤
│  Jeudi 20 mars 2026 · 18 sujets · 142 articles│
├──────────────────────────────────────────────┤
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ Guerre Iran — États-Unis et sécurité    │ │
│  │ énergétique mondiale                    │ │
│  │ 10 articles · 4 pays                   │ │
│  │ 🇸🇦 🇦🇪 🇶🇦 🇹🇷                           │ │
│  │                                         │ │
│  │ • « Le Pentagone cherche 200 Mds$ »     │ │
│  │   Asharq Al-Awsat · Analyse             │ │
│  │ • « Chute de 95% du trafic Hormuz »     │ │
│  │   Gulf News · Analyse                   │ │
│  │ • « Trump s'enfonce dans Hormuz »       │ │
│  │   The National · Opinion                │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ 🆕 Divergences tactiques USA-Israël     │ │
│  │ sur la stratégie iranienne              │ │
│  │ 6 articles · 2 pays                     │ │
│  │ 🇸🇦 🇮🇶                                  │ │
│  │                                         │ │
│  │ • « Netanyahu affirme gagner la guerre » │ │
│  │   Arab News · Opinion                   │ │
│  │ • « Les objectifs de Trump restent flous»│ │
│  │   Asharq Al-Awsat · Analyse             │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  + 12 articles non classés                  │
└──────────────────────────────────────────────┘
```

**Éléments clés** :
- Chaque carte de sujet montre les 2-3 premiers titres-thèses, pas juste le label
- Les drapeaux des pays donnent immédiatement la diversité géographique
- Le badge 🆕 signale un sujet émergent (pas vu la veille)
- Le nombre d'articles et de pays est visible sans cliquer

#### 2.5.3 Page de sujet — Vue par pays

Quand le journaliste clique sur un sujet, il voit les articles groupés par pays :

```
← Sujets du jour

Guerre Iran — États-Unis et sécurité
énergétique mondiale
10 articles · 4 pays

┌─ 🇸🇦 ARABIE SAOUDITE ───────────────────────┐
│                                              │
│ ☐ « Le Pentagone cherche 200 Mds$ de fonds  │
│    supplémentaires pour la guerre »          │
│    Asharq Al-Awsat · 19/03 · Analyse         │
│    L'analyste rapporte que le trafic          │
│    maritime dans le détroit d'Hormuz a chuté  │
│    de 95% depuis le début…                   │
│                                              │
├─ 🇦🇪 ÉMIRATS ARABES UNIS ───────────────────┤
│                                              │
│ ☐ « Chute de 95% du trafic dans le détroit  │
│    d'Hormuz en raison de la guerre »         │
│    Gulf News · 20/03 · Analyse               │
│    Le détroit d'Hormuz, voie cruciale pour   │
│    les approvisionnements énergétiques…      │
│                                              │
│ ☐ « Trump s'enfonce dans le détroit          │
│    d'Hormuz »                                │
│    The National · 13/03 · Opinion             │
│    Le président américain Donald Trump a      │
│    déclaré que le détroit d'Hormuz est en…   │
│                                              │
├──────────────────────────────────────────────┤
│              [3 articles sélectionnés]        │
│              [Générer la revue →]             │
└──────────────────────────────────────────────┘
```

**Éléments clés** :
- Chaque article montre le titre-thèse entre guillemets (pas le titre original traduit)
- Les 2-3 premières lignes du résumé sont visibles SANS CLIQUER
- Le checkbox est directement sur la ligne
- Le panier de sélection est toujours visible en bas
- Les articles sont triés par date (plus récent en haut) dans chaque section pays

#### 2.5.4 Page Articles — Vue plate (alternative)

Pour le journaliste qui préfère parcourir tout sans clustering, une vue plate avec filtres intelligents :

**Filtres pré-configurés par défaut** :
- Types : opinion, editorial, tribune, analysis (cochés)
- Confiance : ≥ 70% (slider)
- Fenêtre : 48h (dernier 2 jours)
- Pays : tous

**Compteurs dans les filtres** : Chaque filtre pays affiche le nombre d'articles correspondants. « Israël (23) », « Iran (15) », « EAU (12) ». Ça permet de voir d'un coup d'œil la distribution.

**Hiérarchie visuelle** :
- Les opinions et éditoriaux ont un traitement visuel plus proéminent (titre en police serif plus grande, type en rouge)
- Les analyses sont en taille normale
- Les news sont en petite taille, grisées

**Aperçu enrichi par article** :
- Titre-thèse en gras
- Source + pays + date + type
- 2-3 premières lignes du résumé
- Score de pertinence (discret, en petit)
- Pas de score de confiance sauf si < 70% (badge d'avertissement)

#### 2.5.5 Page Revue de presse — Génération et historique

**Section Sélection** : Liste ordonnée des articles sélectionnés (drag & drop pour réordonner). Bouton « Retirer » sur chaque article.

**Bouton Générer** : Lance la génération. Temps estimé affiché (« ~15 secondes pour 4 articles »). Barre de progression.

**Section Texte généré** :
- Aperçu formaté (police serif, espacement éditorial)
- Bouton « Copier le texte » (copie en texte brut, pas en HTML)
- Bouton « Télécharger .txt »
- Le texte est directement éditable dans l'interface (contenteditable) pour des corrections mineures avant copie

**Historique** : Les 30 dernières revues générées, accessibles d'un clic. Permet de reprendre une revue de la veille si besoin.

#### 2.5.6 Design system

- **Typographie** : Poynter OS Display (titres, thèses) + Inter (UI, métadonnées). La police Poynter donne l'identité OLJ.
- **Couleurs** : Blanc (#FFFFFF) fond, noir (#1A1A1A) texte, rouge OLJ (#C8102E) accents et boutons d'action, gris (#888) métadonnées secondaires.
- **Pas de dark mode** : OLJ est un journal papier numérisé, le blanc est son identité.
- **Responsive** : Doit fonctionner sur tablette (le journaliste peut parcourir sur iPad le matin).

---

## 3. MODÈLE DE DONNÉES

### 3.1 Tables essentielles

| Table | Rôle | Cardinalité estimée |
|-------|------|-------------------|
| `media_sources` | Registre des 42 médias | ~42 lignes, quasi-statique |
| `articles` | Tous les articles collectés | ~200/jour, ~6000/mois |
| `topic_clusters` | Sujets thématiques quotidiens | ~20/jour, renouvelés |
| `reviews` | Revues de presse générées | ~1/jour |
| `review_items` | Lien revue ↔ articles | ~5/revue |
| `entities` | Entités nommées (NER) | ~500/jour |
| `article_entities` | Lien article ↔ entité | ~3/article |
| `collection_logs` | Logs de collecte par source | ~42/run, 2 runs/jour |

### 3.2 Colonnes article — Exhaustives

| Colonne | Type | Détail |
|---------|------|--------|
| `id` | UUID | PK |
| `media_source_id` | FK → media_sources | Source du média |
| `url` | VARCHAR(2000) | URL de l'article |
| `url_hash` | VARCHAR(64) | SHA-256 pour dédup |
| `title_original` | TEXT | Titre dans la langue d'origine |
| `content_original` | TEXT | Corps complet langue d'origine |
| `author` | VARCHAR(500) | Nom de l'auteur |
| `published_at` | TIMESTAMPTZ | Date de publication |
| `source_language` | VARCHAR(10) | Code langue détecté |
| `title_fr` | TEXT | Titre traduit FR |
| `thesis_summary_fr` | TEXT | Phrase-thèse percutante |
| `summary_fr` | TEXT | Résumé 150-200 mots |
| `key_quotes_fr` | TEXT[] | Citations traduites |
| `article_type` | VARCHAR(30) | opinion/editorial/tribune/analysis/news... |
| `translation_confidence` | FLOAT | Score 0-1 calculé serveur |
| `olj_formatted_block` | TEXT | Bloc formaté prêt à copier |
| `embedding` | VECTOR(1024) | Embedding Cohere |
| `cluster_id` | FK → topic_clusters | Cluster assigné |
| `framing_actor` | VARCHAR(200) | Acteur principal du cadrage |
| `framing_tone` | VARCHAR(30) | approval/condemnation/neutral |
| `framing_prescription` | TEXT | Ce que l'auteur recommande |
| `is_syndicated` | BOOLEAN | Reprise d'agence détectée |
| `canonical_article_id` | FK → articles | Article original si syndiqué |
| `status` | VARCHAR(20) | collected/translated/formatted/error... |
| `word_count` | INTEGER | Mots dans le corps |
| `collected_at` | TIMESTAMPTZ | Horodatage de collecte |
| `processed_at` | TIMESTAMPTZ | Horodatage de traduction |

---

## 4. INFRASTRUCTURE & DÉPLOIEMENT

### 4.1 Stack technique

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| Backend | Python 3.11 / FastAPI / SQLAlchemy async | Écosystème NLP mature, async natif |
| Base de données | PostgreSQL 16 + pgvector 0.7 | Vecteurs + relationnel dans une seule DB |
| Frontend | Next.js 15 / React 19 / Tailwind CSS 4 | SSR, performance, design system |
| Embeddings | Cohere embed-multilingual-v3.0 | Meilleur multilingue, compressible |
| Clustering | UMAP + HDBSCAN | Standard BERTopic validé |
| LLM traduction | Groq (Llama 4 Scout) + Cerebras (Qwen 3 235B) + Anthropic (Claude Haiku 4.5) | Multi-provider = résilience + coût |
| LLM génération | Anthropic Claude Sonnet 4.5 | Qualité français journalistique |
| Collecte | trafilatura 2.0 + feedparser + Playwright | État de l'art extraction web |
| Scheduling | APScheduler | Cron 2x/jour (06h + 14h UTC) |
| Déploiement | Railway (Hobby/Pro) | Simple, pas cher, auto-deploy Git |

### 4.2 Budget mensuel estimé

| Poste | 50 art/jour | 100 art/jour | 200 art/jour |
|-------|------------|-------------|-------------|
| Railway (DB + Backend + Frontend) | ~$15 | ~$20 | ~$30 |
| Cohere embeddings | ~$1 | ~$2 | ~$4 |
| LLM traduction (Groq + Cerebras + Anthropic) | ~$8 | ~$15 | ~$28 |
| LLM génération OLJ (Claude Sonnet, 5 articles/jour) | ~$5 | ~$5 | ~$5 |
| LLM labelling clusters | ~$2 | ~$3 | ~$5 |
| **TOTAL** | **~$31/mois** | **~$45/mois** | **~$72/mois** |

Avec prompt caching Anthropic (-45% sur inputs) et Batch API (-50% sur non-urgent), le total baisse de ~35%.

---

## 5. ROADMAP D'IMPLÉMENTATION

### Phase 1 — MVP Démontrable (3-5 jours)

**Objectif** : Avoir un produit fonctionnel à montrer à Émilie.

1. Fix UMAP dans clustering (ajouter `umap-learn`, 15 lignes dans `clustering_service.py`)
2. Fix bug indentation `_extract_rss_summary` (5 min)
3. Valider qualité français de la génération sur 10 articles réels
4. Ajuster les filtres par défaut dans l'UX (opinion/editorial/tribune/analysis, confiance ≥ 70%)
5. Ajouter aperçu résumé (2-3 lignes) dans les cartes article
6. Tester le flux complet : collecte → traduction → clustering → sélection → génération → copie

### Phase 2 — Intégration OLJ (1-2 semaines après le call)

**Objectif** : Adapter le système aux sources fournies par OLJ.

1. Intégrer la liste de médias fournie par OLJ (remplacer/compléter MEDIA_REGISTRY)
2. Trouver les flux RSS opinion dédiés pour chaque source OLJ
3. Calibrer les prompts sur des vrais articles OLJ (pas du Lorem Ipsum)
4. Mettre en production sur Railway avec accès OLJ
5. Itérer sur la qualité des résumés avec le journaliste utilisateur

### Phase 3 — Intelligence Narrative (semaines 3-6)

**Objectif** : Transformer l'outil en observatoire des positions.

1. Implémenter la matrice des positions par pays (framing analysis)
2. Détection de sujets émergents (badge 🆕)
3. Déduplication sémantique (SimHash)
4. Healthcheck automatique des sources
5. Chain of Density vrai itératif pour les articles top

### Phase 4 — Robustesse & Scale (mois 2-3)

**Objectif** : Produit stable et autonome.

1. Playwright pour les sources SPA manquantes (Arab News, Khaleej Times, Jordan Times, Peninsula Qatar)
2. Prompt caching Anthropic + Batch API
3. Analytics d'usage (quels sujets/pays sont les plus sélectionnés)
4. Alertes automatiques (sujet chaud, source down)
5. Export en formats multiples (CMS, newsletter, PDF)

---

## 6. CE QUI DIFFÉRENCIE CE PRODUIT

### Par rapport aux outils existants (Meltwater, Brandwatch, PeakMetrics)

Ces outils coûtent $10,000-$50,000/an et sont conçus pour le PR/marketing. Ils ne font PAS :
- Traduction éditoriale multilingue MENA (7 langues → FR)
- Résumés au format journalistique OLJ
- Mise en regard des positions éditoriales par pays
- Génération de texte prêt-à-publier

### Par rapport à une veille manuelle par le journaliste

Le journaliste OLJ devrait sinon :
- Ouvrir 30+ sites dans 5 langues chaque matin
- Lire ou Google-Translate chaque article
- Prendre des notes, résumer manuellement
- Formater le tout dans le CMS
- Temps estimé : 3-4 heures/jour

Avec ce produit : **30 minutes** (5 min de parcours des sujets, 5 min de sélection, 15 min de relecture du texte généré, 5 min de finalisation dans le CMS).

### Par rapport à un simple agrégateur + traduction automatique

Un agrégateur + DeepL donne une liste d'articles traduits. Ce produit donne :
- Des **sujets structurés** (pas une liste plate)
- Des **positions mises en regard** (pas des articles isolés)
- Un **texte éditorial formaté** (pas une traduction brute)
- Un **filtre de qualité** (pas du bruit factuel)
