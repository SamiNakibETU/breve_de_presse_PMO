# OLJ AUTOMATED PRESS REVIEW — COMPLETE SPECIFICATION PACK
## Système de Revue de Presse Régionale Automatisée pour L'Orient-Le Jour

**Version**: 1.0.0 | **Date**: 2026-03-18 | **Auteur**: Spécification technique projet OLJ Press Review

---

# STEP 1 — MEDIA REGISTRY

## Registre des médias annotés (48 sources)

Voir le fichier **MEDIA_REGISTRY.json** pour le registre complet au format JSON.

### Tableau synthétique des sources Tier 1 (30 médias)

| # | Média | Pays | Langue(s) | Biais | RSS | Paywall |
|---|-------|------|-----------|-------|-----|---------|
| 1 | L'Orient-Le Jour | Liban | FR | liberal-indep. | ✅ | soft |
| 2 | Annahar | Liban | AR/EN | liberal-sovereign | ✅ | free |
| 3 | Al-Akhbar | Liban | AR/EN | pro-resistance | ✅ | free |
| 4 | MTV Lebanon | Liban | AR | sovereign-christian | ❌ scraping | free |
| 5 | Haaretz | Israël | EN/HE | left-liberal | ✅ | hard |
| 6 | Jerusalem Post | Israël | EN | center-right | ✅ | soft |
| 7 | Times of Israel | Israël | EN/AR/FR | center | ✅ | free |
| 8 | Ynet News | Israël | EN/HE | center-mainstream | ✅ | free |
| 9 | Tehran Times | Iran | EN | pro-gov | ✅ | free |
| 10 | Press TV | Iran | EN | pro-gov | ✅ | free |
| 11 | Iran International | Iran (diaspora) | EN/FA | opposition | ✅ | free |
| 12 | The National (UAE) | EAU | EN | pro-gov | ✅ | free |
| 13 | Gulf News | EAU | EN | pro-gov | ✅ | free |
| 14 | Al-Khaleej | EAU | AR | pro-gov | ✅ | free |
| 15 | Arab News | Arabie Saoudite | EN | pro-gov | ✅ | free |
| 16 | Asharq Al-Awsat | Arabie Saoudite | AR/EN | pro-saudi-mod | ✅ | free |
| 17 | Okaz | Arabie Saoudite | AR | pro-gov-nat | ✅ | free |
| 18 | Daily Sabah | Turquie | EN/TR/AR | pro-gov (AKP) | ✅ | free |
| 19 | Ahval News | Turquie (exil) | EN/TR | opposition | ✅ | free |
| 20 | Hürriyet Daily News | Turquie | EN | center-mainstream | ✅ | free |
| 21 | Rudaw | Irak (Kurdistan) | EN/AR/KU | pro-KRD-PDK | ✅ | free |
| 22 | Iraqi News | Irak | EN | center | ✅ | free |
| 23 | Al-Sumaria | Irak | AR | independent | ✅ | free |
| 24 | Syria Direct | Syrie (exil) | EN/AR | opposition | ✅ | free |
| 25 | SANA | Syrie | EN/AR | pro-gov | ✅ | free |
| 26 | Al Jazeera English | Qatar | EN/AR | pro-qatar-prog | ✅ | free |
| 27 | Al Arabiya English | Arabie Saoudite | EN/AR | pro-saudi | ✅ | free |
| 28 | Middle East Eye | UK | EN/FR/TR | progressive-indep | ✅ | free |
| 29 | Al-Monitor | USA | EN | center-analytical | ✅ | soft |
| 30 | +972 Magazine | Israël/Palestine | EN | left-progressive | ✅ | free |

### Sources Tier 2 (18 médias)
Jordan Times, Doha News, Kuwait Times, Gulf Daily News, Saba Net (Yemen), Al-Ahram, Mada Masr, Foreign Policy, The Intercept, New Lines Magazine, Arab48, LBCI News, Jadaliyya, Orient XXI, Le Monde diplomatique, Le Grand Continent.

### Recommandation collecte par méthode
- **RSS (40 sources)** : Méthode primaire. feedparser + aiohttp.
- **Scraping (8 sources)** : MTV Lebanon, LBCI, Gulf Daily News, sites sans RSS fiable. trafilatura + Playwright fallback.

