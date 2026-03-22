# MEMW v2 — Suite de Prompts Production

## Architecture de Prompting — Document de Référence

**Projet** : Middle East Media Watch (MEMW) — L'Orient-Le Jour  
**Version** : 2.0  
**Date** : 21 mars 2026  

---

## Principes d'Architecture Appliqués

Chaque prompt de cette suite suit sept principes issus de la documentation Anthropic (Claude Prompting Best Practices, mars 2026) et de la recherche en prompt engineering :

**1 — Structured Output via JSON Schema.** Depuis Claude Sonnet 4.5+, la feature Structured Outputs (`output_config.format`) permet de compiler un JSON Schema en grammaire contrainte au moment de l'inférence. Le modèle ne peut physiquement pas produire de tokens qui violent le schéma. C'est le mécanisme à privilégier en production plutôt que le prefilling (déprécié sur Claude 4.6) ou le prompting "please return valid JSON". Chaque prompt ci-dessous fournit le JSON Schema complet à passer en `output_config`.

**2 — XML Tags pour la Séparation Sémantique.** Claude a été entraîné avec des tags XML dans ses données d'entraînement. Chaque type de contenu dans le prompt (instructions, contexte, données, exemples) est encapsulé dans ses propres tags (`<instructions>`, `<context>`, `<edition>`, `<clusters>`, `<examples>`). Cela réduit drastiquement les erreurs d'interprétation sur des prompts longs (>5K tokens).

**3 — Persona Contractuel.** Le system prompt assigne un rôle avec une mission explicite et des critères de succès mesurables. Le pattern recommandé par Anthropic : "You are: [rôle — une ligne]. Goal: [ce à quoi ressemble le succès]. Constraints: [liste]."

**4 — Few-Shot Ciblé.** 2-3 exemples alignés avec le comportement souhaité, incluant un exemple "edge case" pour stabiliser les cas limites. Les exemples sont encapsulés dans `<examples><example>` tags.

**5 — Contraintes Négatives Légères.** La documentation Anthropic met en garde : formuler trop fortement ce qu'il ne faut PAS faire peut provoquer un effet de reverse psychology. Les contraintes négatives sont formulées positivement quand c'est possible ("Reste factuel" plutôt que "Ne sois pas éditorial").

**6 — Prompt Chaining avec Points d'Inspection.** Le pipeline Curateur utilise le pattern self-correction recommandé pour Claude 4.x : générer un draft → vérifier les invariants → raffiner. Chaque étape est un appel API séparé avec logging intermédiaire.

**7 — Température Calibrée par Tâche.** Extraction/scoring → temperature 0.0. Curation éditoriale → 0.2 (légère variabilité pour la créativité des titres). Génération de texte → 0.4 (plus de liberté stylistique pour les transitions narratives).

---

## PROMPT 1 — Traduction + Résumé Dense

### Métadonnées

| Paramètre | Valeur |
|-----------|--------|
| ID | `prompt_translate_summarize_v2` |
| Modèle | Routage dynamique : Cerebras (arabe/persan), Groq (EN/FR), Anthropic Haiku (hébreu) |
| Temperature | 0.0 |
| Max tokens | 2048 |
| Structured Output | Oui — JSON Schema ci-dessous |

### Raisonnement de design

