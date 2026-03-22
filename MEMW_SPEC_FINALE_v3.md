# MEMW — Spécification de finalisation définitive

## Le document unique qui rend le produit prêt à publier

**Projet** : Middle East Media Watch — L'Orient-Le Jour  
**Porteur** : Sami Nakib  
**Commanditaire** : Emilie Sueur (journaliste, OLJ)  
**Version** : 3.0 FINALE  
**Date** : 22 mars 2026  
**Horizon** : 4 semaines · 8 sprints · 1 recette  

---

## SOMMAIRE

### PARTIE A — VISION ET DIAGNOSTIC
- A1. Métrique nord et transformation
- A2. État du staging (22 mars 2026)
- A3. Écart spec v2 ↔ réalité

### PARTIE B — LES 8 SPRINTS
- Sprint 1 : Fix critique + auth (2j)
- Sprint 2 : Sources P0 + filtre éditorial (3j)
- Sprint 3 : Dédup MinHash LSH (3j)
- Sprint 4 : Modèle Édition + clustering restreint (3j)
- Sprint 5 : Curateur LLM (3j)
- Sprint 6 : Refonte UX — 3 écrans Composition (4j)
- Sprint 7 : Génération par sujet + prompts v2 (3j)
- Sprint 8 : Régie + polish + recette (3j)

### PARTIE C — ARCHITECTURE TECHNIQUE
- C1. Stack complète
- C2. Schéma du pipeline
- C3. Modèle de données (SQL)
- C4. Contrats API (request/response)
- C5. State management frontend

### PARTIE D — DESIGN SYSTEM
- D1. Principe directeur
- D2. Typographie
- D3. Palette et tokens CSS
- D4. Espacement et grille
- D5. Composants (spécifications pixel-perfect)
- D6. Wireframes des 3 écrans
- D7. Micro-copy et messages système
- D8. Responsive et accessibilité

### PARTIE E — CHARTE ÉDITORIALE
- E1. Ton des sorties LLM
- E2. Format OLJ exact
- E3. Ce qu'on ne montre jamais au journaliste

### PARTIE F — REGISTRE DES SOURCES
- F1. Réconciliation CSV Emilie ↔ registre
- F2. Actions par pays

### PARTIE G — PROMPTS PRODUCTION
- G1. Tableau récapitulatif
- G2. Coût par édition

### PARTIE H — OBSERVABILITÉ, SÉCURITÉ, RECETTE
- H1. Tables de logs
- H2. Alertes
- H3. Sécurité et secrets
- H4. Critères de recette finale

---

# PARTIE A — VISION ET DIAGNOSTIC

## A1. Métrique nord et transformation

**≤ 30 minutes** entre l'ouverture de l'outil par le journaliste et le copier-coller dans le back-office OLJ.

```
AVANT (staging actuel)                    APRÈS (production)
─────────────────────                     ──────────────────

Le journaliste voit :                     Le journaliste voit :
• Un dashboard technique                  • Un sommaire de journal
• 4 boutons de pipeline                   • 6 sujets avec drapeaux
• Des compteurs (collectés, traduits,     • Des phrases-thèses entre « »
  en attente, erreurs)                    • Un bouton « Copier »
• 28 clusters bruts                       
• 0 sujets (clusters vides)              Le journaliste ne voit pas :
• Le mot « pipeline »                     • Le mot « pipeline »
                                          • Des compteurs d'erreurs
                                          • Du JSON
                                          • Des UUIDs
```

**La transformation est produit, pas technique.** Le backend fonctionne. C'est l'interface et la couche de curation qui manquent.

## A2. État du staging (22 mars 2026)

### Pages inspectées

| URL | Ce qu'on voit | Problème |
|-----|---------------|----------|
| `/` → `/edition/2026-03-22` | « Préparation du sommaire… » + lien vers dashboard | Page vide, pas de données, redirige vers le pipeline |
| `/dashboard` | 4 boutons pipeline + « 0 sujets » + stats vides | C'est un panneau de contrôle technique, pas un outil éditorial |
| `/articles` | Timeout / erreur | Page cassée |
| `/review` | « Sélection — 0 article » | Vide, dépend de la sélection manuelle |
| `/regie` | Hub avec 7 liens vers sous-pages | Structure correcte, contenu placeholder |
| `/regie/sources` | Tableau vide (chargement infini) | Backend ne répond pas (ou pas de données) |

### Run pipeline du 22 mars — chiffres clés

| Métrique | Valeur | Verdict |
|----------|--------|---------|
| Durée totale | 3 337s (~56 min) | Acceptable |
| Articles collectés | 141 | Trop peu — sources mortes |
| Filtrés (hors périmètre) | 47 (33%) | Filtre fonctionne |
| Traductions réussies | 202 | OK |
| « À relire » (confiance basse) | 64 (31,7%) | Trop haut |
| Syndiqués | 151 | **83% du corpus = bruit** |
| Erreur embedding numpy | 1 (bloquante) | **Fix non déployé** |
| Sources israéliennes actives | 0 | **Trou critique** |
| Cluster « coiffures femmes » | Présent | **Filtre lifestyle insuffisant** |
| Endpoints POST sans auth | 4 | **Faille de sécurité** |

## A3. Écart spec v2 ↔ réalité

| Composant de la spec v2 | Implémenté ? |
|--------------------------|--------------|
| Modèle Édition (lifecycle, temporal window) | ❌ |
| EditionTopic (sujets curatés) | ❌ |
| Dédup passe 1 — MinHash LSH | ❌ |
| Dédup passe 2 — cosine sémantique | ⚠️ Existe mais bug numpy |
| Clustering restreint à l'Édition | ❌ Cluster sur tout le corpus |
| UMAP pré-HDBSCAN | ❌ |
| Curateur LLM | ❌ |
| Génération par sujet (transitions) | ❌ Article par article |
| UX Sommaire → Sujet → Composition | ❌ Dashboard technique |
| Séparation Composition / Régie | ⚠️ Régie existe, Composition non |
| Tiers P0/P1/P2 sources | ❌ Traitement uniforme |
| Prompts v2 (Chain of Density, quality_flags) | ❌ Prompts v1 en production |
| Score de pertinence éditoriale (≠ confiance traduction) | ❌ |

---

# PARTIE B — LES 8 SPRINTS

Chaque sprint a : une durée, un objectif en une phrase, des actions numérotées, un critère d'acceptation binaire (pass/fail), et les fichiers impactés.

---

## Sprint 1 — Fix critique + auth (2 jours)

**Objectif** : le pipeline tourne sans erreur et les endpoints sont protégés.

### Actions

**1.1 — Déployer le commit `1f4f0cc`**

Le fix numpy dans `semantic_dedupe.py` est mergé mais pas en production sur Railway. Déployer la branche `v2/media-watch` avec ce commit.

Critère : `POST /api/pipeline` retourne un JSON sans clé `"error"` dans la section embedding.

**1.2 — Ajouter un middleware bearer token**

Fichier à créer : `backend/src/middleware/auth.py`

```python
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
import os

class BearerAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in ("POST", "PUT", "DELETE"):
            key = os.getenv("INTERNAL_API_KEY", "")
            if key:
                auth = request.headers.get("Authorization", "")
                if auth != f"Bearer {key}":
                    raise HTTPException(401, "Unauthorized")
        return await call_next(request)
```

Fichier modifié : `backend/src/app.py` — ajouter `app.add_middleware(BearerAuthMiddleware)`.

