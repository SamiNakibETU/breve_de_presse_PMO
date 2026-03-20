# Checklist validation MEMW — objectif 30 minutes

Protocole §1.3 MEMW : du lancement de l’interface à une revue prête à intégrer au CMS.

Chronométrer une passe réelle (une seule session, sans interruption longue).

## 0–5 min — Orientation

- [ ] Ouvrir la page d’accueil / sujets du jour : les clusters et métadonnées se chargent sans erreur bloquante.
- [ ] Vérifier qu’au moins un sujet affiche des aperçus de thèses (média / type si exposés par l’API).

## 5–15 min — Sélection éditoriale

- [ ] Parcourir 2–3 sujets et ouvrir le détail : lire thèses + **2–3 lignes** de résumé FR par article (sans interaction superflue).
- [ ] Cocher une sélection multi-pays (≥3 articles) pour une revue cohérente.
- [ ] Contrôler la matrice pays (aperçu) si présente.

## 15–25 min — Génération revue

- [ ] Lancer la génération de revue depuis la sélection.
- [ ] Vérifier le texte brut : blocs OLJ avec `« »`, `Résumé :`, `Fiche :`, longueur de résumé crédible.
- [ ] Exporter **newsletter HTML** et **texte** ; si `PDF_EXPORT_ENABLED=true`, tester l’export PDF.

## 25–30 min — Relecture & fin

- [ ] Repérer 1 article anglais traité en mode résumé-only (`en_translation_summary_only`) si le flag est actif : libellé « corps en langue d’origine » côté liste.
- [ ] Noter les anomalies (source morte, extraction faible) via `/api/media-sources/health` si besoin.

## QA jeux de contrôle (hors chronomètre)

- Prévoir **~10 articles par langue** (fixtures ou URLs de test) pour valider routage LLM, parsing JSON, et qualité des résumés.
