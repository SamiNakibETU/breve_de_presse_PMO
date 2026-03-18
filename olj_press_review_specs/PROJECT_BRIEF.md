# PROJECT_BRIEF.md
## OLJ Press Review — Revue de presse régionale automatisée

---

## Contexte

L'Orient-Le Jour (OLJ) est le principal quotidien francophone libanais et du Moyen-Orient. Le journal souhaite produire quotidiennement une revue de presse régionale sur les guerres et la géopolitique au Moyen-Orient, à partir de médias régionaux couvrant 15 pays.

## Objectif

Construire un système automatisé qui :
1. **Collecte** quotidiennement 50-150 articles d'opinion/analyse de 48 médias MENA
2. **Traduit et résume** chaque article en français (150-200 mots, ton neutre OLJ)
3. **Présente** les articles traduits dans une interface web pour sélection éditoriale
4. **Génère** le bloc texte final au format OLJ exact, prêt à copier dans le CMS

## Format de sortie (format OLJ exact)

```
« Titre synthétique reformulé — thèse de l'auteur »

Résumé : [150-200 mots, ton neutre, restitution fidèle de l'argument]

Fiche :
Article publié dans [média]
Le [date]
Langue originale : [langue]
Pays du média : [pays]
Nom de l'auteur : [auteur]
```

## Stack technique

| Composant | Technologie | Version |
|-----------|-------------|---------|
| Backend API | FastAPI | 0.115.6 |
| Base de données | PostgreSQL + pgvector | 16 + 0.7 |
| ORM | SQLAlchemy (async) | 2.0.36 |
| Traduction/résumé | Claude Haiku 4.5 | claude-haiku-4-5-20251001 |
| Génération OLJ | Claude Sonnet 4.5 | claude-sonnet-4-5-20241022 |
| Embeddings | text-embedding-3-small | OpenAI |
| Collecte RSS | feedparser + trafilatura | 6.0.11 / 2.0.0 |
| Interface | Streamlit | 1.41.1 |
| Scheduler | APScheduler | 3.10.4 |
| Déploiement | Railway | - |

## Contraintes

- Budget mensuel cible : < 60€ tout compris
- Pas d'intégration CMS — copier-coller uniquement
- Relecture humaine obligatoire avant publication
- Respect strict du format OLJ
- Couverture multilingue : arabe, anglais, hébreu, persan, turc, français, kurde
- Scraping éthique : robots.txt, rate limiting, user-agent identifié

## Définition de "Done" pour le MVP

- [ ] 40+ sources RSS collectent quotidiennement sans erreur
- [ ] Traduction+résumé en 150-200 mots pour 95%+ des articles
- [ ] Format OLJ exact respecté dans 100% des générations
- [ ] Interface Streamlit fonctionnelle (filtres, sélection, génération, copie)
- [ ] Pipeline automatique 2x/jour (06:00 + 14:00 UTC)
- [ ] Déployé sur Railway, accessible via URL
- [ ] Coût API < $2/jour en usage normal
- [ ] Temps d'exécution pipeline < 15 minutes

## Workflow humain préservé

```
[Collecte auto 06:00]  →  [Journaliste consulte ~08:00]  →  [Sélection 3-5 articles]
                                                             ↓
[Publication CMS]  ←  [Relecture + édits manuels]  ←  [Génération format OLJ]
```

Le système ne publie JAMAIS automatiquement. Le journaliste reste le décisionnaire éditorial.
