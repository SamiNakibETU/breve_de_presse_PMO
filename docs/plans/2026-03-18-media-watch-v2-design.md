# Middle East Media Watch v2 — Design Document

**Date** : 18 mars 2026
**Auteur** : Sami Nakib
**Statut** : Approuvé

## Vision

Un outil de veille éditoriale automatisé qui collecte, traduit et organise les opinions, éditoriaux et analyses des principaux médias de 12 pays du Moyen-Orient, pour permettre aux journalistes de L'Orient-Le Jour de produire une revue de presse régionale quotidienne montrant "le regard de la région sur les développements en cours".

Ce n'est pas un agrégateur de news. C'est un **observatoire des positions éditoriales** en temps de crise.

## Valeur ajoutée

- **Multilinguisme** : 7 langues sources (ar, en, fr, he, fa, tr, ku) → français
- **Diversité géographique** : 36 sources dans 12 pays, lignes éditoriales divergentes (officiel / indépendant / opposition)
- **Intelligence thématique** : regroupement automatique par sujet + visibilité sur la diversité des perspectives par pays
- **Production journalistique** : format prêt pour publication OLJ

---

## 1. Registre des sources (36 sources, 12 pays)

Chaque pays dispose de 3 sources représentant des lignes éditoriales distinctes.

### Liban
| Source | Langue | RSS | Difficulté | Approche |
|--------|--------|-----|------------|----------|
| Annahar | ar | `annahar.com/rss` (contenu complet) | Easy | RSS direct |
| L'Orient-Le Jour | fr | Aucun RSS public | Hard | Headless browser / partenariat |
| Al Akhbar | ar | Non confirmé | Hard | Headless + proxy régional |

### Israël
| Source | Langue | RSS | Difficulté | Approche |
|--------|--------|-----|------------|----------|
| Jerusalem Post | en | `jpost.com/rss/rssfeedsopinion.aspx` | Easy | RSS opinion dédié |
| Israel Hayom | en | `israelhayom.co.il/rss-feed` (hébreu) | Easy-Med | HTML scraping / WP API |
| Haaretz | en | `haaretz.com/srv/opinion-rss` | Hard (paywall) | RSS résumés + abo |

### Iran
| Source | Langue | RSS | Difficulté | Approche |
|--------|--------|-----|------------|----------|
| Press TV | en | `presstv.ir/rss/rss-125.xml` (Conversations) | Easy | RSS par section |
| Tehran Times | en | `tehrantimes.com/rss` | Medium | RSS catégorisé |
| Iran International | en | Aucun | Medium | HTML scraping |

### EAU
| Source | Langue | RSS | Difficulté | Approche |
|--------|--------|-----|------------|----------|
| Gulf News | en | `gulfnews.com/feed` | Easy | RSS + scraping HTML |
| The National | en | Aucun | Easy | HTML SSR direct |
| Khaleej Times | en | `khaleejtimes.com/rss.xml` | Hard (SPA) | RSS + headless |

### Arabie Saoudite
| Source | Langue | RSS | Difficulté | Approche |
|--------|--------|-----|------------|----------|
| Asharq Al-Awsat EN | en | `english.aawsat.com/feed` | Easy | RSS filtrable par catégorie |
| Saudi Gazette | en | Aucun | Easy | HTML SSR direct |
| Arab News | en | Aucun | Hard (WAF) | Headless + anti-WAF |

### Turquie
| Source | Langue | RSS | Difficulté | Approche |
|--------|--------|-----|------------|----------|
| Daily Sabah | en | `dailysabah.com/rss/opinion/op-ed` | Very Easy | RSS opinion 4 flux |
| Hurriyet Daily News | en | `hurriyetdailynews.com/rss/opinion` | Easy | RSS opinion dédié |
| Bianet English | en | À vérifier | Medium | Remplace Ahval (site down) |

### Irak
| Source | Langue | RSS | Difficulté | Approche |
|--------|--------|-----|------------|----------|
| Iraqi News | en | `iraqinews.com/feed/` | Easy | RSS WordPress |
| Rudaw | en | Aucun | Easy | HTML scraping |
| Kurdistan24 | en | `kurdistan24.net/feed` (kurde) | Med-Hard | Headless pour EN |