Variable d'environnement Railway : `INTERNAL_API_KEY` (string aléatoire 64 chars).

**1.3 — Frontend : envoyer le token**

Fichier modifié : `frontend/src/lib/api.ts`

Ajouter un header `Authorization: Bearer ${process.env.NEXT_PUBLIC_API_KEY}` à tous les appels POST.

Variable d'environnement Railway (frontend) : `NEXT_PUBLIC_API_KEY`.

### Critère d'acceptation

- [ ] Pipeline complet exécuté sans erreur embedding
- [ ] `POST /api/pipeline` sans token → HTTP 401
- [ ] `POST /api/pipeline` avec token → HTTP 200
- [ ] `GET /api/clusters` sans token → HTTP 200 (lecture publique)

---

## Sprint 2 — Sources P0 + filtre éditorial (3 jours)

**Objectif** : les sources critiques produisent du contenu et le bruit lifestyle est éliminé.

### Actions

**2.1 — Définir les tiers (à valider avec Emilie)**

Ajouter un champ `"tier"` à chaque entrée de `MEDIA_REGISTRY.json`.

Sources P0 recommandées (12) :
- **Israël** : Jerusalem Post, Times of Israel, Haaretz
- **Iran** : Tehran Times, Press TV
- **Qatar** : Al Jazeera English (filtré opinion)
- **Arabie S.** : Asharq Al-Awsat, Arab News
- **EAU** : Gulf News
- **Liban** : Annahar
- **Transversal** : Al-Monitor, Middle East Eye

**2.2 — Ajouter Times of Israel**

Fichier : `MEDIA_REGISTRY.json`

```json
{
  "name": "Times of Israel",
  "slug": "times-of-israel",
  "country": "IL",
  "language": "en",
  "tier": "P0",
  "rss_url": "https://www.timesofisrael.com/feed/",
  "opinion_url": "https://blogs.timesofisrael.com/feed/",
  "editorial_line": "Média anglophone israélien centriste-libéral, couvrant politique, sécurité et opinion.",
  "scraping_method": "rss"
}
```

**2.3 — Diagnostiquer les sources à 0 articles**

Pour chaque source P0 avec 0 articles dans le dernier run :
1. Vérifier manuellement l'URL RSS (curl + feedparser)
2. Si paywall → configurer pour ne récupérer que le résumé RSS
3. Si timeout → augmenter à 30s
4. Si WAF → tester avec headers User-Agent réalistes
5. Documenter le diagnostic dans un fichier `docs/source_diagnostics.md`

**2.4 — Plafonner Al Jazeera**

Fichier : `backend/src/services/collector.py`

Ajouter une constante :
```python
MAX_ARTICLES_PER_GENERAL_RSS = 12
```

Si une source n'a pas de `opinion_url` et utilise un RSS général, ne garder que les N articles les plus récents avec un signal géopolitique.

**2.5 — Étendre le filtre lifestyle**

Fichier : `backend/src/services/editorial_scope.py`

Ajouter dans `LIFESTYLE_TRAVEL_SUBSTRINGS` :
```python
# FR
"coiffure", "cheveux", "mode et beauté", "look du jour",
"horoscope", "astrologie", "signe du zodiaque",
"développement personnel", "bien-être",
"mariage", "noces", "robe de mariée",
# EN
"hairstyle", "hair color", "fashion trend", "fashion week",
"horoscope", "zodiac", "self-help", "wellness tips",
"wedding", "bride", "celebrity gossip",
# TR
"saç modeli", "moda", "burç", "düğün",
# AR
"تسريحات شعر", "أبراج", "زفاف", "موضة",
```

### Critère d'acceptation

- [ ] ≥ 8 des 12 sources P0 produisent ≥ 1 article dans le prochain run
- [ ] Le cluster « coiffures » ou équivalent lifestyle ne réapparaît pas
- [ ] Al Jazeera ≤ 15 articles par run

---

## Sprint 3 — Dédup MinHash LSH (3 jours)

**Objectif** : les reprises de dépêches sont éliminées avant le clustering.

### Actions

**3.1 — Créer `dedup_surface.py`**

Fichier : `backend/src/services/dedup_surface.py`

Dépendance : `datasketch>=1.6` (ajouter à `requirements.txt`)

```python
from datasketch import MinHash, MinHashLSH

# Paramètres
SHINGLE_SIZE = 5     # mots
NUM_PERM = 128       # fonctions hash
NUM_BANDS = 16       # bandes LSH
JACCARD_THRESHOLD = 0.65

def build_minhash(text: str) -> MinHash:
    words = text.lower().split()
    shingles = {
        " ".join(words[i:i+SHINGLE_SIZE])
        for i in range(len(words) - SHINGLE_SIZE + 1)
    }
    m = MinHash(num_perm=NUM_PERM)
    for s in shingles:
        m.update(s.encode("utf-8"))
    return m

def find_syndication_groups(articles: list[dict]) -> list[list[dict]]:
    """
    Retourne une liste de groupes de syndication.
    Chaque groupe est une liste d'articles avec Jaccard ≥ JACCARD_THRESHOLD.
    """
    lsh = MinHashLSH(threshold=JACCARD_THRESHOLD, num_perm=NUM_PERM)
    minhashes = {}
    for a in articles:
        text = a.get("summary_fr") or a.get("title_fr", "")
        if len(text.split()) < SHINGLE_SIZE:
            continue
        mh = build_minhash(text)
        minhashes[a["id"]] = mh
        try:
            lsh.insert(a["id"], mh)
        except ValueError:
            pass  # Duplicate key

    # Union-Find pour grouper
    parent = {a["id"]: a["id"] for a in articles}
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    def union(x, y):
        parent[find(x)] = find(y)

    for aid, mh in minhashes.items():
        candidates = lsh.query(mh)
        for c in candidates:
            if c != aid:
                union(aid, c)

    groups = {}
    for a in articles:
        root = find(a["id"])
        groups.setdefault(root, []).append(a)

    return [g for g in groups.values() if len(g) > 1]
```

**Élection du représentant** :
1. Tier P0 > P1 > P2
2. À tier égal → `published_at` le plus ancien
3. À date égale → contenu le plus long

**3.2 — Champs ajoutés au modèle Article**

Fichier : `backend/src/models/article.py`

```python
syndication_status = Column(String(20), default="unique")
# "unique" | "representative" | "duplicate"
syndication_group_size = Column(Integer, nullable=True)
syndication_group_sources = Column(ARRAY(Text), nullable=True)
```

Migration Alembic : `alembic revision --autogenerate -m "add_syndication_fields"`

**3.3 — Intégrer dans le pipeline**

Fichier : `backend/src/services/scheduler.py`

Ordre : collecte → traduction → **dédup surface** → embedding → dédup sémantique → clustering

Les articles `syndication_status = "duplicate"` sont exclus de l'embedding (économie Cohere).

**3.4 — Rapport de debug**

Chaque run produit un JSONL dans `pipeline_debug_logs` :
```json
{
  "step": "dedup_surface",
  "groups_found": 23,
  "articles_before": 202,
  "articles_after": 87,
  "reduction_ratio": 0.57,
  "largest_group": {"size": 8, "representative": "Arab News", "sources": ["Gulf News", "The National", ...]}
}
```

### Critère d'acceptation

- [ ] Le nombre d'articles entrant dans le clustering baisse de > 40%
- [ ] Vérification manuelle de 20 groupes : < 5% faux positifs
- [ ] Le champ `syndication_group_size` est rempli pour les représentants

---

