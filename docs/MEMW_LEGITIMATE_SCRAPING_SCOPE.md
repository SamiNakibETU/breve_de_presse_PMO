# Périmètre légitime de la collecte (MEMW)

## Habilitation OLJ — liste des médias

Pour les besoins de la **revue de presse régionale**, l’**Orient-Le Jour** (rédaction, direction, **service juridique**) a validé le **périmètre des médias** et des rubriques opinion tels qu’ils sont consignés dans :

- le fichier CSV **« media revue - Sheet1.csv »** (racine du dépôt ou `archive/media revue - Sheet1.csv`) ;
- le registre synchronisé **`backend/data/MEDIA_REVUE_REGISTRY.json`** (commande : `python -m src.scripts.import_media_revue_csv` depuis `backend/`).

Toute collecte automatisée **hors** de ce registre (URL ou médias non listés) n’entre pas dans ce cadre et ne doit pas être ajoutée sans validation éditoriale et juridique OLJ.

La conformité au **droit libanais** et les **validations juridiques internes** à l’OLJ sur ce périmètre sont consignées dans les **dossiers de l’entreprise** (hors dépôt).

## Ce que nous n’utilisons pas

- **Services tiers de dépaywallage** (extensions, sites « dépaywall », API payantes dédiées au contournement d’abonnement).
- **Fermes de résolution de captcha** ou relais payants conçus pour franchir des challenges à la place d’un usage humain.
- **Partage ou réutilisation de comptes** pour accéder à du contenu réservé aux abonnés identifiés.
- **Promesse de 100 % de réussite** : objectif technique irréaliste sur des infrastructures tierces (CDN, rate limits, indisponibilités).

## Ce que nous faisons (périmètre registre)

- **Flux RSS / Atom** lorsqu’ils sont publics et configurés (overrides, registre).
- **Pages et articles accessibles** dans les conditions où un lecteur peut les consulter (y compris rendu **JavaScript** via **Playwright** pour du contenu **déjà servi** sur la page).
- **HTTP + curl_cffi** : en-têtes et TLS proches d’un client navigateur, pour la robustesse face à des serveurs qui filtrent des clients « non navigateur ».
- **`OPINION_HUB_OVERRIDES.json`** : flux de secours, filtres de liens RSS, délais, scroll, sélecteurs — toujours pour des **sources du registre** et des URL déclarées.
- **Rapports** (`verify_scrape_one_per_rubrique`, `validate_rss_feeds`, etc.) pour documenter échecs techniques vs filtre éditorial.

## Si une source du registre reste bloquée

1. Vérifier **flux officiel**, URL de hub, overrides.
2. **Accès conventionné** (partenariat, API, allowlist IP) si le média le propose.
3. Marquer la source **inactive** ou **dégradée** dans le registre plutôt que d’élargir la collecte hors liste validée.

Voir aussi [SOURCE_REMEDIATION_PLAYBOOK.md](SOURCE_REMEDIATION_PLAYBOOK.md).
