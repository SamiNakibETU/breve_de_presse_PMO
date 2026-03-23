# AUDIT PIPELINE MEMW — 23 mars 2026

**Objectif** : corriger les imperfections avant le run automatique de lundi matin.  
**Base** : code du dépôt `v2/media-watch` (fourni intégralement) + dashboard staging du 22 mars.

---

## 0. Le pipeline tourne-t-il automatiquement le week-end ?

**OUI.** Fichier `backend/src/services/scheduler.py` lignes 53-71 :

```python
scheduler.add_job(
    daily_pipeline,
    trigger=CronTrigger(hour=settings.collection_hour_utc, minute=0),  # 06:00 UTC
    id="daily_pipeline_morning",
)
scheduler.add_job(
    daily_pipeline,
    trigger=CronTrigger(hour=14, minute=0),  # 14:00 UTC
    id="daily_pipeline_afternoon",
)
```

Le scheduler APScheduler tourne dans le processus FastAPI sur Railway. Il exécute `daily_pipeline()` à **06:00 UTC** et **14:00 UTC** tous les jours, samedi et dimanche inclus. Le pipeline fait : collecte → traduction → embedding → clustering → labelling.

**Résultat** : lundi matin, les articles du week-end auront été collectés et traités. Le journaliste verra les sujets du week-end.

---

## 1. PROBLÈME CRITIQUE — Pas de UMAP (cause du méga-cluster)

### Diagnostic

Fichier : `backend/src/services/clustering_service.py`

Le clustering fait HDBSCAN **directement sur les embeddings 1024d normalisés** :

```python
X = np.array(embeddings)
norms = np.linalg.norm(X, axis=1, keepdims=True)
norms[norms == 0] = 1
X_norm = X / norms

clusterer = hdbscan.HDBSCAN(
    min_cluster_size=self.min_cluster_size,  # 6 (config.py)
    min_samples=self.min_samples,            # 5 (config.py)
    metric="euclidean",
    cluster_selection_method=self.cluster_method,  # "leaf"
)
labels = clusterer.fit_predict(X_norm)
```

**Pas de UMAP.** La spec v3 (Sprint 4) et la Product Spec v2 (Section 4.2) exigent UMAP `n_components=15` avant HDBSCAN. Sans réduction dimensionnelle, sur 1024d, la malédiction de la dimensionnalité rend les distances euclidéennes quasi-uniformes → HDBSCAN ne distingue pas les vrais clusters.

### Fix

Fichier : `backend/requirements.txt` — ajouter :
```
umap-learn>=0.5
```

Fichier : `backend/src/services/clustering_service.py` — dans `cluster_embeddings()`, avant HDBSCAN :

```python
import umap

# Réduction UMAP avant HDBSCAN
reducer = umap.UMAP(
    n_components=15,
    n_neighbors=15,
    min_dist=0.1,
    metric='cosine',
    random_state=42,
)
X_reduced = reducer.fit_transform(X_norm)

clusterer = hdbscan.HDBSCAN(
    min_cluster_size=self.min_cluster_size,
    min_samples=self.min_samples,
    metric="euclidean",  # euclidean sur les coordonnées UMAP
    cluster_selection_method=self.cluster_method,
)
labels = clusterer.fit_predict(X_reduced)  # <-- X_reduced, pas X_norm
```

**Impact** : le run passe de 1 méga-cluster + 1068 orphelins → 8-15 clusters propres de 3-10 articles.

### Aussi : baisser les paramètres HDBSCAN

Fichier : `backend/src/config.py` :

```python
hdbscan_min_cluster_size: int = Field(default=6)   # → changer à 3
hdbscan_min_samples: int = Field(default=5)         # → changer à 2
```

Avec un corpus post-filtre de ~100-150 articles, `min_cluster_size=6` et `min_samples=5` sont trop agressifs. Baisser à 3 et 2 respectivement.

---

## 2. PROBLÈME CRITIQUE — Pas de filtre de pertinence LLM (Prompt 5)

### Diagnostic

Le Prompt 5 (`prompt_relevance_score_v2`) est défini dans `MEMW_PROMPT_SUITE_v2.md` mais **n'est PAS implémenté dans le code**. Le fichier `backend/src/services/relevance_scorer.py` **n'existe pas**.