## Sprint 4 — Modèle Édition + clustering restreint (3 jours)

**Objectif** : le pipeline converge vers une Édition datée ; le clustering ne traite que les candidats de cette Édition.

### Actions

**4.1 — Créer les tables**

Fichier : `backend/src/models/edition.py`

```sql
-- Table editions
CREATE TABLE editions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publish_date DATE NOT NULL UNIQUE,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    timezone VARCHAR(50) DEFAULT 'Asia/Beirut',
    target_topics_min INT DEFAULT 4,
    target_topics_max INT DEFAULT 8,
    status VARCHAR(20) DEFAULT 'SCHEDULED'
        CHECK (status IN ('SCHEDULED','COLLECTING','CURATING','COMPOSING','PUBLISHED')),
    curator_output JSONB,
    edition_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table edition_topics
CREATE TABLE edition_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edition_id UUID REFERENCES editions(id) ON DELETE CASCADE,
    rank INT NOT NULL,
    title_proposed VARCHAR(300) NOT NULL,
    title_final VARCHAR(300),
    status VARCHAR(20) DEFAULT 'proposed'
        CHECK (status IN ('proposed','accepted','rejected')),
    country_coverage JSONB DEFAULT '{}',
    dominant_angle TEXT,
    counter_angle TEXT,
    editorial_note TEXT
);

-- Table de liaison
CREATE TABLE edition_topic_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edition_topic_id UUID REFERENCES edition_topics(id) ON DELETE CASCADE,
    article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
    is_recommended BOOLEAN DEFAULT false,
    is_selected BOOLEAN DEFAULT false,
    rank_in_topic INT,
    UNIQUE (edition_topic_id, article_id)
);

-- FK sur articles
ALTER TABLE articles ADD COLUMN edition_id UUID REFERENCES editions(id);
```

**4.2 — Cron de création automatique**

Fichier : `backend/src/services/edition_service.py`

À 00:00 Asia/Beirut, créer l'Édition du lendemain :

| Jour cible | `window_start` | `window_end` |
|------------|----------------|--------------|
| Lundi | Vendredi 18:00 | Lundi 06:00 |
| Mardi-Vendredi | J-1 18:00 | J 06:00 |
| Samedi-Dimanche | Pas d'édition (configurable) |

**4.3 — Clustering restreint**

Fichier : `backend/src/services/clustering_service.py`

Le clustering ne sélectionne que les articles qui satisfont :
1. `edition_id` = Édition courante
2. `translation_confidence >= 0.70`
3. `syndication_status != 'duplicate'`
4. `article_type IN ('opinion', 'editorial', 'tribune', 'analysis')`

Paramètres HDBSCAN (corpus attendu 60-120 articles) :
- `min_cluster_size = 3`
- `min_samples = 2`
- `cluster_selection_method = 'leaf'`

Ajout UMAP pré-clustering :
```python
import umap
reducer = umap.UMAP(
    n_components=15, n_neighbors=15,
    min_dist=0.1, metric='cosine'
)
X_reduced = reducer.fit_transform(X_embeddings)
```

Dépendance : `umap-learn>=0.5`

**4.4 — Fusion de clusters proches**

Après HDBSCAN, calculer le cosinus entre les centroïdes. Si > 0.80 → marquer comme « fusionnable ». Ne pas fusionner — laisser le Curateur décider.

### Critère d'acceptation

- [ ] La table `editions` existe, une Édition est créée chaque jour
- [ ] Les articles sont rattachés à l'Édition ouverte
- [ ] Le clustering produit 8-20 clusters bruts (vs. 28 actuellement)

---

## Sprint 5 — Curateur LLM (3 jours)

**Objectif** : le pipeline produit un sommaire éditorial structuré de 4-8 sujets.

### Actions

**5.1 — Créer `curator_service.py`**

Fichier : `backend/src/services/curator_service.py`

Modèle : Claude Sonnet 4.6 · Température : 0.2 · Max tokens : 8 192  
Prompt : `prompt_curator_v2` (cf. MEMW_PROMPT_SUITE_v2.md, Section PROMPT 3).

**5.2 — Validation des 6 invariants**

Après chaque appel :
1. Nombre de sujets dans `[target_min, target_max]`
2. 2-6 articles par sujet
3. Chaque `article_id` dans exactement 1 sujet
4. Chaque `article_id` existe dans le corpus d'entrée
5. Couverture pays ≥ 60% du corpus
6. Total articles recommandés ≤ 35

Si violation → relancer avec prompt de correction (max 2 relances).  
Si 3ème essai échoue → fallback : clusters bruts étiquetés + message « La curation automatique a échoué. Vous pouvez relancer ou sélectionner manuellement. »

**5.3 — Persistance**

Stocker `curator_output` dans `editions.curator_output`.  
Créer les `edition_topics` et `edition_topic_articles` à partir de la sortie.

**5.4 — Endpoints**

```
POST /api/editions/{date}/curate     → Déclenche la curation
GET  /api/editions/{date}/summary    → Retourne le sommaire structuré
```

### Critère d'acceptation

- [ ] Sur 3 Éditions consécutives, le Curateur produit un sommaire sans violation
- [ ] Le sommaire contient 4-8 sujets avec diversité géographique
- [ ] Le champ `coverage_gaps` signale les pays absents

---

## Sprint 6 — Refonte UX : 3 écrans Composition (4 jours)

**Objectif** : le journaliste voit un sommaire, pas un dashboard.

### Architecture des routes

```
AVANT                                 APRÈS
─────                                 ─────
/ → /edition/[date] (vide)            / → /edition/[date] (Sommaire)
/dashboard (pipeline)                 /edition/[date]/topic/[id] (Sujet)
/articles (liste plate)               /review (Composition + export)
/review (sélection)                   /articles (fallback, vue plate)
/regie (hub)                          /regie/* (monitoring technique)
```

### Écran 1 — Le Sommaire (`/edition/[date]`)

**C'est la page d'accueil.** Wireframe :