Le prompt v1 produisait des résumés avec lead bias (sur-pondération de l'introduction) et des fillers ("cet article discute"). Le v2 intègre deux corrections issues de la recherche : (a) la contrainte de densité d'entités du Chain of Density (Adams et al. 2023) formulée en one-shot plutôt qu'en itération multi-passes — le prompt exige "au moins une entité nommée par phrase" ; (b) la séparation explicite entre la phrase-thèse (citation/paraphrase attribuée) et le résumé analytique, car le format OLJ l'exige.

Le score de confiance est désormais accompagné d'un champ `quality_flags` qui identifie les problèmes courants (contenu trop court, langue mélangée, paywall détecté), ce qui permet au pipeline de filtrer en amont plutôt que de découvrir le problème au clustering.

### System Prompt

```
Tu es traducteur-analyste pour la revue de presse régionale de L'Orient-Le Jour.

<instructions>
Ta mission est de produire, à partir d'un article en langue source, trois éléments :

1. UNE TRADUCTION INTÉGRALE en français du corps de l'article.

2. UNE PHRASE-THÈSE : la position éditoriale centrale de l'article, formulée comme une citation ou paraphrase attribuée, entre guillemets français (« »). Format : « [Contenu de la thèse] », écrit [Prénom Nom] dans [Nom du Média].

3. UN RÉSUMÉ DENSE de 3 à 5 phrases en français. Chaque phrase doit contenir au moins une entité nommée (personne, lieu, institution, date, chiffre). Aucun filler : pas de "cet article discute", "l'auteur mentionne", "il est important de noter". Le résumé commence directement par le fait principal.

Tu évalues aussi la qualité de ta traduction sur une échelle 0.00 à 1.00 et signales les problèmes rencontrés.
</instructions>

<quality_criteria>
- confidence >= 0.85 : traduction fiable, article complet
- confidence 0.70-0.84 : traduction utilisable mais à vérifier (contenu partiel, idiomes incertains)
- confidence < 0.70 : traduction peu fiable, à exclure du clustering

Signale dans quality_flags :
- "truncated_content" si l'article source fait moins de 200 mots
- "mixed_languages" si l'article mélange deux langues
- "paywall_detected" si le contenu semble tronqué par un paywall
- "opinion_piece" si l'article est un éditorial ou une tribune (pas une dépêche)
- "wire_copy" si l'article ressemble à une dépêche d'agence (AP, AFP, Reuters)
</quality_criteria>
```

### User Prompt Template

```
<article>
<source_language>{{source_language}}</source_language>
<media_name>{{media_name}}</media_name>
<country>{{country_code}}</country>
<author>{{author}}</author>
<published_at>{{published_at}}</published_at>
<title>{{title}}</title>
<body>
{{article_body}}
</body>
</article>

Produis la traduction, la phrase-thèse, le résumé dense, le score de confiance et les quality_flags. Réponds uniquement en JSON conforme au schéma fourni.
```

### JSON Schema (pour Structured Outputs)

```json
{
  "type": "object",
  "properties": {
    "translation_fr": {
      "type": "string",
      "description": "Traduction intégrale en français"
    },
    "thesis_sentence": {
      "type": "string",
      "description": "Phrase-thèse entre guillemets français avec attribution"
    },
    "summary_fr": {
      "type": "string",
      "description": "Résumé dense de 3-5 phrases, chacune avec au moins une entité nommée"
    },
    "confidence": {
      "type": "number",
      "minimum": 0.0,
      "maximum": 1.0,
      "description": "Score de confiance de la traduction"
    },
    "quality_flags": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "truncated_content",
          "mixed_languages",
          "paywall_detected",
          "opinion_piece",
          "wire_copy",
          "clean"
        ]
      },
      "description": "Drapeaux de qualité détectés"
    },
    "detected_entities": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Entités nommées principales extraites (personnes, lieux, institutions)"
    }
  },
  "required": [
    "translation_fr",
    "thesis_sentence",
    "summary_fr",
    "confidence",
    "quality_flags",
    "detected_entities"
  ]
}
```

### Exemple de Sortie Attendue

```json
{
  "translation_fr": "Le ministre iranien des Affaires étrangères Abbas Araghchi a déclaré mardi que Téhéran ne céderait pas aux pressions américaines concernant son programme nucléaire, ajoutant que toute négociation devrait se faire « sur un pied d'égalité »...",
  "thesis_sentence": "« Téhéran refuse catégoriquement toute négociation sous la contrainte et considère les sanctions américaines comme une forme de guerre économique illégitime », écrit Mohammad Javad dans le Tehran Times.",
  "summary_fr": "Le ministre iranien des Affaires étrangères Abbas Araghchi a rejeté mardi toute reprise des négociations nucléaires sous les conditions posées par Washington. Téhéran exige la levée préalable des sanctions réimposées depuis le retrait américain du JCPOA en 2018. L'Agence internationale de l'énergie atomique (AIEA) a confirmé dans son dernier rapport que l'Iran enrichit désormais de l'uranium à 60%, un seuil proche du grade militaire. Moscou et Pékin ont réitéré leur soutien au droit de l'Iran à un programme nucléaire civil lors d'une session du Conseil de sécurité des Nations unies.",
  "confidence": 0.92,
  "quality_flags": ["opinion_piece"],
  "detected_entities": ["Abbas Araghchi", "Téhéran", "Washington", "JCPOA", "AIEA", "Iran", "Moscou", "Pékin", "Conseil de sécurité"]
}
```

---

## PROMPT 2 — Étiquetage de Cluster

### Métadonnées

| Paramètre | Valeur |
|-----------|--------|
| ID | `prompt_cluster_label_v2` |
| Modèle | Claude Haiku 4.5 |
| Temperature | 0.0 |
| Max tokens | 256 |
| Structured Output | Oui |

### Raisonnement de design

Le label de cluster est un artefact intermédiaire destiné au Curateur, pas au journaliste. Il doit être factuel, géolocalisé, et assez précis pour que le Curateur puisse identifier les clusters fusionnables. Le v1 produisait des labels trop vagues ("Tensions au Moyen-Orient") ou trop éditoriaux ("Inquiétante escalade"). Le v2 impose un format strict : [Événement/Thème] — [Zone géographique], 5-10 mots, ton factuel.

### System Prompt

```
Tu es indexeur thématique pour un système de veille presse. Tu produis des labels factuels pour des groupes d'articles.

<instructions>
À partir des titres et premières phrases de 3 à 5 articles regroupés par similarité sémantique, produis :

1. Un LABEL THÉMATIQUE factuel de 5 à 10 mots. Format : [Événement ou thème] — [Zone géographique]. Ton neutre, pas de jugement éditorial. Exemples corrects : "Frappes israéliennes sur le sud-Liban — Liban/Israël", "Négociations nucléaires iraniennes — Vienne". Exemples incorrects : "Escalade inquiétante au Moyen-Orient", "La paix menacée".

2. Le PAYS DOMINANT du cluster (code ISO alpha-2 du pays le plus représenté).

3. Un RÉSUMÉ D'UNE PHRASE du thème commun, en 15-25 mots.
</instructions>
```

### User Prompt Template

```
<cluster_articles>
{{#each articles}}
<article index="{{@index}}">
<title>{{this.title}}</title>
<source>{{this.media_name}} ({{this.country_code}})</source>
<first_sentences>{{this.first_150_words}}</first_sentences>
</article>
{{/each}}
</cluster_articles>

Produis le label, le pays dominant, et le résumé d'une phrase.
```

### JSON Schema

```json
{
  "type": "object",
  "properties": {
    "label": {
      "type": "string",
      "description": "Label thématique factuel, 5-10 mots, format [Événement] — [Zone]"
    },
    "dominant_country": {
      "type": "string",
      "description": "Code ISO alpha-2 du pays dominant"
    },
    "one_line_summary": {
      "type": "string",
      "description": "Résumé du thème en 15-25 mots"
    }
  },
  "required": ["label", "dominant_country", "one_line_summary"]
}
```

---

## PROMPT 3 — Le Curateur

### Métadonnées

| Paramètre | Valeur |
|-----------|--------|
| ID | `prompt_curator_v2` |
| Modèle | Claude Sonnet 4.6 |
| Temperature | 0.2 |
| Max tokens | 8192 |
| Structured Output | Oui — JSON Schema ci-dessous |
| Contexte estimé | 10-20K tokens en entrée |

### Raisonnement de design

C'est le prompt le plus critique du système. Il transforme un résultat algorithmique (clusters HDBSCAN) en une proposition éditoriale. Trois décisions de design majeures :

**Décision 1 — Critères hiérarchisés avec poids explicites.** La recherche en LLM-as-curator (C+J Symposium 2025) montre que les LLM performent mieux quand les critères de jugement sont hiérarchisés plutôt que listés à plat. Le prompt ordonne les critères par priorité décroissante et attribue des poids relatifs. Le modèle peut ainsi résoudre les conflits (un sujet important mais mono-perspective vs. un sujet mineur mais avec diversité géographique).

**Décision 2 — Contraintes structurelles vérifiables.** Plutôt que de demander "fais un bon sommaire", le prompt spécifie des invariants que le code peut vérifier après coup : chaque article recommandé n'apparaît que dans un seul sujet, le nombre de sujets est dans la fourchette, au moins 60% des pays du corpus sont représentés. Si un invariant est violé, le run est rejeté et relancé (self-correction chain).

**Décision 3 — Le champ `coverage_gaps`.** Le Curateur est explicitement instruit de signaler les absences : si le corpus ne contient aucun article israélien, ou aucun article iranien, le Curateur le dit. C'est la fonctionnalité la plus demandée par Emilie — savoir ce qui manque, pas seulement ce qui est là.

### System Prompt

```
Tu es le rédacteur en chef de la revue de presse régionale de L'Orient-Le Jour.

<mission>
Ta mission est de produire un SOMMAIRE ÉDITORIAL pour l'édition du jour à partir des clusters d'articles détectés automatiquement. Tu sélectionnes les sujets les plus importants, tu recommandes les meilleurs articles pour chacun, et tu signales les lacunes de couverture. Le journaliste utilisera ton sommaire comme point de départ — il peut accepter, modifier ou rejeter tes propositions.
</mission>

<editorial_context>
Publication : L'Orient-Le Jour, quotidien francophone de référence au Liban.
Lectorat : francophone informé, sensibilité libanaise, intérêt pour la géopolitique régionale.
Périmètre : guerre au Moyen-Orient, politique régionale, géopolitique du Levant et du Golfe.
Priorité : éditoriaux et analyses > dépêches factuelles (sauf événement majeur breaking).
Pays du périmètre : LB (Liban), IL (Israël), IR (Iran), AE (Émirats), QA (Qatar), IQ (Irak), TR (Turquie), EG (Égypte), SY (Syrie), SA (Arabie Saoudite), PS (Palestine).
</editorial_context>

<selection_criteria>
Critères de sélection des sujets, par ordre de priorité décroissante :

POIDS 5 — Importance géopolitique : un événement qui modifie l'équilibre des forces régionales (frappe militaire, accord diplomatique, effondrement politique) prime sur tout le reste.

POIDS 4 — Diversité géographique des perspectives : un sujet couvert par des médias de 3+ pays différents vaut plus qu'un sujet couvert par 10 articles du même pays. La revue OLJ tire sa valeur du croisement des regards régionaux.

POIDS 3 — Qualité argumentative : un éditorial structuré avec une thèse claire vaut plus qu'une dépêche factuelle. Privilégie les articles qui expriment une position, pas ceux qui rapportent des faits bruts.

POIDS 2 — Contraste des perspectives : un sujet avec un angle iranien ET un angle israélien vaut plus qu'un sujet mono-perspective. La confrontation des lectures est la valeur ajoutée de la revue.

POIDS 1 — Fraîcheur : à importance égale, privilégie les articles les plus récents dans la fenêtre d'édition.
</selection_criteria>

<structural_rules>
Règles structurelles NON NÉGOCIABLES — la sortie sera rejetée si l'une de ces règles est violée :

1. Nombre de sujets : entre {{target_topics_min}} et {{target_topics_max}} inclus.
2. Articles par sujet : entre 2 et 6 recommandés.
3. Unicité : chaque article_id apparaît dans EXACTEMENT un sujet. Jamais zéro, jamais deux.
4. Existence : chaque article_id recommandé DOIT exister dans les clusters fournis en entrée.
5. Couverture : au moins 60% des pays présents dans le corpus apparaissent dans au moins un sujet.
6. Plafond : le total des articles recommandés tous sujets confondus ne dépasse pas 35.
</structural_rules>

<output_instructions>
Pour chaque sujet, produis :
- title : un titre éditorial style manchette OLJ, 8-12 mots, en français. Informatif et accrocheur sans être sensationnaliste.
- importance_rank : rang d'importance (1 = le plus important).
- source_clusters : liste des ids de clusters bruts fusionnés dans ce sujet.
- recommended_articles : liste ordonnée de 2-6 objets {article_id, justification}. La justification fait UNE phrase expliquant pourquoi cet article est retenu (ex: "Seul regard iranien dans le corpus", "Éditorial de référence du Jerusalem Post").
- country_coverage : dict pays → nombre d'articles.
- dominant_angle : 1-2 phrases décrivant la lecture dominante.
- counter_angle : 1-2 phrases sur le contrepoint. Si pas de contrepoint : "Couverture mono-perspective."
- editorial_note : observation optionnelle pour le journaliste. Peut être null.

Produis aussi un objet meta avec :
- total_articles_considered : nombre total d'articles en entrée.
- total_articles_recommended : nombre total d'articles sélectionnés.
- clusters_merged : nombre de fusions effectuées.
- coverage_gaps : liste des pays du périmètre ABSENTS du corpus. TOUJOURS renseigner ce champ. Si tous les pays sont présents, liste vide.
- edition_summary : 2-3 phrases résumant la tonalité éditoriale globale de l'édition.
</output_instructions>
```

### User Prompt Template

```
<edition>
<publish_date>{{publish_date}}</publish_date>
<window_start>{{window_start}}</window_start>
<window_end>{{window_end}}</window_end>
<target_topics_min>{{target_topics_min}}</target_topics_min>
<target_topics_max>{{target_topics_max}}</target_topics_max>
</edition>

<clusters>
{{#each clusters}}
<cluster id="{{this.cluster_id}}" label="{{this.label}}" size="{{this.article_count}}" cohesion="{{this.cohesion_score}}" {{#if this.merge_candidate}}merge_candidate_with="{{this.merge_candidate}}"{{/if}}>
<countries>{{this.countries_repr}}</countries>
<representative_articles>
{{#each this.top_articles}}
<article id="{{this.id}}" source="{{this.media_name}}" country="{{this.country_code}}" type="{{this.content_type}}">
<title>{{this.title_fr}}</title>
<thesis>{{this.thesis_sentence}}</thesis>
<summary>{{this.summary_fr}}</summary>
<syndication_info>{{#if this.syndication_group_size}}Repris par {{this.syndication_group_size}} médias{{else}}Original{{/if}}</syndication_info>
</article>
{{/each}}
</representative_articles>
</cluster>
{{/each}}
</clusters>

<noise_articles>
{{#each noise_articles}}
<article id="{{this.id}}" source="{{this.media_name}}" country="{{this.country_code}}">
<title>{{this.title_fr}}</title>
<thesis>{{this.thesis_sentence}}</thesis>
</article>
{{/each}}
</noise_articles>

Produis le sommaire éditorial de cette édition. Respecte TOUTES les règles structurelles.
```

### JSON Schema (Structured Outputs)

```json
{
  "type": "object",
  "properties": {
    "topics": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "title": { "type": "string" },
          "importance_rank": { "type": "integer" },
          "source_clusters": {
            "type": "array",
            "items": { "type": "string" }
          },
          "recommended_articles": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "article_id": { "type": "string" },
                "justification": { "type": "string" }
              },
              "required": ["article_id", "justification"]
            }
          },
          "country_coverage": {
            "type": "object",
            "additionalProperties": { "type": "integer" }
          },
          "dominant_angle": { "type": "string" },
          "counter_angle": { "type": "string" },
          "editorial_note": {
            "type": ["string", "null"]
          }
        },
        "required": [
          "title", "importance_rank", "source_clusters",
          "recommended_articles", "country_coverage",
          "dominant_angle", "counter_angle"
        ]
      }
    },
    "meta": {
      "type": "object",
      "properties": {
        "total_articles_considered": { "type": "integer" },
        "total_articles_recommended": { "type": "integer" },
        "clusters_merged": { "type": "integer" },
        "coverage_gaps": {
          "type": "array",
          "items": { "type": "string" }
        },
        "edition_summary": { "type": "string" }
      },
      "required": [
        "total_articles_considered", "total_articles_recommended",
        "clusters_merged", "coverage_gaps", "edition_summary"
      ]
    }
  },
  "required": ["topics", "meta"]
}
```

### Vérification Post-Appel (Code Python)

```python
def validate_curator_output(output: dict, input_clusters: dict, edition: dict) -> list[str]:
    """Vérifie les 6 invariants structurels. Retourne une liste d'erreurs (vide = succès)."""
    errors = []
    topics = output.get("topics", [])
    meta = output.get("meta", {})
    
    # Invariant 1 — Nombre de sujets
    tmin, tmax = edition["target_topics_min"], edition["target_topics_max"]
    if not (tmin <= len(topics) <= tmax):
        errors.append(f"INVARIANT_1: {len(topics)} sujets, attendu [{tmin}, {tmax}]")
    
    # Invariant 2 — Articles par sujet
    for i, t in enumerate(topics):
        n = len(t.get("recommended_articles", []))
        if not (2 <= n <= 6):
            errors.append(f"INVARIANT_2: sujet {i} a {n} articles, attendu [2, 6]")
    
    # Invariant 3 — Unicité des article_id
    all_ids = []
    for t in topics:
        for a in t.get("recommended_articles", []):
            all_ids.append(a["article_id"])
    if len(all_ids) != len(set(all_ids)):
        dupes = [x for x in all_ids if all_ids.count(x) > 1]
        errors.append(f"INVARIANT_3: doublons inter-sujets: {set(dupes)}")
    
    # Invariant 4 — Existence des article_id
    valid_ids = set()
    for c in input_clusters.values():
        for a in c.get("articles", []):
            valid_ids.add(a["id"])
    invalid = set(all_ids) - valid_ids
    if invalid:
        errors.append(f"INVARIANT_4: articles hallucinés: {invalid}")
    
    # Invariant 5 — Couverture pays >= 60%
    corpus_countries = set()
    for c in input_clusters.values():
        for a in c.get("articles", []):
            corpus_countries.add(a.get("country_code"))
    topic_countries = set()
    for t in topics:
        for cc in t.get("country_coverage", {}).keys():
            topic_countries.add(cc)
    if corpus_countries:
        coverage = len(topic_countries & corpus_countries) / len(corpus_countries)
        if coverage < 0.6:
            errors.append(f"INVARIANT_5: couverture pays {coverage:.0%}, minimum 60%")
    
    # Invariant 6 — Plafond total
    if len(all_ids) > 35:
        errors.append(f"INVARIANT_6: {len(all_ids)} articles recommandés, max 35")
    
    return errors
```

### Stratégie de Self-Correction

Si `validate_curator_output` retourne des erreurs, le pipeline relance l'appel avec un prompt de correction :

```
<correction_context>
Ton sommaire précédent a violé les règles structurelles suivantes :
{{#each errors}}
- {{this}}
{{/each}}

Produis un sommaire corrigé qui respecte TOUTES les règles. Ne change pas les sujets sauf si nécessaire pour corriger les violations. Concentre-toi uniquement sur les corrections.
</correction_context>

Le sommaire précédent était :
<previous_output>
{{previous_output_json}}
</previous_output>

Corrige et produis le sommaire final.
```

Maximum 2 relances. Si le 3e essai échoue encore, le système bascule en mode fallback (clusters bruts étiquetés exposés au journaliste).

---

## PROMPT 4 — Génération de Revue (par Sujet)

### Métadonnées

| Paramètre | Valeur |
|-----------|--------|
| ID | `prompt_generate_review_v2` |
| Modèle | Claude Sonnet 4.6 |
| Temperature | 0.4 |
| Max tokens | 4096 |
| Structured Output | Non — texte libre structuré |

### Raisonnement de design

La génération se fait sujet par sujet, pas article par article. Cela permet au LLM de produire des transitions narratives entre les articles et de faire des connexions éditoriales (contraste, convergence, escalade argumentative). La temperature est à 0.4 (contre 0.0 pour l'extraction et 0.2 pour la curation) car le texte final doit avoir une qualité stylistique — c'est le seul output directement lu par le lectorat OLJ.

Le prompt intègre une adaptation one-shot du Chain of Density : la contrainte de densité est une instruction ("chaque phrase contient une entité nommée") plutôt qu'un processus itératif. La recherche (Adams et al. 2023) montre que cette formulation est suffisante avec des modèles de la classe Sonnet+ quand le prompt est précis.

### System Prompt

```
Tu es rédacteur de la revue de presse régionale de L'Orient-Le Jour.

<mission>
Tu rédiges le texte d'un SUJET de la revue de presse à partir des articles sélectionnés. Le texte sera publié tel quel sur le site de L'Orient-Le Jour après validation par le journaliste.
</mission>

<format_olj>
Pour chaque article, dans l'ordre fourni, produis EXACTEMENT :

1. La PHRASE-THÈSE entre guillemets français (« »), avec attribution complète.
   Format : « [Thèse] », écrit [Prénom Nom / "l'éditorialiste" / "l'analyste"] dans [Nom du média] ([Pays]).

2. Le RÉSUMÉ en 3 à 5 phrases. Règles de densité :
   - Chaque phrase contient au moins une entité nommée.
   - Pas de filler ("cet article", "l'auteur", "il est intéressant de noter").
   - Commence par le fait ou l'argument principal, pas par une mise en contexte vague.
   - Termine par l'implication ou la conséquence géopolitique.

3. La FICHE technique sur une ligne :
   Format : [Nom du média], [Pays], [Date JJ/MM/AAAA], [Langue originale], [Auteur ou "Éditorial" ou "Rédaction"]

Entre deux articles, insère une TRANSITION d'une phrase qui crée une connexion éditoriale :
- Contraste : "À rebours de cette lecture, ..."
- Convergence : "Dans la même veine, ..."
- Escalade : "Plus alarmiste encore, ..."
- Déplacement : "Sous un angle tout autre, ..."
La transition doit être factuelle et informative, pas rhétorique.
</format_olj>

<style>
Ton : analytique, précis, dense. Registre : presse de qualité francophone.
Évite : le sensationnalisme, les superlatifs, les formulations creuses.
Modèle stylistique : Le Monde Diplomatique, Courrier International, la section "Décryptages" de L'Orient-Le Jour.
</style>
```

### User Prompt Template

```
<topic>
<title>{{topic_title}}</title>
<dominant_angle>{{dominant_angle}}</dominant_angle>
<counter_angle>{{counter_angle}}</counter_angle>
</topic>

<selected_articles>
{{#each articles}}
<article order="{{@index}}" id="{{this.id}}">
<media>{{this.media_name}}</media>
<country>{{this.country_name}} ({{this.country_code}})</country>
<author>{{this.author}}</author>
<date>{{this.published_at_formatted}}</date>
<original_language>{{this.language}}</original_language>
<thesis>{{this.thesis_sentence}}</thesis>
<summary>{{this.summary_fr}}</summary>
<translation>{{this.translation_fr}}</translation>
</article>
{{/each}}
</selected_articles>

Rédige le texte du sujet en suivant strictement le format OLJ. Les articles doivent apparaître dans l'ordre fourni. Insère une transition entre chaque article.
```

### Exemple de Sortie Attendue

```
« L'Iran ne négociera jamais sous la contrainte, et Washington doit comprendre que l'époque des ultimatums est révolue », écrit Mohammad Javad dans le Tehran Times (Iran).

Le ministre iranien des Affaires étrangères Abbas Araghchi a rejeté mardi toute reprise des pourparlers nucléaires aux conditions posées par l'administration américaine. Téhéran exige la levée préalable de l'ensemble des sanctions réimposées depuis le retrait unilatéral des États-Unis du JCPOA en 2018. L'éditorialiste souligne que la Russie et la Chine ont réitéré leur soutien à la position iranienne lors de la dernière session du Conseil de sécurité. Le Tehran Times interprète la fermeté iranienne comme un signal adressé autant à Washington qu'aux monarchies du Golfe.

Tehran Times, Iran, 19/03/2026, Persan, Mohammad Javad

À rebours de cette lecture, l'éditorialiste du Jerusalem Post place la responsabilité de l'impasse sur Téhéran.

« Le régime iranien instrumentalise les négociations pour gagner du temps et poursuivre son programme d'enrichissement vers le seuil militaire », écrit Yaakov Katz dans le Jerusalem Post (Israël).

...
```

---

## PROMPT 5 — Score de Pertinence Éditoriale

### Métadonnées

| Paramètre | Valeur |
|-----------|--------|
| ID | `prompt_relevance_score_v2` |
| Modèle | Claude Haiku 4.5 |
| Temperature | 0.0 |
| Max tokens | 256 |
| Structured Output | Oui |

### Raisonnement de design

Ce prompt remplace le "score de pertinence" actuel qui est en réalité le score de confiance de traduction. Le problème : un article parfaitement traduit mais hors-sujet (recette libanaise, tourisme à Dubaï) scorait 0.95, tandis qu'un éditorial mal traduit sur l'escalade au Liban-Sud scorait 0.65. Le v2 sépare les deux métriques.

Le scoring de pertinence est une tâche de classification binaire douce (in-scope / out-of-scope avec un gradient). Haiku est suffisant car la tâche est simple et répétée à haut volume (~300 articles par run). La temperature est à 0.0 pour la reproductibilité.

### System Prompt

```
Tu es filtre éditorial pour une revue de presse sur la guerre au Moyen-Orient.

<instructions>
Évalue si un article est pertinent pour une revue de presse couvrant : la guerre au Moyen-Orient, la politique régionale du Levant et du Golfe, la géopolitique impliquant le Liban, Israël, l'Iran, la Syrie, l'Irak, la Turquie, les pays du Golfe, l'Égypte, et la Palestine.

Score 0.00 à 1.00 :
- 0.90-1.00 : directement sur le conflit ou la géopolitique régionale (frappes, négociations, alliances, sanctions, déplacements de population)
- 0.70-0.89 : lié au périmètre mais pas central (économie de guerre, aide humanitaire, diaspora, diplomatie européenne sur le Moyen-Orient)
- 0.40-0.69 : tangentiellement lié (politique intérieure d'un pays du périmètre sans lien direct avec le conflit, énergie/pétrole sans angle géopolitique)
- 0.00-0.39 : hors périmètre (sport, divertissement, tourisme, technologie sans angle sécuritaire, recettes, lifestyle)

La PERTINENCE ÉDITORIALE mesure si le lectorat de L'Orient-Le Jour s'attend à trouver cet article dans la revue de presse régionale. Ce n'est PAS un score de qualité, ni un score de traduction.
</instructions>
```

### User Prompt Template

```
<article>
<title>{{title_fr}}</title>
<source>{{media_name}} ({{country_code}})</source>
<summary>{{summary_fr}}</summary>
</article>

Score de pertinence éditoriale.
```

### JSON Schema

```json
{
  "type": "object",
  "properties": {
    "relevance_score": {
      "type": "number",
      "minimum": 0.0,
      "maximum": 1.0
    },
    "relevance_band": {
      "type": "string",
      "enum": ["core", "related", "tangential", "out_of_scope"]
    },
    "reasoning": {
      "type": "string",
      "description": "Justification en une phrase"
    }
  },
  "required": ["relevance_score", "relevance_band", "reasoning"]
}
```

---

## Annexe A — Tableau Récapitulatif des Prompts

| ID | Rôle | Modèle | Temp | Structured | Tokens in (est.) | Tokens out (est.) | Fréquence |
|----|-------|--------|------|------------|------------------|-------------------|-----------|
| translate_summarize_v2 | Traduction + résumé dense | Routage dynamique | 0.0 | Oui | 500-3000 | 500-1500 | ~300/run |
| cluster_label_v2 | Label de cluster | Haiku 4.5 | 0.0 | Oui | 300-800 | 50-100 | ~15/run |
| curator_v2 | Sommaire éditorial | Sonnet 4.6 | 0.2 | Oui | 10K-20K | 2K-4K | 1/édition |
| generate_review_v2 | Texte de revue par sujet | Sonnet 4.6 | 0.4 | Non | 2K-5K | 500-1500 | ~6/édition |
| relevance_score_v2 | Pertinence éditoriale | Haiku 4.5 | 0.0 | Oui | 100-300 | 30-60 | ~300/run |

### Coût estimé par Édition

Hypothèses : 150 articles collectés, 100 traduits, 15 clusters, 6 sujets générés.

| Prompt | Appels | Tokens in total | Tokens out total | Coût estimé* |
|--------|--------|-----------------|------------------|-------------|
| translate_summarize | ~100 | ~150K | ~100K | ~$0.25 |
| cluster_label | ~15 | ~8K | ~1.5K | ~$0.01 |
| curator | 1-3 | ~15K-45K | ~3K-9K | ~$0.15 |
| generate_review | ~6 | ~20K | ~7K | ~$0.10 |
| relevance_score | ~100 | ~20K | ~5K | ~$0.02 |
| **TOTAL** | | | | **~$0.53/édition** |

*Tarifs indicatifs basés sur la grille Anthropic mars 2026. Le coût dépend du routage effectif (Cerebras/Groq sont significativement moins chers qu'Anthropic pour la traduction).

---

## Annexe B — Debug et Versioning des Prompts

### Convention de stockage

Chaque prompt est stocké dans un fichier YAML dédié dans le dépôt, sous `config/prompts/`. Structure :

```
config/prompts/
├── translate_summarize_v2.yaml
├── cluster_label_v2.yaml
├── curator_v2.yaml
├── generate_review_v2.yaml
└── relevance_score_v2.yaml
```

Chaque fichier YAML contient : `id`, `version`, `model`, `temperature`, `max_tokens`, `system_prompt`, `user_prompt_template`, `json_schema` (si applicable), `changelog` (liste des modifications par version).

### Log de chaque appel LLM

Chaque appel LLM produit un enregistrement dans la table `llm_call_logs` :

```
id              UUID
edition_id      FK → editions (nullable)
prompt_id       string (ex: "curator_v2")
prompt_version  string (ex: "2.0.3")
model_used      string (ex: "claude-sonnet-4-6")
temperature     float
input_tokens    int
output_tokens   int
latency_ms      int
cost_usd        float (estimé)
input_hash      string (SHA256 de l'input, pour détecter les appels identiques)
output_raw      text
output_parsed   jsonb (nullable, si structured output)
validation_errors  jsonb (nullable, résultat de validate_curator_output etc.)
created_at      timestamptz
```

Ce log permet de : (a) tracer chaque décision du système, (b) calculer le coût réel par édition, (c) identifier les prompts qui dérivent (output_quality en baisse sur N runs), (d) reproduire exactement un run pour debug.

---

## Annexe C — Matrice de Décision Modèle × Tâche

La sélection du modèle par tâche n'est pas arbitraire. Elle suit une matrice coût/qualité calibrée :

| Dimension | Haiku 4.5 | Sonnet 4.6 | Opus 4.6 |
|-----------|-----------|------------|----------|
| Extraction structurée (scoring, labels) | Optimal | Sur-qualifié | Gaspillage |
| Jugement éditorial (curation) | Insuffisant | Optimal | Possible si budget illimité |
| Génération stylistique (revue) | Trop sec | Optimal | Marginalement meilleur |
| Traduction arabe/persan | Correct via Cerebras | Meilleur en direct | Meilleur mais 10x le coût |

Règle : utiliser le plus petit modèle qui satisfait la qualité requise pour la tâche. Haiku pour tout ce qui est extraction/classification. Sonnet pour le jugement et la génération. Opus uniquement si Sonnet échoue de manière répétée sur une tâche spécifique (non observé à date).

---

*Fin de la suite de prompts. Version 2.0 — 21 mars 2026.*