---

# STEP 2 — GUIDE DE STYLE L'ORIENT-LE JOUR

## Analyse éditoriale OLJ

### Structure type d'un article OLJ
1. **Titre** : Factuel, informatif, sans ponctuation exclamative. Souvent structuré en deux parties séparées par un tiret ou deux-points.
2. **Chapeau** (lead) : 2-3 phrases résumant l'essentiel — qui, quoi, où, quand. Ton neutre, factuel.
3. **Corps** : Développement chronologique ou thématique. Paragraphes courts (3-5 phrases). Citations directes entre guillemets français (« »).
4. **Sources** : Attribution systématique. "selon", "d'après", "comme l'a rapporté".
5. **Contexte** : Encadré ou paragraphe de rappel du contexte régional.

### Registre de langue
- Français soutenu mais accessible, jamais jargonnant
- Phrases de longueur moyenne (15-25 mots)
- Vocabulaire géopolitique précis sans pédantisme
- Pas de première personne sauf dans les éditoriaux signés
- Temps dominant : présent de narration et passé composé

### Conventions noms propres arabes
- **Translittération simplifiée** : Hassan Nasrallah (pas Ḥasan Naṣrallāh)
- **Articles définis** : conservés quand partie du nom (Al-Akhbar, pas Akhbar)
- **Prénoms** : forme française quand elle existe (Mohammed, pas Muhammad)
- **Toponymes** : forme française standard (Le Caire, Beyrouth, Damas)
- **Partis/organisations** : nom français + acronyme arabe entre parenthèses la première occurrence

### Ton et neutralité
- Neutralité descriptive dans les résumés d'articles
- Attribution systématique des opinions ("selon l'auteur", "l'éditorialiste estime que")
- Pas de jugement de valeur dans les résumés — restitution fidèle de l'argument
- Distance journalistique maintenue même pour les positions controversées

## 15 Règles de style OLJ pour le LLM

1. **Guillemets français** : Toujours « » avec espaces insécables, jamais " ".
2. **Ton neutre restitutif** : Le résumé restitue fidèlement l'argument de l'auteur sans le juger.
3. **Attribution explicite** : Chaque affirmation est attribuée ("L'auteur estime que...", "Selon le chroniqueur...").
4. **Phrases courtes** : Maximum 25 mots par phrase. Favoriser la clarté.
5. **Pas de superlatifs** : Pas de "extrêmement", "formidable", "catastrophique" sauf si citation directe.
6. **Translittération simplifiée** : Noms propres en forme francisée standard.
7. **Titre entre guillemets** : Le titre résumé est entre « » et synthétise la thèse.
8. **Vocabulaire géopolitique précis** : "axe de résistance" et non "camp iranien" ; "normalisation" et non "paix avec Israël".
9. **Présent de narration** : Temps principal du résumé.
10. **Structure QQQOCP** : Qui, Quoi, Quand, Où, Comment, Pourquoi — dans les deux premières phrases.
11. **Pas de première personne** : Jamais de "je" ou "nous" dans les résumés.
12. **Longueur résumé** : Strictement 150-200 mots.
13. **Encadrés structurés** : La fiche technique suit exactement le format OLJ prescrit.
14. **Pas d'acronymes non définis** : Toujours définir à la première occurrence.
15. **Citations traduites entre guillemets** : Si l'original contient une citation, la traduire entre « » avec mention "[traduit de l'arabe/anglais/etc.]".

## Exemples few-shot

### Exemple 1 : Article d'opinion arabe → Résumé OLJ

**Source fictive** : Éditorial d'Al-Akhbar, "الحرب القادمة: لماذا يجب على لبنان الاستعداد", par Ibrahim Amin, 15 mars 2026.

**Sortie OLJ attendue** :