```
┌──────────────────────────────────────────────────────────┐
│  [Logo OLJ]            Revue de presse régionale         │
│  Sommaire   Articles   Revue de presse        ⚙ Régie   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Édition du lundi 24 mars 2026                           │
│  6 sujets · 34 articles · ven. 21/03 18h → lun. 24/03   │
│                                                          │
│ ─────────────────────────────────────────────────────── │
│                                                          │
│  1  Frappes américaines sur l'Iran :                     │
│     l'escalade incontrôlée                               │
│     🇮🇷 🇮🇱 🇱🇧 🇹🇷  ·  11 articles                       │
│     « La guerre en Iran échappe désormais au             │
│       contrôle de Trump »                                │
│                                          Ouvrir →        │
│                                                          │
│ ─────────────────────────────────────────────────────── │
│                                                          │
│  2  Aïd al-Fitr sous les bombes :                        │
│     célébrations et restrictions au Moyen-Orient         │
│     🇶🇦 🇱🇧 🇸🇾 🇮🇷 +2  ·  32 articles                    │
│     « L'Aïd rappelle que la paix est une                 │
│       nécessité humanitaire »                            │
│                                          Ouvrir →        │
│                                                          │
│ ─────────────────────────────────────────────────────── │
│                                                          │
│  3  ...                                                  │
│                                                          │
│ ─────────────────────────────────────────────────────── │
│                                                          │
│  ┌ Synthèse éditoriale ─────────────────────────────┐   │
│  │ L'édition du 24 mars est dominée par l'escalade  │   │
│  │ US-Iran. Lacunes : pas de couverture israélienne  │   │
│  │ (Haaretz paywall).                                │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Interactions** :
- Drag-and-drop pour réordonner les sujets (via `@dnd-kit/sortable`)
- Clic sur le titre → inline editing (contentEditable + onBlur save)
- Icône × au hover → rejeter un sujet (`PATCH /topic/{id}` → `status: rejected`)
- « Ouvrir → » → navigation vers Écran 2

**États alternatifs** :

| Situation | Affichage |
|-----------|-----------|
| Curation pas encore lancée | « Collecte en cours — 42 articles candidats. Curation disponible à 06:00 ou sur demande. » + bouton `[Lancer la curation]` |
| Curation en cours | « Préparation du sommaire… » + spinner discret |
| Curation échouée | « La curation automatique a échoué. » + `[Relancer]` + `[Sélection manuelle]` |
| Aucun article | « Aucun article collecté dans cette fenêtre. Vérifiez les sources en Régie. » |
| Édition publiée | Sommaire en lecture seule, badge « Publié » |

### Écran 2 — Le Sujet (`/edition/[date]/topic/[id]`)

Wireframe :

```
┌──────────────────────────────────────────────────────────┐
│  ← Retour au sommaire                                   │
│                                                          │
│  Frappes américaines sur l'Iran :                        │
│  l'escalade incontrôlée                                  │
│  11 articles · 4 pays                                    │
│                                                          │
│  ┌ Angles ───────────────────────────────────────────┐  │
│  │ Dominant : consensus régional sur la perte de     │  │
│  │ contrôle de la situation par Washington.           │  │
│  │ Contrepoint : Téhéran accuse les médias arabes    │  │
│  │ de relayer la propagande américaine.               │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ── 🇮🇷 IRAN ──────────────────────────────────────── │
│                                                          │
│  ☑  « La mort est considérée comme un générateur     │  │
│      de conscience politique qui renforce la          │  │
│      résilience iranienne »                           │  │
│      Tehran Times · Opinion · 18/03/2026  ●          │  │
│      ⓘ Repris par 3 médias                          │  │
│      ▸ Voir le résumé                                │  │
│                                                          │
│  ☑  « Le régime ne négociera jamais sous la          │  │
│      contrainte »                                    │  │
│      Press TV · Éditorial · 19/03/2026  ●            │  │
│                                                          │
│  ── 🇮🇱 ISRAËL ────────────────────────────────────── │
│                                                          │
│  ☑  « La guerre contre l'Iran échappe à Trump »      │  │
│      Times of Israel · Analyse · 22/03/2026  ●       │  │
│                                                          │
│  ── 🇹🇷 TURQUIE ───────────────────────────────────── │
│                                                          │
│  ☐  « La guerre entre les États-Unis, Israël et      │  │
│      l'Iran est un échec mondial de la raison »      │  │
│      Milliyet · Opinion · 22/03/2026  ○              │  │
│                                                          │
│  ▸ Autres articles sur ce sujet (4)                  │  │
│                                                          │
│ ┌────────────────────────────────────────────────────┐  │
│ │  3 articles sélectionnés    [Ajouter à la revue →] │  │
│ └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Légende des indicateurs** :
- ● vert : confiance traduction ≥ 0.85
- ○ gris : confiance 0.70-0.85
- ☑ : pré-coché (recommandé par le Curateur)
- ☐ : non recommandé

**Interactions** :
- Checkbox → toggle `is_selected` (`PATCH /edition_topic_articles/{id}`)
- « Voir le résumé » → expansion (toggle, pas page séparée)
- « Autres articles » → section pliée avec les articles non recommandés
- « Ajouter à la revue → » → sauvegarde la sélection + retour au sommaire
- Titre éditable en inline

### Écran 3 — La Composition (`/review`)

Wireframe :

```
┌──────────────────────────────────────────────────────────┐
│  Revue de presse · Édition du 24 mars 2026               │
│  Texte prêt à copier-coller dans le CMS                  │
│                                                          │
│  ── Sélection ──────────────────────────────────────── │
│  Sujet 1 : Frappes US-Iran (3 articles)    [×]          │
│  Sujet 2 : Aïd sous les bombes (4 articles) [×]         │
│  Sujet 3 : Ceasefire talks (2 articles)     [×]         │
│                                                          │
│  [Générer la revue (9 articles, 3 sujets) →]            │
│                                                          │
│ ─────────────────────────────────────────────────────── │
│                                                          │
│  ┌ Texte généré ─────────────────────────────────────┐  │
│  │                                                    │  │
│  │  « La guerre en Iran échappe désormais au          │  │
│  │  contrôle de Trump », écrit Mohammad Javad         │  │
│  │  dans le Tehran Times (Iran).                      │  │
│  │                                                    │  │
│  │  Le ministre iranien des Affaires étrangères       │  │
│  │  Abbas Araghchi a rejeté mardi toute reprise       │  │
│  │  des pourparlers nucléaires aux conditions         │  │
│  │  posées par l'administration américaine. (...)     │  │
│  │                                                    │  │
│  │  Tehran Times, Iran, 19/03/2026, Persan,           │  │
│  │  Mohammad Javad                                    │  │
│  │                                                    │  │
│  │  À rebours de cette lecture, l'éditorialiste       │  │
│  │  du Times of Israel place la responsabilité        │  │
│  │  de l'impasse sur Téhéran.                         │  │
│  │                                                    │  │
│  │  (...)                                             │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  [Copier dans le presse-papiers]   [Télécharger .txt]    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Interactions** :
- « Générer la revue » → `POST /api/editions/{date}/generate`
- Le texte généré est affiché dans un bloc à fond blanc, max-width 640px
- « Copier » → `navigator.clipboard.writeText(text)` → micro-feedback « Copié ✓ » (2s)
- « Télécharger .txt » → `Blob` + `saveAs`
- Le titre et le chapeau ne sont PAS générés (Emilie les écrit dans le CMS)

### Nouveaux fichiers frontend

```
frontend/src/app/edition/[date]/page.tsx             → Écran 1
frontend/src/app/edition/[date]/topic/[id]/page.tsx  → Écran 2
frontend/src/app/review/page.tsx                     → Écran 3 (refonte)
frontend/src/components/edition/summary-card.tsx
frontend/src/components/edition/topic-article.tsx
frontend/src/components/edition/country-section.tsx
frontend/src/components/edition/coverage-gaps.tsx
frontend/src/components/shared/inline-edit.tsx
frontend/src/components/shared/floating-bar.tsx
```

### Navigation simplifiée

```
AVANT : Sommaire | Sujets du jour | Articles | Revue de presse | Régie
APRÈS : Sommaire | Articles | Revue de presse                  ⚙ Régie
```

4 items au lieu de 5. « Sujets du jour » disparaît — c'est le Sommaire qui montre les sujets. La Régie est séparée visuellement (à droite, plus petite, icône engrenage).

### Critère d'acceptation

- [ ] Le sommaire s'affiche en page d'accueil avec les sujets du Curateur
- [ ] Le parcours Sommaire → Sujet → Sélection → Composition fonctionne en < 5 clics
- [ ] Les boutons pipeline ne sont pas visibles sur le chemin éditorial
- [ ] L'interface fonctionne sur un écran 13" (1440×900 min)

---

## Sprint 7 — Génération par sujet + prompts v2 (3 jours)

**Objectif** : le texte généré a des transitions narratives et le format OLJ est exact.

### Actions

**7.1 — Refonte du générateur**

Fichier : `backend/src/services/generator.py`

Changement : la génération se fait **sujet par sujet**. Le LLM reçoit tous les articles d'un sujet et produit le bloc complet avec transitions.

Prompt : `prompt_generate_review_v2` (cf. MEMW_PROMPT_SUITE_v2.md, Section PROMPT 4).

Format de sortie par article :
```
« [Phrase-thèse] », écrit [Auteur] dans [Média] ([Pays]).

