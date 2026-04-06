# Spec — Vague 2 : analyse d’articles ; synthèse / affichage ; corps traduit

**Date :** 2026-04-06  
**Références :** [docs/plan.md](../../../plan.md) §1, §2, §5 ; [AGENTS.md](../../../AGENTS.md).

## 1. Analyse d’articles (visibilité & file)

### Contexte

- Service : [`backend/src/services/article_analyst.py`](../../../backend/src/services/article_analyst.py) (`ANALYSIS_VERSION`, skips documentés dans plan.md).
- Config : [`backend/src/config.py`](../../../backend/src/config.py) — `article_analysis_enabled`, `article_analysis_batch_limit`, etc.

### Objectifs

- **Priorisation** : ordonner les candidats par `relevance_band` + `article_type` (opinion, éditorial, tribune, analyse en tête) avant application du plafond batch — **sans** modifier les prompts dans les fichiers interdits ; logique uniquement dans `article_analyst.py` ou module dédié autorisé.
- **Surface Régie** : endpoint ou enrichissement de réponse de job existant avec compteurs `candidates`, `analyzed`, `skipped_*` (raisons agrégées) pour la dernière exécution.
- **UI (phase front)** : badges « Analyse en attente » / « Hors limite batch » / « Hors périmètre » — spec UI détaillée en phase UX ; ici : **contrats API** nécessaires (champs optionnels sur `Article` en lecture ou endpoint dédié).

### Critères d’acceptation

- La rédaction peut distinguer **sans ticket** : pas d’analyse car désactivé / pas de résumé FR / `out_of_scope` / batch plein / erreur LLM.
- Aucun changement dans `generator.py`, `llm_router.py`, `editorial_scope.py`, `collector.py`.

## 2. Unification résumé / analyse / bullets (affichage)

### Contexte

- Champs : `summary_fr`, `thesis_summary_fr`, `analysis_bullets_fr`, `factual_context_fr`, `author_thesis_explicit_fr`, etc.
- Front actuel : double marqueur liste + glyphes dans [`frontend/src/contexts/article-reader.tsx`](../../../frontend/src/contexts/article-reader.tsx) (et mirror playground).

### Objectifs

- **Backend (optionnel)** : utilitaire de **normalisation de chaînes** (strip `-`, `•`, lignes vides) dans un module autorisé, appelé depuis les schémas de sérialisation ou une couche « presentation » — pas dans les fichiers interdits.
- **Frontend** : une seule liste numérotée pour les idées majeures ; normalisation TS dans [`frontend/src/lib/`](../../../frontend/src/lib/) ou équivalent playground.
- **Prompts / YAML** : évolution de [`backend/config/prompts/article_analysis_v1.yaml`](../../../backend/config/prompts/article_analysis_v1.yaml) et schéma JSON associé **uniquement** si la gouvernance du dépôt le valide (hors fichiers interdits).

### Critères d’acceptation

- Aucun doublon visuel « numérotation + puce + texte déjà préfixé » sur le lecteur article après changements.
- Comportement défini pour champs vides (ne pas afficher de section vide).

## 3. Corps traduit (extraction & mise en forme)

### Contexte

- Problème : texte collé, artefacts type « 0 commentaire », dates parasites ([plan.md](../../../plan.md) §5).
- Fichiers potentiels côté affichage : [`frontend/src/lib/editorial-body.ts`](../../../frontend/src/lib/editorial-body.ts) (prod) et mirror playground.

### Objectifs

- **Extraction / nettoyage** : renforcer dans les services **autorisés** cités dans le plan (`smart_content`, `hub_article_extract`, `selected_article_fulltext`, etc.) — **ne pas** toucher `collector.py` ; si le bug est exclusivement dans le collector, documenter **workaround** affichage + ticket séparé governance.
- **Affichage** : paragraphes, gestion « pas de corps disponible », règles éditoriales minimales (sauts de ligne).

### Critères d’acceptation

- Réduction mesurable des cas « phrase.Date.Artefact » sur un échantillon d’articles test (checklist manuelle ou test golden sur snippets).

## Hors-scope vague 2

- Refonte complète du design system (phase UX).
- Changement du routeur LLM global (`llm_router.py` interdit).