Le seul filtre est `editorial_scope.py` qui fait du matching de sous-chaînes. Il attrape "voyage en Turquie" mais rate :
- **Sport turc** (basket, volley, foot turc) — aucun mot-clé sport en turc
- **Cinéma** (Franz Kafka film) — aucun mot-clé cinéma/film
- **Herméneutique islamique** (sagesse, conscience) — aucun filtre religion non-politique
- **Hommages funéraires** (mort d'une mère, mémorial) — aucun filtre nécrologie

### Fix (2 niveaux)

**Niveau 1 — Immédiat (extend `editorial_scope.py`)** :

Ajouter à `LEISURE_SUBSTRINGS` dans `editorial_scope.py` :

```python
LEISURE_SUBSTRINGS: tuple[str, ...] = (
    # ... existants ...
    # SPORT
    "basketball", "football match", "volleyball", "tennis ",
    "super lig", "euroleague", "basket turc",
    "süper lig", "basketbol", "voleybol",
    "world cup qualif", "uefa", "fifa",
    # CINEMA / CULTURE pure
    "film review", "movie review", "book review",
    "oscar ", "grammy ", "emmy ",
    "box office", "film festival",
    "sinema", "film eleştiri",
    # RELIGION non-politique
    "ramadan recipe", "iftar ", "horoscope",
    "zodiac", "astrology",
    "coiffure", "hairstyle", "saç modeli",
    "mariage", "wedding", "düğün",
    "تسريحات شعر", "أبراج", "وصفات رمضان",
)
```

**Niveau 2 — Sprint 2 (relevance_scorer.py)** :

Créer `backend/src/services/relevance_scorer.py` avec Prompt 5 de la suite v2. Exécuté après traduction, avant embedding. Articles avec `relevance_band == "out_of_scope"` exclus du clustering.

Coût : ~$0.15/run pour 300 articles via Haiku.

---

## 3. PROBLÈME IMPORTANT — Auteurs : "l'auteur" au lieu du nom réel

### Diagnostic

Deux sources du problème :

**Source A — Le prompt de génération (generator.py)** utilise un system prompt qui dit :

```
Si opinion/tribune : "L'auteur estime que...", "Selon le chroniqueur..."
```

C'est **correct pour le résumé** (ton neutre), mais la **phrase-thèse** devrait nommer l'auteur. Le format v2 (PROMPT_SUITE_v2.md, Prompt 4) est :

```
« [Thèse] », écrit [Prénom Nom / "l'éditorialiste" / "l'analyste"] dans [Nom du média] ([Pays]).
```

Or le code actuel (generator.py ligne 107-110) produit :

```
« [Phrase-thèse percutante qui capture la conviction de l'auteur] »
```

→ Pas d'attribution dans la thèse. L'attribution est seulement dans la Fiche en dessous.

**Source B — `article.author` est souvent null ou "author"**

Le dashboard montre un article Asharq Al-Awsat avec `author: "author"` (visible dans `exemple_revue.txt` : "Nom de l'auteur : author"). La blacklist dans `collector.py` contient `"author"` mais le check est case-sensitive et compare en lowercase. Le problème vient probablement du scraping HTML qui extrait "Author" (avec majuscule) d'un meta tag, et la comparaison `.lower()` le rejette... sauf si l'extraction HTML retourne le mot tel quel.

Vérifions : dans `collector.py` ligne 43 :
```python
if author and author.lower() in GENERIC_AUTHOR_BLACKLIST:
    return None
```

Ça devrait catcher "Author" → "author". Mais dans `web_scraper.py` et `playwright_scraper.py`, la blacklist est dupliquée mais la logique est identique. Le problème est donc **en amont** — certains RSS feeds retournent le nom de l'auteur comme "author" littéralement (un bug du CMS source).

### Fix

**Fix A — Prompt de génération** : Modifier `OLJ_SYSTEM_PROMPT` dans `generator.py` pour exiger l'attribution dans la thèse :

Remplacer :
```
1. Le titre entre « » est UNE PHRASE assertive qui capture la conviction de l'auteur
```

Par :
```
1. Le titre entre « » est UNE PHRASE-THÈSE assertive suivie de l'attribution.
   Format EXACT : « [Thèse] », écrit [Auteur] dans [Média] ([Pays]).
   Si l'auteur est inconnu : « [Thèse] », écrit la rédaction de [Média] ([Pays]).
   Exemples corrects :
   « La guerre contre les pays du Golfe est une hérésie », écrit Hussein Farhat dans al-Majalla (Arabie saoudite).
   « Le régime iranien sortira encore plus radicalisé de cette guerre », écrit la rédaction d'Al-Akhbar (Liban).
```

**Fix B — Nettoyage author** : Dans `generator.py`, fonction `generate_block()`, ajouter un nettoyage :

```python
author_display = article.author
if not author_display or author_display.lower().strip() in {
    "author", "admin", "staff", "editor", "desk", "correspondent",
    "news desk", "editorial", "web editor", "agency",
}:
    author_display = "Éditorial non signé"
```

**Fix C — Vérifier `clean_author_for_display`** : Si cette fonction existe (mentionnée dans la spec v3 Sprint 8), s'assurer qu'elle strip aussi les URLs qui apparaissent parfois dans le champ auteur (ex: "https://www.arabnews.com/author/arab-news").

---

## 4. PROBLÈME IMPORTANT — Prompts non alignés avec la suite v2

### Diagnostic

Le code utilise des prompts **hardcodés dans le Python**, pas les prompts YAML de la suite v2 :

| Prompt | Version dans le code | Version dans la spec v2 | Écart |
|--------|---------------------|------------------------|-------|
| Traduction (translator.py) | Ancien format JSON task/required_output | XML tags, thesis_sentence, quality_flags, detected_entities | **MAJEUR** |
| Labelling (cluster_labeller.py) | Prompt inline correct | Structured output JSON | Mineur |
| Génération (generator.py) | Per-article, ancien format | Per-topic, transitions, Chain of Density | **MAJEUR** |
| Curateur | Non implémenté | Prompt 3 complet | Sprint 5 |
| Pertinence | Non implémenté | Prompt 5 complet | Sprint 2 |

### Impact immédiat

Le traducteur ne produit pas `thesis_sentence` dans le format v2 :
```
« Téhéran refuse toute négociation sous contrainte », écrit Mohammad Javad dans le Tehran Times.
```

Au lieu de ça, il produit `thesis_summary` qui est juste un résumé en une phrase, sans attribution ni guillemets.

### Fix

**Court terme (avant lundi)** : pas de fix possible sans refactoring majeur du translator. Le format actuel fonctionne, il est juste moins bon.

**Moyen terme (Sprint 7)** : migrer tous les prompts vers YAML dans `backend/config/prompts/` et aligner avec la suite v2.

---

## 5. Cohérence sémantique des clusters : problèmes identifiés

### Problème 5.1 — Le méga-cluster « Revue de presse Golfe, Iran, Syrie et Liban » (218 articles)

**Cause** : HDBSCAN sur 1024d sans UMAP. Résolu par le fix #1 ci-dessus.

### Problème 5.2 — Clusters thématiquement incohérents

Le cluster « Hommages à Fahd ben Mahmoud et figures historiques » mélange :
- Un article omanais sur la mort d'une mère (nécrologie/poésie)
- Un article turc sur Fahrettin Paşa et le trésor de Médine (histoire ottomane)

**Cause** : les embeddings Cohere multilingues projettent ces articles proches parce qu'ils partagent le champ sémantique « mort / mémoire / hommage ». Sans filtre de pertinence, ils entrent dans le clustering.

**Fix** : le relevance scorer (fix #2) les exclura. Score attendu :
- « La mort d'une mère laisse un vide indicible » → 0.10 (out_of_scope)
- « Fahrettin Paşa sauve le trésor de Médine » → 0.35 (out_of_scope — histoire, pas géopolitique actuelle)

### Problème 5.3 — Label du cluster trop vague ou trompeur

Le label « Réflexions spirituelles et herméneutiques islamiques » est trop vague pour être utile. Le labeller LLM produit des labels corrects mais le contenu sous-jacent est hors-sujet.

**Fix** : le labeller dans `cluster_labeller.py` a déjà une logique pour détecter les labels lifestyle et les remplacer par « Hors périmètre ». Étendre cette logique pour détecter aussi les labels religion/sport/culture :

```python
REJECT_PATTERNS = [
    "sport", "basket", "football", "volley",
    "cinéma", "film", "littérature", "musique",
    "spirituel", "herméneutique", "ramadan",
    "hommage", "nécrologie", "funérailles",
]

for pattern in REJECT_PATTERNS:
    if pattern in cleaned.lower():
        cleaned = "Hors périmètre revue (non-géopolitique) — exclure de la veille"
        break
```

---

## 6. Sources — 0 traductions en 24h

Le dashboard montre que presque toutes les sources ont **0 traductions enregistrées (24h)** même quand elles ont des articles collectés. Exemples :
- Al Jazeera : 63 articles collectés, 0 traductions
- Annahar : 20 articles, 0 traductions
- Haaretz : 33 articles, 8 traductions
- Gulf Times : 28 articles, 8 traductions

**Cause probable** : le pipeline du scheduler fait `collect → translate → embed → cluster`. Si la traduction échoue en masse (timeout LLM, erreur de parsing JSON, rate limiting Groq/Cerebras), les articles restent en statut `collected` sans passer à `translated`.

**Diagnostic** : vérifier les logs Railway pour les erreurs `translation.article_error`. Causes courantes :
1. Rate limiting Groq/Cerebras (trop de requêtes simultanées)
2. Contenu trop court (< 30 mots) → skipped
3. Erreur de parsing JSON du LLM → article en statut `error`

**Fix** : dans `translator.py`, le semaphore est `asyncio.Semaphore(2)` — c'est conservatif mais correct. Vérifier que les clés API Groq/Cerebras sont bien configurées sur Railway.

---

## 7. Génération per-article vs per-topic

### Diagnostic

Le code actuel (`generator.py`) génère **un bloc par article** indépendamment. Le format v2 (Prompt 4 de la suite) génère **un bloc par sujet** avec transitions entre articles.

**Impact** : pas de transitions (« À rebours de cette lecture, ... ») entre les articles de la revue finale. Le texte est une série de blocs déconnectés.

### Fix (Sprint 7)

Refactorer `generator.py` pour accepter une liste d'articles groupés par sujet et générer le texte avec transitions. C'est un changement significatif — pas faisable avant lundi.

---

## 8. Checklist des corrections prioritaires avant lundi

Par ordre d'impact décroissant :

| # | Fix | Fichier | Impact | Effort |
|---|-----|---------|--------|--------|
| 1 | Ajouter UMAP avant HDBSCAN | `clustering_service.py` + `requirements.txt` | **CRITIQUE** — résout le méga-cluster | 30 min |
| 2 | Baisser `min_cluster_size` à 3, `min_samples` à 2 | `config.py` ou env vars Railway | **HAUT** — moins de bruit, plus de clusters | 5 min |
| 3 | Étendre `LEISURE_SUBSTRINGS` (sport, cinéma, religion) | `editorial_scope.py` | **HAUT** — filtre le sport turc etc. | 15 min |
| 4 | Fix attribution auteur dans la phrase-thèse | `generator.py` system prompt | **MOYEN** — "l'auteur" → nom réel | 10 min |
| 5 | Nettoyage "author" littéral dans le champ auteur | `generator.py` | **MOYEN** — évite "Nom de l'auteur: author" | 5 min |
| 6 | Reject patterns dans le labeller | `cluster_labeller.py` | **BAS** — meilleure exclusion des clusters hors-sujet | 10 min |
| 7 | Vérifier clés API LLM sur Railway | Dashboard Railway | **HAUT** — si traductions à 0, tout le pipeline échoue | 5 min |

### Env vars Railway à ajouter/vérifier :

```
HDBSCAN_MIN_CLUSTER_SIZE=3
HDBSCAN_MIN_SAMPLES=2
CLUSTERING_WINDOW_HOURS=48
CLUSTER_ONLY_EDITORIAL_TYPES=true
EMBED_ONLY_EDITORIAL_TYPES=true
```

---

## 9. Ce qui fonctionne bien (ne pas toucher)

- **Collecte RSS** : fonctionne sur 20+ sources actives
- **Routage LLM** : Cerebras pour AR/FA/TR, Groq pour EN/FR, Anthropic pour HE — correct
- **Sous-clustering récursif** : `_refine_mega_clusters()` existe et fonctionne (mais ne suffit pas sans UMAP)
- **Filtre éditorial scope** : base correcte, juste incomplète
- **Scheduler automatique** : tourne bien 2x/jour
- **Frontend** : design éditorial correct, navigation fonctionnelle
- **Labeller LLM** : prompt bien conçu, labels corrects quand le contenu est pertinent

---

## 10. Plan d'action pour l'agent Cursor

Donne ces instructions exactes à l'agent :

> **Corrections immédiates — avant le prochain run pipeline (lundi 06:00 UTC)**
>
> 1. `pip install umap-learn>=0.5` + ajouter à `requirements.txt`
> 2. Dans `clustering_service.py`, ajouter UMAP `n_components=15, n_neighbors=15, min_dist=0.1, metric='cosine'` avant HDBSCAN
> 3. Dans `config.py`, changer `hdbscan_min_cluster_size=3`, `hdbscan_min_samples=2`
> 4. Dans `editorial_scope.py`, ajouter sport/cinéma/religion/nécrologie aux `LEISURE_SUBSTRINGS`
> 5. Dans `generator.py`, modifier le system prompt pour exiger `« [Thèse] », écrit [Auteur] dans [Média] ([Pays]).`
> 6. Dans `generator.py`, nettoyer `article.author` si null ou blacklisté → "Éditorial non signé"
> 7. Vérifier sur Railway que `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `ANTHROPIC_API_KEY`, `COHERE_API_KEY` sont bien définis
> 8. Déployer sur Railway (branche `v2/media-watch`)
> 9. Lancer un test pipeline manuel (`POST /api/pipeline`) pour vérifier que les clusters sont meilleurs

---

*Fin de l'audit. Version 1.0 — 23 mars 2026.*