[Résumé 3-5 phrases, dense, entités nommées]

[Média], [Pays], [JJ/MM/AAAA], [Langue], [Auteur]

[Transition 1 phrase vers l'article suivant]
```

**7.2 — Prompts dans des fichiers YAML**

Créer `backend/config/prompts/` :
```
translate_summarize_v2.yaml
cluster_label_v2.yaml
curator_v2.yaml
generate_review_v2.yaml
relevance_score_v2.yaml
```

Chaque fichier contient : `id`, `version`, `model`, `temperature`, `max_tokens`, `system_prompt`, `user_prompt_template`, `json_schema`.

Le code Python charge les prompts depuis ces fichiers, pas depuis des strings hardcodées.

**7.3 — Ajouts au prompt de traduction v2**

- Champ `quality_flags` : `truncated_content`, `mixed_languages`, `paywall_detected`, `opinion_piece`, `wire_copy`
- Champ `thesis_sentence` : la phrase-thèse entre « » avec attribution, séparée du résumé
- Contrainte de densité : « chaque phrase du résumé contient au moins une entité nommée »

### Critère d'acceptation

- [ ] Le texte généré contient des transitions entre les articles
- [ ] Le format OLJ est respecté (guillemets « », fiche, pas de filler)
- [ ] Les prompts sont dans des fichiers YAML
- [ ] Test : 3 revues générées, relues par Emilie, validées

---

## Sprint 8 — Régie + polish + recette (3 jours)

**Objectif** : l'espace Régie affiche les données réelles, le produit est poli, la recette est passée.

### Actions

**8.1 — Connecter les pages Régie aux données**

| Page Régie | Endpoint backend | Contenu |
|------------|-----------------|---------|
| `/regie/sources` | `GET /api/media-sources/health` | Tier, derniers articles, état par source |
| `/regie/pipeline` | `GET /api/pipeline/last-run` | Chronologie, durées, erreurs |
| `/regie/dedup` | `GET /api/dedup/groups` | Groupes syndication du dernier run |
| `/regie/clustering` | `GET /api/clustering/report` | Paramètres, nombre clusters, bruit |
| `/regie/curator` | `GET /api/editions/{date}/curator-debug` | Input/output brut du Curateur |

**8.2 — Polish global**

| Élément | Action |
|---------|--------|
| Auteurs URL (facebook.com/middleeasteye) | Étendre `clean_author_for_display` : supprimer toute URL, remplacer par « Rédaction » |
| Labels « Hétérogène : revue à resynchroniser » | Avec le Curateur, ces clusters sont fusionnés ou rejetés → ne devrait plus apparaître |
| Loading states | Remplacer « Chargement… » par des skeleton loaders (3 barres grises animées) |
| Dates | Toujours `JJ mois AAAA` en français (22 mars 2026) |
| Erreurs techniques | Remplacer les stacktraces par des messages humains |

**8.3 — Recette (5 jours)**

5 Éditions consécutives (lundi à vendredi) avec Emilie comme utilisatrice.

### Critère d'acceptation

- [ ] Toutes les pages Régie affichent des données réelles
- [ ] Aucune donnée technique visible sur le chemin éditorial
- [ ] Recette passée (cf. Partie H)

---

# PARTIE C — ARCHITECTURE TECHNIQUE

## C1. Stack complète

| Couche | Technologie | Version |
|--------|-------------|---------|
| Backend API | FastAPI | 0.115+ |
| ORM | SQLAlchemy async | 2.0+ |
| BDD | PostgreSQL + pgvector | 16 + 0.7 |
| Migrations | Alembic | 1.14+ |
| Embeddings | Cohere embed-multilingual-v3 | — |
| Clustering | HDBSCAN + UMAP | 0.8+ / 0.5+ |
| Dédup surface | datasketch (MinHash LSH) | 1.6+ |
| LLM traduction | Routage : Cerebras (AR/FA), Groq (EN/FR), Anthropic (HE) | — |
| LLM curation + génération | Anthropic Claude Sonnet 4.6 | — |
| LLM classification | Anthropic Claude Haiku 4.5 | — |
| Scheduling | APScheduler | 3.10+ |
| Frontend | Next.js 15 (App Router) | 15.5+ |
| UI | Tailwind CSS 4 | 4+ |
| State | @tanstack/react-query | 5+ |
| Drag-and-drop | @dnd-kit/core + @dnd-kit/sortable | 6+ |
| Déploiement | Railway | — |

## C2. Schéma du pipeline

```
00:00 BEY → Créer Édition J+1
06:00 UTC → Pipeline complet :

  1. COLLECTE (RSS + scrapers + Playwright)
     → articles.status = 'collected'
     → articles.edition_id = Édition ouverte

  2. TRADUCTION + RÉSUMÉ (LLM routé par langue)
     → title_fr, summary_fr, thesis_sentence
     → quality_flags, article_type
     → translation_confidence

  3. DÉDUP SURFACE (MinHash LSH, Jaccard ≥ 0.65)
     → syndication_status, syndication_group_size
     → Duplicates exclus de l'embedding

  4. EMBEDDING (Cohere embed-multilingual-v3)
     → article.embedding (1024d)
     → Représentants uniquement

  5. DÉDUP SÉMANTIQUE (cosine ≥ 0.92)
     → Fusion doublons sémantiques

  6. CLUSTERING (UMAP 15d → HDBSCAN leaf)
     → Uniquement candidats de l'Édition ouverte
     → 8-20 clusters bruts
     → Marquage fusion (cosine centroïde > 0.80)

  7. LABELS CLUSTERS (Haiku → 5-10 mots)

  8. CURATEUR (Sonnet → sommaire 4-8 sujets)
     → Validation invariants
     → Self-correction si violation
     → Persistance en Édition

  → Édition passe en CURATING
  → Le journaliste peut travailler
```

## C3. Modèle de données

Voir Sprint 4 (section 4.1) pour le SQL complet des tables `editions`, `edition_topics`, `edition_topic_articles`.

## C4. Contrats API

### Endpoints éditoriaux (chemin Composition)

```
GET /api/editions/today
→ Response: Edition (avec topics si status >= CURATING)

GET /api/editions/{date}/summary
→ Response: {
    edition: Edition,
    topics: EditionTopic[] (avec articles count, country_coverage),
    coverage_gaps: string[],
    edition_summary: string | null
  }

GET /api/editions/{date}/topic/{topic_id}
→ Response: {
    topic: EditionTopic,
    articles: {
      recommended: EditionTopicArticle[] (groupés par country),
      others: EditionTopicArticle[]
    }
  }

POST /api/editions/{date}/curate
→ Auth: Bearer token
→ Response: { summary: CuratorOutput, validation_errors: string[] }

PATCH /api/editions/{date}/topic/{topic_id}
→ Auth: Bearer token
→ Body: { title_final?: string, status?: 'accepted'|'rejected', rank?: int }
→ Response: EditionTopic

PATCH /api/edition-topic-articles/{id}
→ Auth: Bearer token
→ Body: { is_selected: boolean, rank_in_topic?: int }
→ Response: EditionTopicArticle

POST /api/editions/{date}/generate
→ Auth: Bearer token
→ Response: { text: string, topics_generated: int, articles_generated: int }
```

### Endpoints Régie (monitoring)

```
GET /api/media-sources/health
GET /api/pipeline/last-run
GET /api/dedup/groups?edition_date={date}
GET /api/clustering/report?edition_date={date}
GET /api/editions/{date}/curator-debug
POST /api/pipeline          (trigger collecte + tout)
POST /api/collect           (trigger collecte seule)
POST /api/translate         (trigger traduction seule)
POST /api/cluster           (trigger clustering seul)
```

## C5. State management frontend

```typescript
// frontend/src/lib/hooks.ts

// Édition du jour — auto-refetch toutes les 60s si status < CURATING
const useEdition = (date: string) =>
  useQuery({
    queryKey: ['edition', date],
    queryFn: () => fetchEdition(date),
    refetchInterval: (data) =>
      data?.status === 'COLLECTING' ? 10_000 : // 10s pendant collecte
      data?.status === 'CURATING' ? 60_000 :   // 60s pendant curation
      false,                                    // Pas de refetch si COMPOSING/PUBLISHED
  });

// Sommaire — inclut les topics
const useEditionSummary = (date: string) =>
  useQuery({
    queryKey: ['edition-summary', date],
    queryFn: () => fetchEditionSummary(date),
  });

// Articles d'un sujet
const useTopicArticles = (date: string, topicId: string) =>
  useQuery({
    queryKey: ['topic-articles', date, topicId],
    queryFn: () => fetchTopicArticles(date, topicId),
  });

// Mutations
const useCurate = (date: string) =>
  useMutation({
    mutationFn: () => triggerCuration(date),
    onSuccess: () => queryClient.invalidateQueries(['edition-summary', date]),
  });

const useSelectArticle = () =>
  useMutation({
    mutationFn: ({ id, selected }) => patchArticleSelection(id, selected),
    onSuccess: () => queryClient.invalidateQueries(['topic-articles']),
  });

const useGenerate = (date: string) =>
  useMutation({
    mutationFn: () => triggerGeneration(date),
  });
```

---

# PARTIE D — DESIGN SYSTEM

## D1. Principe directeur

> L'interface doit presque disparaître, tandis que la structure, la typographie, l'espacement et le séquençage éditorial portent l'expérience.

Référence : AGENTS.md du projet.

Le modèle stylistique n'est pas un dashboard SaaS. C'est un **sommaire de journal** : dense, typographique, sans décoration. L'utilisatrice (Emilie) est une journaliste professionnelle qui lit Le Monde, Courrier International, et L'Orient-Le Jour. L'interface doit ressembler à ce qu'elle lit, pas à ce qu'un développeur construit.

## D2. Typographie

| Rôle | Font | Size | Weight | Couleur | CSS class |
|------|------|------|--------|---------|-----------|
| Titre d'édition | Lora | 28px | 600 | `var(--fg)` | `.text-edition-title` |
| Titre de sujet | Lora | 20px | 600 | `var(--fg)` | `.text-topic-title` |
| Phrase-thèse (citation) | Lora | 15px | 400 italic | `var(--fg-secondary)` | `.text-thesis` |
| Corps / résumé | Inter | 14px | 400 | `var(--fg)` | `.text-body` |
| Métadonnées (média, date) | Inter | 12px | 400 | `var(--fg-muted)` | `.text-meta` |
| Labels section (IRAN, ISRAËL) | Inter | 11px | 600 · uppercase · tracking 0.12em | `var(--fg-muted)` | `.text-section-label` |
| Navigation active | Inter | 13px | 600 | `var(--fg)` | — |
| Navigation inactive | Inter | 13px | 400 | `var(--fg-muted)` | — |
| Texte généré (revue) | Lora | 15px | 400 | `var(--fg)` | `.text-review` line-height: 1.8 |

**Pourquoi Lora ?** Serif élégant, gratuit (Google Fonts), excellent rendu en français, registre « presse de qualité » sans être austère. Compatible avec l'identité OLJ.

**Pourquoi Inter ?** Sans-serif lisible pour les éléments d'interface. Tabular nums pour les chiffres. Standard.

**Chargement** :
```html
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

## D3. Palette et tokens CSS

```css
:root {
  /* Fond */
  --bg:            #ffffff;
  --bg-muted:      #f7f7f5;
  --bg-hover:      #f0efed;

  /* Texte */
  --fg:            #1a1a1a;
  --fg-secondary:  #333333;
  --fg-muted:      #888888;

  /* Bordures */
  --border:        #dddcda;
  --border-light:  #eeede9;

  /* Accent — rouge OLJ */
  --accent:        #c8102e;
  --accent-hover:  #a50d25;
  --accent-light:  #fdf2f4;

  /* Sémantique */
  --success:       #2d6a4f;
  --warning:       #92400e;
  --error:         #c8102e;

  /* Fonts */
  --font-serif:    'Lora', Georgia, serif;
  --font-sans:     'Inter', -apple-system, sans-serif;
}
```

**Règle absolue** : un seul accent (`--accent`), le rouge OLJ. Utilisé pour : nav active, bouton CTA, checkbox cochée, et rien d'autre. Tout le reste est en niveaux de gris.

## D4. Espacement et grille

```css
/* Conteneur principal */
.main-container {
  max-width: 960px;    /* ~65ch, optimal pour la lecture */
  margin: 0 auto;
  padding: 0 20px;
}

/* Espacement vertical */
--space-section:  40px;   /* Entre sections majeures */
--space-item:     24px;   /* Entre items de liste (sujets, articles) */
--space-inner:    16px;   /* Padding interne des encarts */
--space-tight:    8px;    /* Espacement serré (entre label et contenu) */
```

## D5. Composants

### Carte de sujet (Écran 1)

```css
.summary-card {
  padding: 24px 0;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background 150ms;
}
.summary-card:hover {
  background: var(--bg-muted);
  margin: 0 -20px;
  padding: 24px 20px;
}
.summary-card__rank {
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-muted);
  min-width: 24px;
}
.summary-card__title {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 600;
  color: var(--fg);
  line-height: 1.3;
}
.summary-card__thesis {
  font-family: var(--font-serif);
  font-size: 14px;
  font-style: italic;
  color: var(--fg-secondary);
  line-height: 1.5;
  margin-top: 8px;
}
.summary-card__meta {
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--fg-muted);
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}
```

### Bouton CTA (rouge OLJ)

```css
.btn-primary {
  background: var(--accent);
  color: white;
  padding: 10px 24px;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  border: none;
  border-radius: 0;     /* Coins carrés */
  cursor: pointer;
}
.btn-primary:hover {
  background: var(--accent-hover);
}
```

### Bouton secondaire

```css
.btn-secondary {
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  padding: 6px 16px;
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  border-radius: 0;
  cursor: pointer;
}
.btn-secondary:hover {
  background: var(--bg-muted);
}
```

### Checkbox

```css
.checkbox {
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--border);
  border-radius: 0;
  appearance: none;
  cursor: pointer;
}
.checkbox:checked {
  background: var(--accent);
  border-color: var(--accent);
  /* Checkmark en pseudo-element blanc */
}
```

### Séparateur pays (Écran 2)

```css
.country-separator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 6px;
  margin-bottom: 16px;
  margin-top: 32px;
  border-bottom: 1px solid var(--border);
}
.country-separator__label {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--fg-muted);
}
```

### Encart éditorial (synthèse, angles)

```css
.editorial-box {
  background: var(--bg-muted);
  padding: 16px 20px;
  border-left: 3px solid var(--border);
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--fg-secondary);
  line-height: 1.6;
}
```

### Barre flottante (bas de l'Écran 2)

```css
.floating-bar {
  position: sticky;
  bottom: 0;
  background: var(--bg);
  border-top: 1px solid var(--border);
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
```

### Skeleton loader

```css
.skeleton {
  background: linear-gradient(90deg, var(--bg-muted) 25%, var(--bg-hover) 50%, var(--bg-muted) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 2px;
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.skeleton--title { height: 20px; width: 60%; }
.skeleton--text { height: 14px; width: 100%; margin-top: 8px; }
.skeleton--meta { height: 12px; width: 40%; margin-top: 6px; }
```

## D6. Règles de design strictes

1. **Pas de cartes boxées** — les sujets sont des lignes avec `border-bottom`, pas des boîtes avec ombre
2. **Pas de badges pilule** — les types (Opinion, Éditorial) sont en texte uppercase 10px
3. **Pas de gros KPI** — les compteurs sont des facts éditoriaux, pas des tuiles de dashboard
4. **Coins carrés** — `border-radius: 0` partout (sauf le logo OLJ)
5. **Aucune ombre** — profondeur par espacement et tonalité
6. **Un seul accent** : le rouge OLJ `#c8102e`
7. **Drapeaux en emoji** : 🇱🇧 🇮🇱 🇮🇷 🇹🇷 🇸🇦 🇶🇦 🇮🇶 🇸🇾 🇪🇬 🇦🇪 🇵🇸 🇯🇴 🇰🇼 🇴🇲 🇧🇭

## D7. Micro-copy et messages système

| Situation | Message exact | Ton |
|-----------|--------------|-----|
| Curation pas lancée | Collecte en cours — {n} articles candidats. | Neutre |
| Curation en cours | Préparation du sommaire… | Sobre |
| Curation OK | (rien — le sommaire s'affiche directement) | — |
| Curation échouée | La curation automatique a échoué. | Calme |
| Source P0 absente | Pas de couverture {pays} dans cette édition. | Signal, pas alarme |
| 0 articles | Aucun article collecté dans cette fenêtre. Vérifiez les sources en Régie. | Orienté action |
| Génération en cours | Génération en cours… | Sobre |
| Copié | Copié ✓ | Minimal (disparaît après 2s) |
| Erreur réseau | Connexion perdue. Nouvelle tentative… | Factuel |
| Édition publiée | Publié le {date} à {heure}. | Factuel |

**Règles** :
- Pas de point d'exclamation
- Pas d'emoji (sauf drapeaux pays)
- Pas de jargon (« pipeline », « cluster », « embedding »)
- Toujours une action suggérée quand c'est possible

## D8. Responsive et accessibilité

**Desktop** (cible principale) : 1440×900 min (laptop 13" rédaction)
- `max-width: 960px` centré
- Navigation horizontale

**Tablette** (900-1440px) :
- Même layout, marges réduites à 12px

**Mobile** (< 900px) :
- Navigation en hamburger menu
- Drapeaux pays en ligne (wrap)
- Barre flottante pleine largeur
- Pas de drag-and-drop (mobile = lecture seule)

**Accessibilité** :
- Contraste WCAG AA : tous les textes à ≥ 4.5:1
- `aria-label` sur les checkboxes et boutons icône
- Focus visible (outline 2px solid var(--accent))
- `tabindex` correct sur le drag-and-drop
- Semantic HTML : `<main>`, `<nav>`, `<article>`, `<section>`

---

# PARTIE E — CHARTE ÉDITORIALE

## E1. Ton des sorties LLM

Les résumés générés par le LLM doivent suivre le registre OLJ :

- Français soutenu mais accessible
- Présent de narration comme temps principal
- Attribution systématique : « L'auteur estime que… », « Selon le chroniqueur… »
- Guillemets français « » avec espaces insécables
- Translittération simplifiée des noms propres arabes (pas d'alphabet arabe dans le texte FR)
- Structure QQQOCP dans les deux premières phrases
- Pas de superlatifs sauf citation directe
- Pas de première personne
- Pas de filler (« cet article traite de… », « il est intéressant de noter que… »)

## E2. Format OLJ exact

Pour chaque article dans la revue :

```
« [PHRASE-THÈSE assertive entre guillemets français] »,
écrit [Prénom Nom / « l'éditorialiste » / « l'analyste »]
dans [Nom du média] ([Pays]).

[RÉSUMÉ 3-5 phrases. Chaque phrase contient au moins une entité nommée.
Première phrase = fait ou argument principal.
Dernière phrase = implication géopolitique.]

[Nom du média], [Pays], [JJ/MM/AAAA], [Langue originale],
[Auteur ou « Éditorial » ou « Rédaction »]

[TRANSITION 1 phrase vers l'article suivant :
« À rebours de cette lecture, … »
« Dans la même veine, … »
« Plus alarmiste encore, … »
« Sous un angle tout autre, … »]
```

## E3. Ce qu'on ne montre jamais au journaliste

- Les UUIDs
- Les scores numériques bruts (0.92, 0.78) → point vert / point gris
- Les noms de modèles LLM
- Les erreurs techniques / stacktraces
- Le JSON brut
- Les paramètres d'algorithme
- Le mot « pipeline »
- Le mot « cluster » (utiliser « sujet »)
- Le mot « embedding »

---

# PARTIE F — REGISTRE DES SOURCES

## F1. Réconciliation complète

CSV Emilie : ~90 sources, 15 pays. Registre actuel : 39 sources.

### Actions urgentes (Sprint 2)

| # | Source | Pays | Action |
|---|--------|------|--------|
| 1 | Times of Israel | IL | **AJOUTER** — RSS `timesofisrael.com/feed/` |
| 2 | Al Jazeera EN | QA | **FILTRER** — plafonner à 12 articles, préférer opinion |
| 3 | Tehran Times | IR | **FIX** — augmenter timeout à 30s |
| 4 | Gulf News | AE | **DIAGNOSTIQUER** — 0 articles, RSS à vérifier |
| 5 | Arab News | SA | **DIAGNOSTIQUER** — WAF Playwright |
| 6 | Oman Observer | OM | **AJOUTER** — source Emilie, anglophone |

### Par pays (réconciliation complète)

**Israël** (critique — trou total dans le run actuel) :
- Jerusalem Post ✅ dans registre, P0, RSS opinion à vérifier
- Times of Israel ❌ → ajouter (P0)
- Haaretz ✅ dans registre, P0, paywall → résumé RSS seulement
- Israel Hayom ⚠️ 0 articles → diagnostiquer (P1)
- Ynet ⚠️ 0 articles → diagnostiquer (P1)
- Maariv ❌ hébreu → P2 (coût traduction Anthropic)

**Iran** :
- Tehran Times ✅ P0, fix timeout
- Press TV ✅ P0, fonctionne
- Iran International ✅ P1, diagnostiquer
- Kayhan, Shargh ❌ farsi → P2

**Arabie Saoudite** :
- Asharq Al-Awsat ✅ P0, vérifier production
- Arab News ✅ P0, diagnostiquer WAF
- Saudi Gazette ⚠️ P1, diagnostiquer
- Al-Arabiya ⚠️ P1, diagnostiquer
- Okaz, Al-Watan ❌ arabe → P2

**Turquie** :
- Daily Sabah ✅ P1
- Hurriyet ✅ P1
- Sabah, Milliyet, Cumhuriyet ❌ turc → P2 (via hubs opinion existants)

**Qatar** :
- Al Jazeera EN ✅ P0, filtrer
- Gulf Times ✅ P1
- The Peninsula ✅ P1
- Al Sharq, Al Watan ❌ arabe → P2

**Liban** : Annahar ✅ P0. OLJ et Al-Akhbar = P2 (scraping complexe).

**Irak** : Iraqi News ✅ P1. Rudaw ✅ P1. Al Mada ❌ P2.

**Syrie** : Enab Baladi ✅ P1. Syrian Observer ✅ P1.

**Égypte** : Al-Ahram ✅ P1. Mada Masr ✅ P1.

**EAU** : Gulf News ✅ P0 (à diagnostiquer). The National ✅ P1.

**Oman** : Oman Observer ❌ → P1 (ajouter). Al Roya ❌ → P2.

**Koweït** : Kuwait Times ✅ P1. Arab Times ✅ P1.

**Transversal** : Al-Monitor ✅ P0. Middle East Eye ✅ P0. Foreign Policy ✅ P1. New Lines ✅ P1. Le Grand Continent ✅ P2.

---

# PARTIE G — PROMPTS PRODUCTION

## G1. Tableau récapitulatif

| ID | Rôle | Modèle | Temp | Format |
|----|------|--------|------|--------|
| `translate_summarize_v2` | Traduction + résumé dense + quality_flags | Routage dynamique | 0.0 | JSON Schema |
| `cluster_label_v2` | Label factuel 5-10 mots | Haiku 4.5 | 0.0 | JSON Schema |
| `curator_v2` | Sommaire éditorial 4-8 sujets | Sonnet 4.6 | 0.2 | JSON Schema |
| `generate_review_v2` | Texte revue par sujet avec transitions | Sonnet 4.6 | 0.4 | Texte libre |
| `relevance_score_v2` | Score pertinence éditoriale 0-1 | Haiku 4.5 | 0.0 | JSON Schema |

Les prompts complets sont dans `MEMW_PROMPT_SUITE_v2.md`. Ce document est la référence.

## G2. Coût par édition

Hypothèse : 150 articles collectés, 100 traduits, 15 clusters, 6 sujets.

| Prompt | Appels | Coût estimé |
|--------|--------|-------------|
| translate_summarize | ~100 | ~$0.25 |
| cluster_label | ~15 | ~$0.01 |
| curator | 1-3 | ~$0.15 |
| generate_review | ~6 | ~$0.10 |
| relevance_score | ~100 | ~$0.02 |
| **TOTAL** | | **~$0.53/édition** |

Budget mensuel (30 éditions + infrastructure Railway) : **~$80/mois**.

---

# PARTIE H — OBSERVABILITÉ, SÉCURITÉ, RECETTE

## H1. Tables de logs

### `llm_call_logs`

| Champ | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| edition_id | FK → editions | Nullable |
| prompt_id | string | Ex: `curator_v2` |
| prompt_version | string | Ex: `2.0.3` |
| model_used | string | Ex: `claude-sonnet-4-6` |
| temperature | float | |
| input_tokens | int | |
| output_tokens | int | |
| latency_ms | int | |
| cost_usd | float | Estimé |
| output_raw | text | |
| output_parsed | JSONB | Si structured output |
| validation_errors | JSONB | Si applicable |
| created_at | timestamptz | |

### `pipeline_debug_logs`

| Champ | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| edition_id | FK → editions | |
| step | enum | `collect`, `translate`, `dedup_surface`, `embed`, `dedup_semantic`, `cluster`, `label`, `curate` |
| payload | JSONB | Rapport structuré de l'étape |
| created_at | timestamptz | |

## H2. Alertes

| Niveau | Déclencheur | Action |
|--------|-------------|--------|
| CRITICAL | Source P0 down > 18h | Email |
| CRITICAL | Curation échouée 3× | Email + message dans l'interface |
| CRITICAL | 0 articles dans la fenêtre | Email |
| WARNING | Source P1 down > 24h | Visible en Régie |
| WARNING | Syndication > 90% | Visible en Régie |
| WARNING | Bruit clustering > 20% | Visible en Régie |

## H3. Sécurité et secrets

| Variable | Service | Description |
|----------|---------|-------------|
| `DATABASE_URL` | Backend | PostgreSQL Railway |
| `ANTHROPIC_API_KEY` | Backend | Claude API |
| `GROQ_API_KEY` | Backend | Groq (traduction EN/FR) |
| `CEREBRAS_API_KEY` | Backend | Cerebras (traduction AR/FA/TR) |
| `COHERE_API_KEY` | Backend | Embeddings |
| `INTERNAL_API_KEY` | Backend + Frontend | Auth endpoints mutation |
| `NEXT_PUBLIC_API_URL` | Frontend | URL backend |

CORS production : `allow_origins` restreint au domaine frontend Railway.

## H4. Critères de recette finale

### Les 5 critères (vérifiés sur 5 Éditions consécutives avec Emilie)

| # | Critère | Seuil |
|---|---------|-------|
| 1 | Temps de composition (ouverture → copier-coller) | **≤ 30 min** |
| 2 | Sommaire valide (Curateur sans violation d'invariant) | **100%** des Éditions |
| 3 | Acceptation sujets (Emilie accepte les sujets proposés) | **> 60%** des sujets |
| 4 | Sources P0 actives | **≥ 10 sur 12** |
| 5 | Alertes CRITICAL non résolues > 2h | **0** |

### Checklist technique

- [ ] Pipeline complet 2×/jour sans erreur
- [ ] Édition créée automatiquement chaque jour
- [ ] Dédup réduit le corpus de > 40%
- [ ] 8-20 clusters bruts par Édition
- [ ] Curateur produit 4-8 sujets avec diversité pays
- [ ] Texte généré au format OLJ exact
- [ ] Prompts dans des fichiers YAML
- [ ] Auth sur tous les POST
- [ ] Parcours Sommaire → Sujet → Composition en < 5 clics
- [ ] 0 donnée technique sur le chemin éditorial

### Checklist éditoriale (Emilie)

- [ ] Phrases-thèses percutantes et fidèles
- [ ] Résumés denses, sans filler, 3-5 phrases
- [ ] Fiches (média, pays, date, langue, auteur) complètes
- [ ] Transitions entre articles naturelles
- [ ] Texte copié-collé prêt à publier après relecture légère
- [ ] Lacunes de couverture signalées
- [ ] Bruit lifestyle absent

---

## Questions ouvertes pour Emilie (à valider avant Sprint 2)

1. **P0 sources** : quelles 8-12 sources rendent la revue impubliable si absentes ?
2. **Fenêtres temporelles** : confirmer vendredi 18h → lundi 6h Beyrouth pour le lundi ?
3. **Nombre de sujets cible** : 4-8 confirmé ?
4. **Qualité traduction arabe** : tester 10 articles arabes avec relecture humaine ?
5. **Hébreu** (Maariv, Yediot) : Anthropic seul → coût additionnel acceptable ?
6. **Farsi** (Kayhan, Shargh) : même question ?
7. **Chapeau** : le système doit-il pré-proposer une liste de sujets pour aider la rédaction du chapeau ?

---

*Fin de la spécification. Version 3.0 FINALE — 22 mars 2026.*
*Ce document est la source de vérité unique pour les 8 sprints de mise en production.*
*Tout ce qui n'est pas dans ce document n'existe pas dans le périmètre.*