```
« La prochaine guerre : pourquoi le Liban doit se préparer — Un plaidoyer pour le renforcement de la dissuasion »

Résumé : L'éditorialiste Ibrahim Amine estime que le Liban se trouve à un tournant stratégique qui exige une préparation militaire et diplomatique accrue. Selon lui, les récentes manœuvres israéliennes à la frontière sud et le renforcement du dispositif militaire dans le Golan constituent des signaux clairs d'une escalade imminente. L'auteur plaide pour un renforcement de la « capacité de dissuasion » du Liban, sans nommer explicitement le Hezbollah mais en faisant référence à la « résistance ». Il critique la communauté internationale, qu'il accuse de complaisance envers Israël, et appelle les pays arabes à rompre avec la politique de normalisation. L'éditorialiste conclut en affirmant que seule une posture de fermeté peut garantir la souveraineté libanaise face à ce qu'il qualifie de « projet expansionniste israélien ».

Fiche :
Article publié dans Al-Akhbar
Le 15 mars 2026
Langue originale : arabe
Pays du média : Liban
Nom de l'auteur : Ibrahim Amine
```

### Exemple 2 : Analyse anglophone israélienne → Résumé OLJ

**Source fictive** : Analyse de Haaretz, "The Strategic Folly of Permanent Occupation", par Amos Harel, 10 mars 2026.

**Sortie OLJ attendue** :

```
« L'erreur stratégique de l'occupation permanente — Un analyste militaire israélien met en garde contre l'enlisement »

Résumé : L'analyste militaire Amos Harel estime dans Haaretz que la stratégie d'occupation permanente des territoires conquis lors de la dernière offensive représente une impasse stratégique pour Israël. S'appuyant sur des sources au sein de l'état-major, il rapporte que plusieurs hauts gradés expriment en privé des réserves quant à la viabilité d'un contrôle militaire prolongé. L'auteur établit un parallèle avec l'occupation du Liban-Sud entre 1982 et 2000, soulignant que celle-ci avait abouti à un retrait unilatéral après des pertes jugées insoutenables. Il critique la droite nationaliste au pouvoir, qui selon lui ignore les leçons de l'histoire au profit d'un agenda idéologique. L'analyste conclut que sans perspective politique crédible, l'occupation « sème les germes de la prochaine confrontation ».

Fiche :
Article publié dans Haaretz
Le 10 mars 2026
Langue originale : anglais
Pays du média : Israël
Nom de l'auteur : Amos Harel
```

### Exemple 3 : Tribune perse traduite → Résumé OLJ

**Source fictive** : Article de Tehran Times, "Iran's Role in Regional Stability", éditorial non signé, 12 mars 2026.

**Sortie OLJ attendue** :

```
« Le rôle de l'Iran dans la stabilité régionale — Téhéran défend sa doctrine de sécurité collective »

Résumé : Dans un éditorial non signé, le Tehran Times présente la politique régionale iranienne comme un facteur de stabilisation face à ce qu'il qualifie d'« hégémonie américano-sioniste ». Le texte défend la doctrine de « profondeur stratégique » de Téhéran, qui repose sur le soutien aux mouvements alliés au Liban, en Irak, en Syrie et au Yémen. L'éditorial affirme que l'Iran a joué un rôle déterminant dans la lutte contre Daech et que ses détracteurs cherchent à réécrire l'histoire. Le texte critique les Accords d'Abraham, qualifiés de « trahison de la cause palestinienne », et appelle les nations musulmanes à former un front uni. L'éditorial conclut en réaffirmant que l'Iran ne cherche pas la confrontation mais ne reculera pas devant les menaces.

Fiche :
Article publié dans Tehran Times
Le 12 mars 2026
Langue originale : anglais
Pays du média : Iran
Nom de l'auteur : Éditorial non signé
```

---

# STEP 3 — ÉTAT DE L'ART TECHNOLOGIQUE

## 3.1 Collecte

### Recommandation : trafilatura 2.0+ (primaire) + newspaper4k (fallback)

**Justification** : trafilatura atteint le meilleur F1-score (0.958) sur l'article-extraction-benchmark de Scrapinghub, devançant newspaper4k (0.949). Son recall de 0.978 est particulièrement remarquable. Supporte le markdown en sortie, réduisant le volume de tokens d'environ 67%. Utilisé en production par HuggingFace, IBM, et Microsoft Research.

**Version recommandée** : `trafilatura>=2.0.0`

