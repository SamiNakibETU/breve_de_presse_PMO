# QA — jeux d’articles par langue (MEMW)

Objectif : valider **~10 articles réels par grande langue** (ar, en, fa, he, tr, ku, fr) après passage pipeline.

## Pour chaque article, contrôler

| Contrôle | Détail |
|----------|--------|
| `title_fr` / `thesis_summary_fr` | Cohérents, français soutenu, thèse assertive |
| `summary_fr` | 150–200 mots, pas de langue source résiduelle (hors noms propres) |
| `article_type` | opinion \| editorial \| tribune \| analysis \| news \| interview \| reportage |
| `olj_topic_ids` | 1–5 ids taxonomie ou `other` |
| `framing_json` | Présent si attendu ; champs `narrative_framing` remplis |
| `translation_confidence` | Cohérent avec ressenti ; statut `low_quality` / `needs_review` si bas |
| Bloc OLJ (génération) | `« »`, `Résumé :`, `Fiche :`, pas de markdown parasite |

## Langues à couvrir

- **ar** (médias arabophones)
- **en** (y compris mode `translation_english_summary_only` si activé)
- **fa** (Iran)
- **he** (Israël)
- **tr** (Turquie)
- **ku** (Irak / kurde)
- **fr** (dont MEE URL FR si applicable)

## Enregistrement

Conserver pour chaque jeu : URL source, date de test, version du déploiement (commit ou tag), anomalies ouvertes (ticket).