### Syrie
| Source | Langue | RSS | Difficulté | Approche |
|--------|--------|-----|------------|----------|
| Syrian Observer | en | `syrianobserver.com/feed` | Easy | RSS (agrégateur traduit) |
| Enab Baladi | en | `english.enabbaladi.net/feed/` | Easy | RSS WordPress |
| SANA | en | `sana.sy/en/feed/` | Easy | RSS WP (officiel) |

### Qatar
| Source | Langue | RSS | Difficulté | Approche |
|--------|--------|-----|------------|----------|
| Gulf Times | en | `gulf-times.com/rssFeed/4` | Very Easy | RSS opinion 3 flux |
| Peninsula Qatar | en | Aucun | Easy | HTML SSR |
| Al Jazeera | en | Aucun (RSS cassé) | Medium | HTML scraping |

### Koweït
| Source | Langue | RSS | Difficulté | Approche |
|--------|--------|-----|------------|----------|
| Kuwait Times | en | `kuwaittimes.com/rssFeed/13` | Easy | RSS opinion dédié |
| Arab Times | en | `arabtimesonline.com/rssFeed/75/` | Easy | RSS opinion dédié |
| KUNA | en | Aucun (timeout) | Hard | Headless / API mobile |

### Jordanie
| Source | Langue | RSS | Difficulté | Approche |
|--------|--------|-----|------------|----------|
| Jordan Times | en | Aucun | Hard (SPA) | Headless browser |
| Al Ghad | ar | Non vérifiable (WAF) | Hard | Headless + proxy |
| Roya News | en | Aucun | Hard (SPA) | Headless / API |

### Égypte
| Source | Langue | RSS | Difficulté | Approche |
|--------|--------|-----|------------|----------|
| Daily News Egypt | en | `dailynewsegypt.com/category/opinion/feed/` | Easy | RSS opinion dédié |
| Mada Masr | en | `madamasr.com/en/feed/` | Medium (paywall) | RSS WP |
| Al-Ahram EN | en | Aucun | Medium | HTML scraping (ASP.NET) |

### Sources transversales
| Source | Pays | RSS | Approche |
|--------|------|-----|----------|
| Al-Monitor | US | À vérifier | Metered, analytique |
| Middle East Eye | UK | À vérifier | Gratuit, opinions indépendantes |
| New Lines Magazine | US | À vérifier | Long-form, gratuit |

### Stratégie par difficulté
- **Easy/Very Easy (22 sources)** : RSS + trafilatura — fonctionnel immédiatement
- **Medium (7 sources)** : RSS + scraping HTML renforcé + retry robuste
- **Hard (7 sources)** : Phase v3, Playwright headless — RSS summary en attendant

---

## 2. Pipeline intelligente

### Architecture

```
RSS Collect (36 sources, 2x/jour)
    ↓
Traduction + Résumé Chain of Density (LLM hybride)
    ↓
Embedding sémantique (Cohere embed-multilingual-v3)
    ↓
Topic Grouping (HDBSCAN, seuil cosine ~0.55)
    ↓
Labelling de cluster (LLM, 5-10 mots)
    ↓
Enrichissement (diversité pays, score pertinence, freshness)
    ↓
API /api/clusters → Frontend journaliste
```

### Embedding

- **API** : Cohere `embed-multilingual-v3.0`
- **Dimensions** : 1024
- **Input** : résumé FR de chaque article (150-200 mots)
- **Stockage** : colonne `embedding` Vector(1024) dans `articles` (pgvector)
- **Coût** : quasi-gratuit (~$0.001/jour pour 300 articles)

### Topic Grouping

- **Algorithme** : HDBSCAN, `min_cluster_size=3`, `metric='euclidean'`
- **Seuil** : cosine ~0.55-0.65 (groupement thématique, PAS déduplication)
- **Fréquence** : recalculé après chaque pipeline ou à la demande
- **Articles non clusterisés** : restent visibles individuellement (noise=-1)