**Snippet** :
```python
import trafilatura

downloaded = trafilatura.fetch_url("https://example.com/article")
result = trafilatura.extract(
    downloaded,
    include_comments=False,
    include_tables=True,
    output_format="json",
    with_metadata=True,
    favor_recall=True,
    target_language="ar"  # ou None pour auto-detect
)
```

**Pour les sites JS-heavy** : Playwright (recommandé sur Puppeteer pour Python).
```python
from playwright.async_api import async_playwright

async def fetch_js_page(url: str) -> str:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(url, wait_until="networkidle")
        html = await page.content()
        await browser.close()
        return html
```

**RSS parsing** : `feedparser` reste le standard.
```python
import feedparser

feed = feedparser.parse("https://www.aljazeera.com/xml/rss/all.xml")
for entry in feed.entries:
    print(entry.title, entry.link, entry.published)
```

**Pièges** :
- Respecter `robots.txt` et implémenter un rate limiter (1-2 req/sec par domaine)
- Certains sites MENA bloquent les IP non-régionales — prévoir proxy rotatif
- trafilatura peut échouer sur des layouts très non-standard → fallback newspaper4k

## 3.2 Traitement multilingue

### Traduction : Claude Haiku 4.5 (recommandation primaire)

**Justification** : $1/M input, $5/M output. Excellente qualité arabe→français et anglais→français. Latence faible, fiabilité JSON élevée. Support natif 200K tokens. Batch API pour 50% de réduction supplémentaire.

**Alternatives évaluées** :
| Modèle | Prix (input/output par M) | Qualité AR→FR | Latence | JSON fiable |
|--------|--------------------------|---------------|---------|-------------|
| Claude Haiku 4.5 | $1/$5 | ★★★★☆ | Faible | ★★★★★ |
| GPT-4o-mini | $0.15/$0.60 | ★★★★☆ | Faible | ★★★★☆ |
| Gemini Flash 2.0 | ~$0.075/$0.30 | ★★★☆☆ | Très faible | ★★★☆☆ |
| Claude Sonnet 4.5 | $3/$15 | ★★★★★ | Moyenne | ★★★★★ |

**Recommandation** : Claude Haiku 4.5 pour le pipeline quotidien (traduction + résumé + extraction). Claude Sonnet 4.5 pour la génération finale format OLJ (qualité rédactionnelle supérieure).

[INCERTITUDE] Les benchmarks arabe→français et persan→français spécifiques sont rares. La qualité a été évaluée sur la base de tests qualitatifs et des benchmarks multilingues généraux. Recommandation : tester sur 50 articles réels avant de figer le choix.

### Embeddings : text-embedding-3-small (OpenAI)

**Justification** : Bon rapport qualité/prix pour le multilingue, 1536 dimensions, $0.02/M tokens. Supporte l'arabe, le persan, le turc, l'hébreu.

