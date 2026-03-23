# Audit de finalisation — Revue de presse régionale OLJ

**Projet** : Media Watch v2 — breve_de_presse_PMO
**Branche** : main (le repo n'a pas de branche v2 distante)
**Staging** : frontendpmo-staging.up.railway.app
**Date** : 23 mars 2026
**Commanditaire** : Sami Nakib pour L'Orient-Le Jour (Emilie Sueur)

---

## 1. Résumé exécutif

Le prototype fonctionne bout en bout : collecte → traduction → embedding → clustering → labelling → sélection → génération. La qualité des briques unitaires (traducteur, générateur OLJ, système de pertinence) est solide. Le problème central est ailleurs : **le clustering produit des regroupements éditorialement inutilisables**, et l'interface de sélection ne donne pas au journaliste les informations dont il a besoin pour travailler vite et bien.

**Verdict** : le système est à ~60 % du livrable. Les fondations (pipeline, LLM routing, modèle de données, générateur) sont saines. Mais la couche « aide à la sélection » — clustering, labelling, sommaire, dashboard — doit être repensée en profondeur. Pas réécrite intégralement : recadrée sur le vrai besoin éditorial.

**Les trois urgences** :

1. Le clustering ne sert pas le journaliste — le remplacer par un système d'angles éditoriaux contrôlés.
2. Le sommaire / la page édition sont des coquilles vides — construire une vraie page de travail quotidienne.
3. 1 237 articles sur ~1 400 ne sont classés dans aucun sujet — c'est le symptôme principal du clustering défaillant.

---

## 2. Produit cible reconstitué

### À quoi sert l'outil

Permettre à un journaliste OLJ de produire chaque matin une *revue de presse régionale* montrant comment les médias de la région (Iran, Israël, Golfe, Turquie, Liban, Irak, Syrie…) regardent les développements en cours — principalement la guerre, les tensions régionales, la diplomatie.

### Qui l'utilise

Un ou deux journalistes d'OLJ. Pas le grand public. C'est un **outil interne de fabrication éditoriale**.

### Rôle exact de l'humain

1. **Matin** : ouvre la page du jour, parcourt les articles collectés et traduits pendant la nuit.
2. **Sélection** : choisit 3 à 6 articles d'opinion/éditoriaux/tribunes provenant de médias différents, couvrant des angles complémentaires.
3. **Génération** : lance la génération des blocs formatés OLJ.
4. **Relecture** : relit, corrige si nécessaire, copie-colle dans le CMS.

### Sortie éditoriale finale

Un article OLJ structuré ainsi :

```
Titre général (fait par un humain)
Chapô (fait par un humain)

« Phrase-thèse percutante de l'auteur 1 »

Résumé : [150-200 mots, ton neutre, restitution fidèle]

Fiche :
Article publié dans [média]
Le [date]
Langue originale : [langue]
Pays du média : [pays]
Nom de l'auteur : [auteur]

« Phrase-thèse percutante de l'auteur 2 »

Résumé : [...]

Fiche : [...]

[etc., 3 à 6 entrées]
```

### Ce qui relève du back-office interne

Pipeline de collecte, traduction, embedding — le journaliste ne le voit pas.

### Ce qui relève de l'aide à la sélection

Le dashboard / sommaire / regroupement d'articles — c'est **le cœur de l'outil**, la valeur ajoutée réelle.

### Ce qui relève de la génération de texte

Le générateur (`generator.py`) — déjà bien aligné sur le format Emilie.

### Ce qui ne sert pas l'objectif

La régie technique (clustering UMAP/HDBSCAN visible, paramètres exposés), les pages placeholder (pipeline, dedup, curateur, logs) — utile pour le debug mais pas pour le produit.

---

## 3. Cartographie technique du repo

### Structure

```
backend/
  src/
    models/         → Article, TopicCluster, Review, ReviewItem, MediaSource, Entity
    routers/        → articles, clusters, pipeline, reviews, health
    services/       → collector, translator, embedding, clustering, cluster_labeller,
                      generator, relevance, editorial_scope, llm_router, scheduler,
                      web_scraper, playwright_scraper
    scripts/        → seed_media
  data/             → MEDIA_REGISTRY.json (39 sources, 12 pays)
  alembic/          → migrations

frontend/
  src/
    app/            → page.tsx (dashboard), articles/, clusters/[id]/, review/
    components/     → articles/, clusters/, dashboard/, review/, layout/
    lib/            → api.ts, types.ts, utils.ts
```

### Pipeline de données (séquentielle)

```
Collecte (RSS + web scraper + Playwright)
  → Articles status='collected'
  → Traduction (LLM router : Cerebras/Groq/Anthropic)
  → Articles status='translated' avec title_fr, summary_fr, thesis_summary_fr, article_type
  → Embedding (Cohere embed-multilingual-v3.0, 1024 dim)
  → Clustering (HDBSCAN sur embeddings normalisés, fenêtre 48h)
  → Labelling (LLM → label texte par cluster)
  → [Sélection humaine]
  → Génération (LLM → blocs formatés OLJ)
  → [Copier-coller dans CMS]
```

---

## 4. Audit pipeline étape par étape

### 4.1 Collecte (`collector.py`, `web_scraper.py`, `playwright_scraper.py`)

**Observation** : pipeline de collecte robuste. RSS avec trafilatura, extraction d'auteur propre, rate limiting par domaine, détection de langue avec py3langid, filtre éditorial à l'ingestion (`editorial_scope.py`). Le registre médias couvre 39 sources dans 12 pays.

**Problème** : beaucoup de sources ont `is_active: false` et `collection_method: "scraping"` sans implémentation, ce qui signifie que la couverture réelle est probablement inférieure aux 39 sources annoncées. Les stats du matin montrent 19 pays — cohérent avec la collecte fonctionnelle.

**Verdict** : ✅ fonctionnel, suffisant pour un MVP.

### 4.2 Traduction (`translator.py`)

**Observation** : architecture LLM hybride bien pensée (Cerebras pour ar/fa/tr/ku, Groq pour en/fr, Anthropic pour hébreu). Sortie JSON structurée avec titre FR, thèse, résumé (Chain of Density), citations, type, entités. Score de confiance calculé à partir de signaux réels (longueur contenu, qualité résumé), pas d'auto-évaluation LLM.

**Problème mineur** : le sémaphore est à 2 (`asyncio.Semaphore(2)`), ce qui est très conservateur pour Groq/Cerebras qui supportent bien plus de concurrence. Cela ralentit inutilement la traduction de 300+ articles.

**Verdict** : ✅ solide.

### 4.3 Pertinence (`relevance.py`)

**Observation** : score 0-100 composite (pays 30%, type 30%, fraîcheur 20%, tier 10%, bonus langue + richesse). Logique transparente et raisonnable.

**Problème** : le score est calculé **à la volée** dans le router articles (`_to_response`), pas persisté. Il est donc recalculé à chaque requête, et le tri par pertinence est « partiel par page » (le frontend le dit explicitement). Ce n'est pas bloquant mais c'est un signal de dette.

**Verdict** : ✅ suffisant, mais persister le score faciliterait le tri global.

### 4.4 Embedding (`embedding_service.py`)

**Observation** : Cohere `embed-multilingual-v3.0` sur `title_fr + summary_fr`. Batch de 96. Ne traite que les articles éditoriaux (opinion/editorial/tribune/analysis) quand `embed_only_editorial_types=True`.

**Problème** : l'embedding est fait **sur la version française** seulement. Pour des articles traduits depuis l'arabe, le persan ou le turc, la qualité de l'embedding dépend entièrement de la qualité de la traduction. Si le résumé FR est faible, l'embedding est bruité.

**Verdict** : ⚠️ acceptable mais fragile.

### 4.5 Clustering (`clustering_service.py`) — PROBLÈME MAJEUR

**Observation** : HDBSCAN sur embeddings L2-normalisés, fenêtre 48h, `min_cluster_size=6`, `min_samples=5`, méthode `leaf`. Raffinement récursif des méga-clusters (>72 articles). À chaque run, **tous les clusters sont détruits et recréés** (`update(Article).values(cluster_id=None)` + `update(TopicCluster).values(is_active=False)`).

**Problèmes graves** :

1. **1 237 articles non classés** sur ~1 400 collectés. C'est un taux de bruit de ~88%. HDBSCAN avec `min_cluster_size=6` et `min_samples=5` est trop restrictif pour ce corpus.

2. **Clusters éditorialement absurdes**. Le dump des sujets du matin montre :
   - *« Débats sociaux et politiques au Moyen-Orient »* — 14 articles, 7 pays. C'est un fourre-tout sans valeur éditoriale.
   - *« Débats culturels et tensions politiques au Golfe »* — 11 articles, 4 pays. Même problème.
   - *« Réflexions spirituelles et culturelles du Ramadan et de l'Aïd »* — 8 articles, 5 pays. Hors périmètre revue géopolitique.
   - *« Transformation saoudienne sous Mohammed ben Salmane et Vision 2030 »* — 11 articles, seulement Bahreïn + Oman en couverture (pas l'Arabie saoudite elle-même ?).
   - *« Escalade États-Unis/Israël contre l'Iran et détroit d'Ormuz »* — **45 articles**, 11 pays. C'est un méga-cluster qui englobe tout le sujet principal de la semaine sans le découper.

3. **Destruction-recréation à chaque run** : les cluster IDs changent, donc aucun suivi temporel possible. Un journaliste ne peut pas reprendre son travail d'un jour à l'autre.

4. **Aucune notion d'angle éditorial**. Le clustering regroupe par proximité sémantique brute. Or ce dont le journaliste a besoin, c'est de voir des *angles* : « L'Iran riposte au Golfe — les réactions arabes », « Le Pentagone demande des fonds — vue depuis Washington », « Le trafic à Ormuz — les données ». La proximité sémantique ne capture pas ça.

**Verdict** : ❌ non livrable en l'état. Cause racine de la plupart des problèmes UX.

### 4.6 Labelling (`cluster_labeller.py`)

**Observation** : LLM génère un label à partir des 12 articles les plus confiants du cluster. Prompt bien calibré (refuse les labels fourre-tout, détecte le hors-périmètre).

**Problème** : le labelling ne peut pas sauver un clustering bancal. Si le cluster est un fourre-tout, le label sera soit vague (« Débats sociaux et politiques au Moyen-Orient »), soit trompeur.

**Verdict** : ⚠️ la brique est bonne, mais elle est au service d'une abstraction cassée.

### 4.7 Génération (`generator.py`)

**Observation** : prompt OLJ très bien calibré, format exact respecté (phrase-thèse entre « », résumé 150-200 mots, fiche complète). Vérification du word count. Persistance en base (Review + ReviewItem).

**Problème mineur** : le comptage de mots est un simple `split()`, qui ne gère pas bien la ponctuation française. Pas critique.

**Verdict** : ✅ solide, prêt pour la production.

---

## 5. Audit éditorial / métier

### L'unité de travail pertinente n'est PAS un « cluster »

Le journaliste OLJ ne pense pas en clusters sémantiques. Il pense en **articles individuels** porteurs d'un **angle** intéressant. Sa question du matin n'est pas « quels sont les thèmes détectés ? » mais plutôt :

- « Quels éditoriaux marquants sont parus cette nuit ? »
- « Y a-t-il des prises de position fortes sur [événement du jour] ? »
- « Quels médias/pays n'ai-je pas couverts récemment ? »
- « Quel article me donne un angle original pour la revue ? »

Le clustering ajoute un niveau d'indirection qui **empêche** de répondre à ces questions. Un article classé dans un cluster de 45 textes est aussi introuvable qu'un article non classé.

### Les regroupements ne sont pas éditorialement intelligibles

Comparer les sujets du matin avec la revue publiée (exemple fourni par Emilie) est révélateur :

**Revue publiée** (4 entrées bien distinctes) :
- Knesset israélienne en temps de guerre → JPost, Israël
- Culture du martyre en Iran → Tehran Times, Iran
- Pentagone demande 200 Md$ → Asharq Al-Awsat, Arabie Saoudite
- Trafic maritime à Ormuz → Iraqi News, Irak

Ce sont 4 articles d'opinion **de 4 pays différents**, choisis pour la diversité géographique et la complémentarité des angles. Aucun des 20+ clusters actuels ne guide naturellement vers cette sélection.

### Les résumés sont utilisables

Les `summary_fr` et `thesis_summary_fr` produits par le traducteur sont de bonne qualité d'après l'exemple de revue — les blocs générés sont exploitables. C'est un point fort.

### Ce qui manque au journaliste

1. Une **vue plate des articles du jour**, triés par pertinence éditoriale, avec possibilité de filtrer par pays/média/type.
2. La **thèse de chaque article visible immédiatement** (pas cachée derrière un clic).
3. Un **indicateur de couverture géographique** de sa sélection en cours (« vous avez 2 articles du Golfe, rien d'Israël, rien d'Iran »).
4. La possibilité de **chercher par événement** (Ormuz, Knesset, frappes iraniennes).

---

## 6. Audit UX/UI

### 6.1 Dashboard (`/dashboard`)

**Observation** : affiche la liste des clusters triés par pertinence, avec article_count, country_count, et drapeaux pays. Boutons pipeline (Collecte / Traduction / Refresh clusters / Pipeline complet).

**Problèmes** :
- **Chargement…** affiché indéfiniment si le backend ne répond pas ou si la date ne matche pas.
- **Aucune information article-level** : le journaliste ne voit que des labels de cluster. Impossible de savoir quel article est dans quel cluster sans cliquer.
- **L'extrait principal** (visible dans le dump TXT mais pas dans le HTML fetché) est un bon début, mais il est tronqué et le second extrait est souvent sans contexte.
- **1 237 articles non classés** mentionnés en bas — ce chiffre devrait alarmer l'utilisateur, pas être un compteur discret.

### 6.2 Page édition (`/edition/2026-03-23`)

**Observation** : affiche « Préparation du sommaire… » ad vitam aeternam.

**Cause probable** : il n'existe **aucune route backend** pour le sommaire daté. Le frontend `page.tsx` de la racine est mappé sur l'édition du jour mais charge les mêmes données que le dashboard. La page `/edition/DATE` n'a pas de composant dédié visible dans le repo — le routing Next.js tombe sur la page par défaut qui tente de charger un sommaire qui n'existe pas.

**Verdict** : ❌ non fonctionnel.

### 6.3 Page articles (`/articles`)

**Observation** : la meilleure page de l'outil. Vue plate des articles avec filtres (pays, type, confiance), tri par pertinence ou date, pagination infinie, sélection checkbox, barre de sélection fixe en bas.

**Problèmes** :
- **Par défaut filtre `min_confidence=0.7`** et types éditoriaux — c'est correct mais le journaliste ne le voit pas clairement.
- **La thèse n'est visible qu'après expansion** — elle devrait être la première information visible.
- **Pas de regroupement par événement/angle** — la liste plate fonctionne jusqu'à ~50 articles, au-delà c'est illisible.

### 6.4 Page review (`/review`)

**Observation** : affiche la sélection (via sessionStorage), bouton « Générer la revue », prévisualisation du texte, copier/télécharger.

**Problème majeur** : les IDs d'articles sont stockés en **sessionStorage**. Si le journaliste ferme l'onglet, tout est perdu. La sélection devrait être persistée côté serveur (elle l'est via Review + ReviewItem, mais seulement **après** génération).

### 6.5 Page cluster detail (`/clusters/[id]`)

**Observation** : articles groupés par pays, checkboxes de sélection, barre fixe « Générer la revue ».

**Problème** : une fois dans un cluster de 45 articles, le journaliste est noyé. Pas de tri par pertinence à l'intérieur du cluster, pas de highlight des articles les plus intéressants.

### 6.6 Parcours utilisateur actuel

```
Dashboard → voit 20 clusters vagues → clique un cluster → voit des articles
→ sélectionne → va dans /review → génère → copie-colle
```

**Parcours souhaitable** :

```
Page du jour → voit les 30-50 meilleurs articles du jour, thèse visible,
groupés par angle/événement → sélectionne 3-6 → indicateur de couverture
→ génère → relit → copie-colle
```

---

## 7. Diagnostic des causes racines

### Problème 1 : Clusters éditorialement inutiles

| | |
|---|---|
| **Symptôme** | Labels fourre-tout, méga-clusters, 88% de bruit |
| **Cause racine** | HDBSCAN sur embeddings de résumés FR est trop généraliste. Les articles d'opinion du Moyen-Orient partagent un champ sémantique étroit (guerre, Iran, Israël, Golfe), ce qui crée soit un méga-cluster « la guerre », soit du bruit. `min_cluster_size=6` est trop haut pour des angles fins. |
| **Modules** | `clustering_service.py`, `embedding_service.py`, `cluster_labeller.py` |
| **Impact éditorial** | CRITIQUE — le journaliste ne peut pas travailler |
| **Confiance** | Haute (corroboré par le dump des sujets) |

### Problème 2 : Sommaire / édition non fonctionnel

| | |
|---|---|
| **Symptôme** | « Préparation du sommaire… » permanent |
| **Cause racine** | Pas de route backend `/api/edition/:date`, pas de composant frontend dédié. Le concept d'édition datée n'existe pas dans le modèle de données (Review a un `review_date` mais pas de concept de « sommaire de préparation »). |
| **Modules** | Frontend routing, absence de route backend |
| **Impact éditorial** | CRITIQUE — pas de page de travail quotidienne |
| **Confiance** | Haute (code source inspecté) |

### Problème 3 : Perte de sélection

| | |
|---|---|
| **Symptôme** | La sélection est perdue si l'onglet est fermé |
| **Cause racine** | sessionStorage dans `review/page.tsx` et `clusters/[id]/page.tsx` |
| **Impact éditorial** | Moyen — frustrant mais contournable |
| **Confiance** | Haute |

### Problème 4 : Normalisation des pays incohérente

| | |
|---|---|
| **Symptôme** | « Arabie saoudite » vs « Arabie Saoudite » dans les stats du matin (60 + 44 = 104 articles comptés séparément) ; « EAU » vs « Emirats arabes unis » |
| **Cause racine** | La table `media_sources` a `country` en texte libre, et le registre JSON n'est pas normalisé. Le code utilise parfois `country_code` (ISO), parfois `country` (display name). |
| **Modules** | `MEDIA_REGISTRY.json`, `media_source.py`, `clustering_service.py` (REGIONAL_COUNTRIES set) |
| **Impact éditorial** | Moyen — comptages faux, filtres cassés |
| **Confiance** | Haute (visible dans le dump stats) |

---

## 8. Analyse du clustering et alternatives

### Critique du clustering actuel

Le clustering HDBSCAN non supervisé sur embeddings sémantiques est la **mauvaise abstraction** pour ce cas d'usage, pour trois raisons :

1. **Corpus trop homogène**. 80% des articles parlent de la même guerre. Les embeddings sont tous dans un voisinage serré. HDBSCAN peine à trouver des sous-structures significatives dans un espace aussi dense et uniformément orienté.

2. **La notion de « sujet » est éditorialement vide**. Un sujet comme « Escalade États-Unis/Israël contre l'Iran » contient 45 articles — c'est pratiquement le sujet de la semaine entière. Ce n'est pas un regroupement : c'est tout le corpus.

3. **Le journaliste ne cherche pas des topics, il cherche des articles singuliers**. La revue de presse est une sélection d'articles d'opinion individuels, pas un résumé thématique. Le clustering résout un problème que le journaliste n'a pas.

### Alternatives évaluées

#### Option A : Clustering hiérarchique contraint (HDBSCAN + sous-découpe)

C'est ce que fait déjà `_refine_mega_clusters`. Le problème : le raffinement produit des sous-clusters qui sont des subdivisions arbitraires d'un espace continu, pas des angles éditoriaux.

**Coût** : faible. **Bénéfice** : marginal. **Recommandation** : non.

#### Option B : Classification supervisée par axes éditoriaux contrôlés

Définir 10-15 axes éditoriaux stables (« Conflit Iran-USA », « Politique intérieure israélienne », « Diplomatie Golfe », « Front libanais », « Énergie et Ormuz », etc.) et classer chaque article dans un ou plusieurs axes via LLM.

**Avantages** : axes stables et intelligibles, un article peut appartenir à plusieurs axes, le journaliste comprend immédiatement la structure.
**Limites** : nécessite de maintenir la liste d'axes, rigide face à un événement imprévu.
**Coût** : moyen (un prompt LLM de classification par article, intégrable dans la traduction).
**Recommandation** : **oui, en combinaison avec C**.

#### Option C : Abandon du clustering au profit d'un système de signaux éditoriaux

Ne pas regrouper. Montrer une **liste plate d'articles** triés par pertinence éditoriale, avec des **tags visibles** : pays, type, événement principal, thèse en une phrase. Le journaliste filtre et sélectionne directement.

**Avantages** : simple, transparent, aligné avec le workflow réel (le journaliste scanne une liste), aucun regroupement éditorialement douteux.
**Limites** : si le corpus dépasse 100 articles/jour, la liste plate devient longue.
**Coût** : faible (le scoring de pertinence existe déjà).
**Recommandation** : **oui, comme architecture principale**.

#### Option D : Architecture hybride « événements + angles » en 2 couches

Couche 1 : LLM détecte les 3-5 événements majeurs du jour (macro).
Couche 2 : chaque article est classé par événement + angle éditorial.
Affichage : articles groupés par événement, triés par singularité de l'angle.

**Avantages** : le meilleur des deux mondes — structure intelligible sans rigidité.
**Limites** : plus complexe à implémenter, latence LLM supplémentaire.
**Coût** : élevé.
**Recommandation** : option v2 post-livraison.

### Recommandation finale sur le clustering

**Supprimer le clustering HDBSCAN comme mécanisme de navigation principal.** Le remplacer par :

1. **Vue principale** : liste plate d'articles du jour, triés par pertinence, thèse visible, filtres pays/type/langue.
2. **Tags d'angle** : un champ `editorial_angle` ajouté lors de la traduction (le LLM classifie l'angle en même temps que le type). Exemples : « Réaction arabe aux frappes », « Politique intérieure israélienne », « Crise énergétique Ormuz ».
3. **Filtrage par angle** : le journaliste peut grouper par angle s'il le souhaite, ou rester en vue plate.

Cela réutilise le pipeline existant (le prompt de traduction est enrichi d'un champ), supprime la dépendance à HDBSCAN/Cohere embeddings pour la navigation, et aligne le produit sur le workflow réel.

---

## 9. Proposition d'architecture finale cible

### Pipeline cible

```
Collecte (inchangé)
  → Traduction + Classification élargie
     (ajouter : editorial_angle, is_flagship, event_tags)
  → [Embedding optionnel, pour recherche sémantique future]
  → Scoring de pertinence (persisté en base)
  → Page du jour : articles du jour triés par pertinence
  → Sélection humaine (persistée côté serveur)
  → Génération des blocs OLJ
  → Relecture → Copier-coller
```

### Modèle de données cible

Ajouter à `Article` :

```python
editorial_angle: Optional[str]    # "Réaction arabe aux frappes", "Crise Ormuz"...
event_tags: Optional[list[str]]   # ["frappes_iran", "ormuz", "knesset"]
is_flagship: Optional[bool]       # LLM juge que l'article est "marquant" (thèse forte, auteur connu)
editorial_relevance: Optional[int] # Score 0-100, persisté
```

Ajouter un modèle `DailyEdition` :

```python
class DailyEdition(Base):
    id: UUID
    edition_date: date              # unique
    selected_article_ids: list[UUID] # sélection en cours
    status: str                     # 'draft', 'generating', 'ready', 'published'
    journalist_notes: Optional[str]
```

### Logique de ranking cible

Score composite enrichi :

- Pertinence pays (30%) — inchangé
- Type éditorial (25%) — opinion/éditorial/tribune favorisés
- Fraîcheur (15%) — dernier 12h en priorité
- Singularité (15%) — articles dont l'angle ou le média est rare dans le corpus du jour
- Confiance traduction (10%) — articles bien traduits
- Tier source (5%) — T1 > T2 > T3

### Structure idéale du dashboard

**Page unique « Édition du jour »** :

- En-tête : date, nombre d'articles disponibles, couverture pays (carte ou badges)
- Section principale : articles triés par pertinence, thèse visible pour chaque article, checkbox de sélection
- Barre latérale ou filtres en haut : pays, angle, type, langue, recherche texte
- Barre de sélection fixe en bas : articles sélectionnés (avec couverture géographique), bouton « Générer »
- Indicateur : « Votre sélection couvre : 🇱🇧 🇮🇱 🇮🇷 — manque : Golfe, Turquie »

### Structure idéale de la sortie texte

Inchangée par rapport au format Emilie — le générateur actuel est déjà aligné.

---

## 10. Plan de finalisation priorisé

### P0 — Indispensable avant livraison

#### P0.1 — Créer la page « Édition du jour » comme page principale

**Objectif** : donner au journaliste sa page de travail quotidienne.
**Problème résolu** : le sommaire ne marche pas, le dashboard est technique.
**Modules** : nouveau composant frontend, nouvelle route backend `/api/editions/:date`.
**Ce qu'il faut faire** :
- Backend : créer le modèle `DailyEdition`, route GET/POST pour sélection persistée.
- Frontend : fusionner la logique de `/articles` (liste plate, filtres) et `/review` (sélection, génération) en une seule page.
- La thèse (`thesis_summary_fr`) doit être visible sans clic pour chaque article.
- Indicateur de couverture géographique de la sélection en cours.
**Difficulté** : moyenne. **Risque** : faible. **Bénéfice éditorial** : maximal.

#### P0.2 — Persister le score de pertinence

**Objectif** : tri global fiable, pas « partiel par page ».
**Modules** : `relevance.py`, `translator.py` (calcul au moment de la traduction), `article.py` (champ `editorial_relevance`).
**Ce qu'il faut faire** : ajouter `editorial_relevance` comme colonne persistée, calculé après traduction, index dessus pour le tri.
**Difficulté** : faible. **Risque** : faible. **Bénéfice** : tri correct.

#### P0.3 — Ajouter `editorial_angle` au prompt de traduction

**Objectif** : permettre le filtrage par angle éditorial sans clustering.
**Modules** : `translator.py` (prompt enrichi), `article.py` (nouveau champ).
**Ce qu'il faut faire** : ajouter dans le `required_output` du prompt traduction un champ `editorial_angle` avec consigne (« 3-8 mots décrivant l'angle : 'Réaction saoudienne aux frappes iraniennes', 'Budget défense américain', etc. »).
**Difficulté** : faible. **Risque** : faible. **Bénéfice éditorial** : élevé.

#### P0.4 — Normaliser les noms de pays

**Objectif** : supprimer les doublons « Arabie saoudite » / « Arabie Saoudite » / « EAU » / « Emirats arabes unis ».
**Modules** : `MEDIA_REGISTRY.json`, `media_source.py`, `clustering_service.py`.
**Ce qu'il faut faire** : normaliser `country` dans le registre, utiliser `country_code` comme clé primaire partout, mapper au display FR dans le frontend.
**Difficulté** : faible. **Risque** : faible. **Bénéfice** : comptages corrects.

#### P0.5 — Persister la sélection côté serveur

**Objectif** : ne plus perdre la sélection en fermant l'onglet.
**Modules** : `DailyEdition` backend, frontend review page.
**Ce qu'il faut faire** : chaque ajout/retrait d'article appelle l'API, la sélection est persistée.
**Difficulté** : faible. **Risque** : faible. **Bénéfice** : fiabilité.

### P1 — Très important

#### P1.1 — Reléguer le clustering comme option secondaire

**Objectif** : ne plus forcer le journaliste à passer par les clusters.
**Ce qu'il faut faire** : garder le clustering en régie technique (utile pour explorer le corpus), mais la page de travail principale est la liste plate triée par pertinence.
**Bénéfice** : clarté du parcours utilisateur.

#### P1.2 — Ajouter la recherche texte

**Objectif** : permettre « Ormuz », « Knesset », « pétrole » comme raccourci.
**Modules** : route backend `/api/articles?q=...`, recherche full-text PostgreSQL.
**Difficulté** : faible (PostgreSQL `ts_vector` ou simple `ILIKE`).

#### P1.3 — Augmenter la concurrence traduction

**Objectif** : passer de 2 à 5-8 le sémaphore pour diviser le temps de traduction.
**Module** : `translator.py`, `Semaphore(2)` → `Semaphore(6)`.
**Difficulté** : triviale. **Risque** : rate limits providers (à monitorer).

#### P1.4 — Conventions typographiques : italique vs guillemets

**Objectif** : utiliser l'italique pour les titres/accroches dans l'interface, guillemets français dans la sortie texte.
**Module** : composants frontend (`cluster-card.tsx`, `article-card.tsx`).
**Difficulté** : faible.

### P2 — Amélioration forte mais non bloquante

#### P2.1 — Détection automatique des événements du jour

Un prompt LLM qui prend les 20 articles les plus pertinents et identifie 3-5 événements macro. Permet de proposer des groupes au journaliste sans clustering aveugle.

#### P2.2 — Indicateur de diversité/couverture

Badge visuel montrant quels pays/médias sont représentés dans la sélection, et ce qui manque pour une couverture équilibrée.

#### P2.3 — Mode brouillon pour les blocs générés

Permettre au journaliste de modifier le texte généré directement dans l'interface avant de copier.

### P3 — Plus tard

- UMAP visualisation interactive en régie (utile pour debug, pas pour édition)
- Notification quand la pipeline du matin est terminée
- Historique des revues publiées avec statistiques de couverture
- API webhook vers le CMS OLJ pour publication directe

---

## 11. Tickets d'implémentation

### Ticket 1 — [P0] Modèle DailyEdition + route API

**Pourquoi** : le concept d'édition datée n'existe pas dans le backend.
**Quoi** : nouveau modèle SQLAlchemy `DailyEdition`, migration Alembic, routes `GET /api/editions/:date`, `POST /api/editions/:date/select`, `DELETE /api/editions/:date/select/:article_id`.
**Validation** : `GET /api/editions/2026-03-23` retourne une édition avec articles sélectionnés.
**Dépendances** : aucune.
**Estimation** : 3-4h.

### Ticket 2 — [P0] Persister editorial_relevance

**Pourquoi** : le tri global par pertinence est actuellement faux (calculé par page).
**Quoi** : ajouter colonne `editorial_relevance` à `articles`, calculer dans `translator.py` après traduction, index B-tree dessus.
**Validation** : `GET /api/articles?sort=relevance` retourne un tri global correct.
**Dépendances** : aucune.
**Estimation** : 2h.

### Ticket 3 — [P0] Ajouter editorial_angle au prompt de traduction

**Pourquoi** : le filtering par angle remplace le clustering comme outil de navigation.
**Quoi** : ajouter `editorial_angle` dans `required_output` du prompt traduction, nouveau champ article, exposer dans l'API articles.
**Validation** : articles traduits ont un `editorial_angle` significatif (pas « opinion sur la guerre »).
**Dépendances** : aucune.
**Estimation** : 2h.

### Ticket 4 — [P0] Page « Édition du jour » frontend

**Pourquoi** : le journaliste a besoin d'une page de travail unique.
**Quoi** : nouveau composant `/app/edition/[date]/page.tsx`. Fusionner la logique articles (liste, filtres, sélection) et review (génération, prévisualisation). Thèse visible sans clic. Barre de sélection avec couverture pays.
**Validation** : un journaliste peut ouvrir `/edition/2026-03-23`, scanner les articles, sélectionner 4, générer la revue, copier le texte — en une seule page.
**Dépendances** : tickets 1, 2, 3.
**Estimation** : 8-10h.

### Ticket 5 — [P0] Normaliser les pays

**Pourquoi** : doublons dans les comptages et filtres.
**Quoi** : auditer `MEDIA_REGISTRY.json`, normaliser le champ `country`, utiliser `country_code` comme référence unique, mapper au display FR côté frontend.
**Validation** : les stats ne montrent plus « Arabie saoudite » ET « Arabie Saoudite ».
**Dépendances** : aucune.
**Estimation** : 1-2h.

### Ticket 6 — [P0] Sélection persistée côté serveur

**Pourquoi** : sessionStorage = perte de travail.
**Quoi** : appels API à chaque toggle de sélection, backend persiste dans `DailyEdition.selected_article_ids`.
**Validation** : fermer et rouvrir l'onglet conserve la sélection.
**Dépendances** : ticket 1.
**Estimation** : 2-3h.

### Ticket 7 — [P1] Recherche texte articles

**Pourquoi** : raccourci essentiel pour le journaliste.
**Quoi** : param `q` sur `GET /api/articles`, recherche PostgreSQL `ILIKE` sur `title_fr`, `summary_fr`, `thesis_summary_fr`.
**Validation** : `?q=Ormuz` retourne les articles sur le détroit.
**Dépendances** : aucune.
**Estimation** : 2h.

### Ticket 8 — [P1] Reléguer clustering en régie

**Pourquoi** : ne plus imposer les clusters comme navigation principale.
**Quoi** : retirer le lien « Sujets du jour » de la navigation principale, le garder sous « Régie technique ». La page d'accueil (`/`) redirige vers `/edition/[today]`.
**Validation** : le parcours principal ne passe plus par les clusters.
**Dépendances** : ticket 4.
**Estimation** : 1h.

---

## 12. Critères d'acceptation

### Critères éditoriaux

- [ ] Un journaliste peut produire une revue de presse de 4 entrées en moins de 20 minutes.
- [ ] Les 30 articles les plus pertinents du jour sont visibles sur la première page sans scroll excessif.
- [ ] La thèse de chaque article est lisible sans clic.
- [ ] La sélection couvre au moins 3 pays différents (indicateur visible).
- [ ] Le texte généré respecte le format Emilie (phrase-thèse + résumé 150-200 mots + fiche).
- [ ] Les noms de pays sont normalisés et cohérents.

### Critères UX

- [ ] La page d'édition charge en moins de 3 secondes.
- [ ] La sélection persiste entre sessions.
- [ ] Les filtres (pays, type, angle) fonctionnent.
- [ ] Le parcours principal ne nécessite pas plus de 2 pages (édition → résultat).

### Critères de qualité de regroupement

- [ ] Moins de 30% d'articles « non classés » (actuellement 88%).
- [ ] Aucun groupe de plus de 15 articles (actuellement 45).
- [ ] Les labels de groupe sont compréhensibles par un non-spécialiste.

### Critères de qualité de résumé

- [ ] 90% des résumés font entre 140 et 220 mots.
- [ ] Aucun texte en langue étrangère dans les résumés (sauf noms propres).
- [ ] Attribution systématique (« L'auteur estime… »).

### Critères de performance pipeline

- [ ] Pipeline complet (collecte + traduction + scoring) terminé avant 08:00 heure de Beyrouth.
- [ ] Moins de 5% d'erreurs de traduction.
- [ ] Au moins 15 pays couverts quotidiennement.

### Protocole de test humain

1. Demander à Emilie ou Iva de produire une revue de presse avec l'outil sur 3 jours consécutifs.
2. Mesurer le temps par revue.
3. Comparer la qualité (diversité géographique, pertinence des articles, qualité des résumés) avec l'exemple fourni.
4. Recueillir les frictions UX verbatim.

---

## 13. Risques restants

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Rate limits LLM (Groq/Cerebras) avec 300+ traductions/jour | Moyenne | Pipeline bloquée | Fallback Anthropic, retry avec backoff (déjà en place) |
| Cohere API indisponible | Faible | Pas d'embedding, pas de clustering (mais si on relègue le clustering, l'impact est nul) | Le système fonctionne sans embeddings dans l'architecture cible |
| Sources RSS changent leurs feeds | Moyenne | Baisse de couverture | Monitoring `last_collected_at` par source (route régie/sources existe) |
| Qualité variable des traductions ar→fr | Moyenne | Résumés inexploitables | Seuil de confiance (déjà en place), flag `needs_review` |
| Le journaliste ne trouve pas le système utile même après refonte | Faible | Projet abandonné | Itération rapide avec Emilie dès le premier prototype de la page édition |

---

## 14. Recommandation finale tranchée

### Ce qu'il faut arrêter de faire

- **Arrêter de traiter le clustering comme la colonne vertébrale du produit.** C'est une abstraction technique plaquée sur un besoin éditorial simple. Le journaliste veut une liste d'articles triée intelligemment, pas une taxonomie automatique.
- **Arrêter de développer les pages régie** (dedup, clustering params, curateur, logs) tant que la page de travail principale n'est pas livrée. C'est du tooling de debug, pas du produit.
- **Arrêter la destruction-recréation des clusters à chaque run.** Si le clustering reste en régie, au minimum identifier les clusters stables par un hash d'articles.

### Ce qu'il faut garder absolument

- **Le pipeline collecte → traduction.** Il fonctionne, il est robuste, et c'est le cœur de la valeur.
- **Le LLM router hybride.** Architecture astucieuse (Cerebras/Groq/Anthropic par langue), économique, bien implémentée.
- **Le générateur OLJ.** Le prompt est calibré sur le format Emilie, les blocs produits sont exploitables.
- **Le scoring de pertinence.** La logique composite est raisonnable et transparente.
- **Le filtre éditorial** (`editorial_scope.py`). Bonne barrière contre le bruit lifestyle/voyage.
- **La page `/articles`** avec ses filtres et sa logique de sélection. C'est la meilleure base pour construire la page d'édition.

### Ce qu'il faut construire

1. **La page « Édition du jour »** — c'est le produit. Tout le reste est support.
2. **Le champ `editorial_angle`** — le remplacement léger et efficace du clustering.
3. **La persistance de la sélection côté serveur** — fiabilité basique.
4. **La normalisation pays** — nettoyage de données élémentaire.

### Estimation globale

Le passage de l'état actuel à un outil livrable demande environ **20-25 heures de développement** concentrées sur les tickets P0 (18-22h) + P1 (5-6h). Ce n'est pas une réécriture : c'est un recadrage qui réutilise 80% du code existant et remplace la couche de navigation.

Le call de jeudi avec Emilie devrait porter sur : montrer la page articles actuelle (la plus fonctionnelle), valider le parcours cible, et obtenir un feu vert pour reléguer le clustering au profit d'une liste plate enrichie d'angles éditoriaux.