### Labelling

- Envoi des 3 premiers titres du cluster au LLM (Groq, rapide)
- Prompt : "Label de 5-10 mots décrivant le thème commun"
- Résultat stocké dans `topic_clusters.label`

### Modèle de données

```sql
CREATE TABLE topic_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label VARCHAR(200),
    article_count INTEGER DEFAULT 0,
    country_count INTEGER DEFAULT 0,
    avg_relevance FLOAT DEFAULT 0,
    latest_article_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE articles ADD COLUMN embedding vector(1024);
ALTER TABLE articles ADD COLUMN cluster_id UUID REFERENCES topic_clusters(id);
CREATE INDEX ON articles USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### API endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/clusters` | Clusters actifs triés par pertinence |
| GET | `/api/clusters/{id}/articles` | Articles du cluster groupés par pays |
| POST | `/api/clusters/refresh` | Recalcule les clusters |

---

## 3. Frontend — Vue clusters

### Dashboard thématique (`/`)

Le journaliste arrive et voit les **sujets du jour**, triés par pertinence éditoriale :
- Chaque cluster affiche : label, nombre d'articles, nombre de pays, drapeaux des pays représentés, score de pertinence
- Bouton "Voir" ouvre le détail du cluster
- Section "Articles non classés" pour les articles hors clusters

### Vue cluster (`/clusters/{id}`)

- Articles groupés par pays (sous-sections)
- Résumé preview visible (2-3 lignes) sans cliquer
- Sélection par checkbox → panier flottant
- Bouton "Générer la revue" en bas

### Navigation

```
Dashboard (clusters)  →  Articles (vue plate)  →  Revue de presse (génération)
     │                        │                         │
     └── /clusters/{id}       └── filtres/sélection     └── historique
```

### Design system

Identique à la v1 : typographie Poynter OS Display / Aktiv Grotesk, fond blanc, minimaliste, design éditorial OLJ.

---

## 4. Déploiement

### Stratégie Git

```
main ──────────────── (beta v1 stable, testable par l'OLJ)
   │
   └── v2/media-watch ── (développement v2)
```

### Railway

- **v1 (inchangé)** : services existants sur `main`
- **v2** : nouveaux services Railway pointant sur `v2/media-watch`
  - Backend v2 : root `backend/`
  - Frontend v2 : root `frontend/`
  - DB : PostgreSQL partagé ou séparé

### Variables d'environnement nouvelles

| Variable | Description |
|----------|-------------|
| `COHERE_API_KEY` | API key pour embeddings |

---

## 5. Format de sortie

Format actuel conservé, avec résumé adaptable (longueur et citations selon le contenu) :

```
« [Titre assertif — Thèse de l'auteur] »

Résumé : [150-200 mots, Chain of Density, citations précises, nuances]

Fiche :
Article publié dans [nom du média]
Le [JJ mois AAAA]
Langue originale : [langue]
Pays du média : [pays]
Nom de l'auteur : [auteur ou "Éditorial non signé"]
```

---

## 6. Roadmap

| Phase | Contenu | Horizon |
|-------|---------|---------|
| v2 beta | Sources refondues + embeddings + clusters + frontend thématique | Sprint actuel |
| v2.1 | Intégration liste OLJ + retours journaliste | Après feedback |
| v3 | Playwright (paywalls), NER cross-lingue, liaison Wikidata | +2-3 semaines |
| v4 | BERTrend (signaux faibles), topic modeling temps réel, alertes | +1 mois |

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Backend | Python 3.11, FastAPI, SQLAlchemy async, PostgreSQL 16 + pgvector |
| LLM | Groq (Llama 4 Scout), Cerebras (Qwen 3 235B), Anthropic (Claude Haiku/Sonnet) |
| Embeddings | Cohere embed-multilingual-v3 |
| Clustering | HDBSCAN, scikit-learn |
| Frontend | Next.js 14, React 19, TypeScript, Tailwind CSS |
| Déploiement | Railway, GitHub |