**Alternative** : `multilingual-e5-large` (open-source, déployable localement) ou `cohere-embed-multilingual-v3.0` ($0.10/M tokens, légèrement meilleur sur l'arabe).

## 3.3 Base de données

### PostgreSQL + pgvector sur Railway

**Justification** : Railway supporte pgvector nativement avec déploiement one-click. Pas besoin de base vectorielle séparée pour < 10M records. ACID compliant, SQL standard, familier.

**Version** : PostgreSQL 16+ avec pgvector 0.7+

**Architecture RAG** :
- Chunk size : 512 tokens (articles de presse = textes courts, pas besoin de plus)
- Overlap : 50 tokens
- Reranking : Cross-encoder via Claude Haiku si besoin (simple scoring)

**NER arabe** : Via LLM (Claude Haiku 4.5) plutôt que CAMeL Tools/AraBERT → plus simple, plus flexible, qualité suffisante pour ce cas d'usage.

## 3.4 Infrastructure

### Railway — Plan Pro ($20/mois inclus)

**Coûts estimés** :
- Service Python (collecte + pipeline) : ~$5-15/mois
- PostgreSQL + pgvector : ~$5-10/mois
- Total infrastructure : ~$15-30/mois

**Framework** : FastAPI (léger, async natif, parfait pour API + scheduleur)
**Scheduleur** : APScheduler (intégré dans le service FastAPI, pas besoin de Celery pour ce volume)
**Alternative scheduleur** : Railway Cron Jobs natifs pour le déclenchement quotidien

## 3.5 Interface

### Streamlit (MVP) → Next.js (Phase 2)

**Justification MVP** : Streamlit permet de construire l'interface de sélection en < 1 jour. Suffisant pour le workflow journaliste (sélectionner 3-5 articles, voir les résumés, copier-coller).

**Version** : `streamlit>=1.40.0`

---

# STEP 4 — ARCHITECTURE SYSTÈME

## 4.1 Diagramme d'architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    OLJ PRESS REVIEW SYSTEM                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │  RSS FEEDS   │    │  WEB SCRAPER │    │   SCHEDULER          │  │
│  │  (feedparser)│    │ (trafilatura │    │  (APScheduler)       │  │
│  │  40+ sources │    │  + Playwright)│   │  Cron: 06:00 UTC     │  │
│  └──────┬───────┘    └──────┬───────┘    └──────────┬───────────┘  │
│         │                   │                       │              │
│         └───────┬───────────┘                       │              │
│                 ▼                                    │              │
│  ┌──────────────────────────┐                       │              │
│  │     ARTICLE INGESTER     │◄──────────────────────┘              │
│  │  - Dedup (URL hash)      │                                      │
│  │  - Language detection     │                                     │
│  │  - Store raw content      │                                     │
│  └──────────┬───────────────┘                                      │
│             ▼                                                      │
│  ┌──────────────────────────┐    ┌─────────────────────────┐       │
│  │    POSTGRESQL + pgvector │    │   TRANSLATION PIPELINE  │       │
│  │                          │    │                         │       │
│  │  Tables:                 │    │  1. Detect language      │      │
│  │  - media_sources         │    │  2. Translate → FR       │      │
│  │  - articles              │◄───│  3. Summarize (150-200w) │      │
│  │  - entities              │    │  4. Extract NER          │      │
│  │  - article_entities      │    │  5. Classify type        │      │
│  │  - reviews               │    │  6. Generate embeddings  │      │
│  │  - review_items          │    │                         │       │
│  │  - embeddings (pgvector) │    │  Model: Claude Haiku 4.5│       │
│  └──────────┬───────────────┘    └─────────────────────────┘       │
│             │                                                      │
│             ▼                                                      │
│  ┌──────────────────────────┐    ┌─────────────────────────┐       │
│  │   STREAMLIT INTERFACE    │    │   OLJ FORMAT GENERATOR  │       │
│  │                          │    │                         │       │
│  │  - Browse today's articles│   │  Model: Claude Sonnet   │      │
│  │  - Filter by country/topic│──►│  4.5 (qualité rédac.)   │      │
│  │  - Select 3-5 articles   │    │                         │       │
│  │  - Preview formatted     │    │  Output: Bloc OLJ       │      │
│  │  - Copy to clipboard     │    │  formaté prêt CMS       │      │
│  └──────────────────────────┘    └─────────────────────────┘       │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    RAILWAY DEPLOYMENT                         │  │
│  │  Services: FastAPI (API+scheduler) + PostgreSQL + Streamlit  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## 4.2 Schéma base de données

Voir fichier **DATABASE_SCHEMA.sql** complet ci-joint.

## 4.3 Pipeline LLM détaillé

### a) Détection de langue
Méthode : `py3langid` (intégré dans trafilatura) + fallback métadonnées RSS.
Pas besoin de LLM.

### b) Traduction + Résumé (combiné en un seul appel)

**Modèle** : Claude Haiku 4.5
**Coût estimé** : ~$0.006 par article (1500 tokens input + 400 tokens output)

**Prompt système** :
```
Tu es un traducteur-rédacteur professionnel travaillant pour L'Orient-Le Jour, 
quotidien francophone libanais. Ta tâche est de traduire et résumer des articles 
de presse du Moyen-Orient.

RÈGLES ABSOLUES :
1. Traduis fidèlement le sens, pas mot à mot
2. Résumé en 150-200 mots exactement, en français soutenu mais accessible
3. Ton neutre et restitutif — tu restitues l'argument de l'auteur sans le juger
4. Attribution systématique : "L'auteur estime que...", "Selon le chroniqueur..."
5. Guillemets français « » pour les citations
6. Translittération simplifiée des noms propres arabes
7. Présent de narration comme temps principal
8. Structure QQQOCP dans les deux premières phrases

Réponds UNIQUEMENT en JSON valide.
```

**Prompt utilisateur** :
```json
{
  "task": "translate_and_summarize",
  "source_language": "{{source_language}}",
  "target_language": "fr",
  "article": {
    "title": "{{title}}",
    "author": "{{author}}",
    "media": "{{media_name}}",
    "date": "{{publication_date}}",
    "content": "{{article_content}}"
  },
  "output_format": {
    "translated_title": "titre traduit en français",
    "thesis_summary": "résumé de la thèse en une phrase courte",
    "summary_fr": "résumé de 150-200 mots",
    "key_quotes": ["citation traduite 1", "citation traduite 2"],
    "confidence_score": 0.95,
    "translation_notes": "notes sur les difficultés de traduction éventuelles"
  }
}
```

### c) Extraction d'entités nommées

**Modèle** : Claude Haiku 4.5 (même appel ou appel séparé)
**Prompt** :
```
Extrais les entités nommées de ce texte. Catégories : PERSON, ORG, GPE (lieu), EVENT, WEAPON_SYSTEM, TREATY.
Réponds en JSON : {"entities": [{"name": "...", "type": "...", "name_fr": "...", "context": "..."}]}
```

### d) Classification

**Modèle** : Claude Haiku 4.5
**Catégories** : opinion, editorial, tribune, analysis, news, interview
**Méthode** : Classification dans le même appel que la traduction (ajout d'un champ "article_type").

### e) Génération bloc OLJ final

**Modèle** : Claude Sonnet 4.5 (qualité rédactionnelle supérieure)
**Coût estimé** : ~$0.05 par article final (3-5 articles/jour = $0.15-0.25/jour)

**Prompt système** :
```
Tu es rédacteur en chef adjoint à L'Orient-Le Jour. Tu produis le bloc 
texte final de la revue de presse régionale.

FORMAT EXACT à respecter :

« [Titre synthétique reformulé] — [Thèse de l'auteur en une phrase] »

Résumé : [Le résumé fourni, retravaillé si nécessaire pour atteindre 
exactement 150-200 mots, ton neutre, restitution fidèle de l'argument]

Fiche :
Article publié dans [média]
Le [date au format JJ mois AAAA]
Langue originale : [langue]
Pays du média : [pays]
Nom de l'auteur : [auteur]

RÈGLES :
- Le titre entre « » doit être reformulé, pas traduit littéralement
- Le résumé doit être autonome (compréhensible sans lire l'article)
- Aucun jugement de valeur — restitution fidèle
- Vocabulaire géopolitique OLJ (voir guide de style)
```

### f) Score de confiance de traduction
Calculé par le modèle dans le champ `confidence_score` (0.0-1.0). Seuil d'alerte : < 0.7 → flag pour relecture humaine.

## 4.4 Architecture mémoire sémantique (Phase 2)

- Embeddings via `text-embedding-3-small` stockés dans pgvector
- Cosine similarity pour articles similaires récents
- Graphe d'entités : PostgreSQL + requêtes récursives CTE (pas besoin de Neo4j pour MVP)

## 4.5 Modèle de coûts

### Coûts API LLM

| Scénario | Articles/jour | Haiku (trad+NER) | Sonnet (format OLJ) | Embeddings | Total/mois |
|----------|---------------|------------------|---------------------|------------|------------|
| Conservateur | 50 | $0.30/j | $0.25/j | $0.01/j | ~$17/mois |
| Réaliste | 150 | $0.90/j | $0.25/j | $0.03/j | ~$35/mois |
| Peak | 300 | $1.80/j | $0.25/j | $0.06/j | ~$63/mois |

### Coûts infrastructure Railway

| Composant | Estimation mensuelle |
|-----------|---------------------|
| FastAPI service (Python) | $5-15 |
| PostgreSQL + pgvector | $5-10 |
| Streamlit interface | $3-5 |
| **Total infrastructure** | **$15-30** |

### Budget total mensuel estimé

| Scénario | LLM API | Infrastructure | Total |
|----------|---------|----------------|-------|
| Conservateur | $17 | $20 | ~$37/mois |
| Réaliste | $35 | $25 | ~$60/mois |
| Peak | $63 | $30 | ~$93/mois |

---

# STEP 5 — SPÉCIFICATIONS POUR L’AGENT D’IMPLÉMENTATION

Les documents suivants sont dans des fichiers séparés :
- **PROJECT_BRIEF.md** → Vue d'ensemble et objectifs
- **DATABASE_SCHEMA.sql** → Schéma PostgreSQL complet
- **PROMPTS_LIBRARY.md** → Tous les prompts avec few-shot
- **MEDIA_REGISTRY.json** → Registre des 48 médias
- **IMPLEMENTATION_ROADMAP.md** → Plan de développement en sprints
- **RAILWAY_DEPLOYMENT.md** → Guide de déploiement
- **AGENT_INSTRUCTIONS.md** → Instructions pour l’agent d’implémentation

---

# STEP 7 — SYNTHÈSE ET RECOMMANDATIONS

## 7.1 Résumé exécutif

Le système OLJ Press Review automatise la collecte, traduction et mise en forme quotidienne d'articles d'opinion et d'analyse provenant de 48 médias régionaux couvrant 15 pays du Moyen-Orient. Le pipeline collecte via RSS/scraping, traduit et résume via Claude Haiku 4.5, et génère le format OLJ via Claude Sonnet 4.5. L'interface Streamlit permet au journaliste de sélectionner 3-5 articles, de valider les résumés et de copier-coller le bloc texte final dans le CMS. Budget mensuel estimé : 40-60€. Délai de développement MVP : 12 jours (5 sprints).

## 7.2 Risques et mitigations

### Top 5 risques techniques
1. **Qualité traduction arabe→FR variable** → Mitigation : score de confiance + relecture humaine sous seuil 0.7 + tests sur corpus réel de 50 articles
2. **Sites bloquant le scraping** → Mitigation : RSS prioritaire (40/48 sources), rotation de proxies, respect robots.txt
3. **Paywall Haaretz/FP** → Mitigation : titres+chapeaux RSS gratuits + prévoir budget abonnement presse ($50/mois)
4. **Coûts LLM imprévus** → Mitigation : prompt caching Anthropic (90% savings), batch API (50% savings), monitoring quotidien
5. **Downtime Railway** → Mitigation : alertes Slack, retry automatique, stockage local tampon

### Top 3 risques éditoriaux
1. **Biais de traduction** → Le LLM peut atténuer ou amplifier des positions politiques. Mitigation : prompt strict de neutralité + relecture humaine systématique
2. **Erreur factuelle dans résumé** → Le LLM peut halluciner des détails. Mitigation : prompt de fidélité à la source + accès au texte original pour vérification
3. **Déséquilibre géographique** → Surreprésentation anglophone vs. arabophone. Mitigation : quotas par région dans l'interface de sélection

## 7.3 Recommandation finale modèles

| Tâche | Modèle | Justification |
|-------|--------|---------------|
| Traduction + résumé | Claude Haiku 4.5 | Meilleur rapport qualité/prix pour le multilingue AR→FR. $1/M input. JSON fiable. |
| Génération format OLJ | Claude Sonnet 4.5 | Qualité rédactionnelle française supérieure pour le produit final. $3/M input. |
| NER + Classification | Claude Haiku 4.5 | Même appel que traduction — coût marginal. |
| Embeddings | text-embedding-3-small | $0.02/M tokens. Multilingue. 1536 dim. Compatible pgvector. |

## 7.4 Évolutions futures (Phase 2)

1. **Mémoire sémantique avancée** : Recherche de similarité pour "articles connexes cette semaine", détection de narratifs récurrents
2. **Graphe d'entités** : Relations entre acteurs (qui mentionne qui, alliances, rivalités) avec visualisation
3. **Détection de biais automatique** : Score de biais par article, comparaison couverture d'un même événement par différents médias
4. **Dashboard analytics** : Métriques de couverture par pays/thème/semaine, tendances, alertes sur sujets émergents
5. **Interface Next.js** : Remplacement de Streamlit par interface production avec auth, historique, collaboration
6. **Notification push** : Alertes breaking news via Telegram/Slack pour les événements critiques
