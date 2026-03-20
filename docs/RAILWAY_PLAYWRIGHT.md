# Playwright sur Railway (Docker)

## Symptôme

`BrowserType.launch: Executable doesn't exist at ...` avec un chemin sous `/tmp/` ou vide.

## Cause fréquente

Une variable d’environnement **`PLAYWRIGHT_BROWSERS_PATH`** pointe vers un répertoire (souvent `/tmp/...`) où **aucun navigateur n’a été installé** au moment du build Docker. Playwright cherche alors les binaires au mauvais endroit.

## Ce que fait ce projet

Le [`backend/Dockerfile`](../backend/Dockerfile) définit :

- `ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`
- `playwright install chromium --with-deps` pendant le build (les binaires sont dans l’image).

## À faire sur Railway

1. Vérifier les **variables d’environnement** du service : **supprimer** `PLAYWRIGHT_BROWSERS_PATH` si vous l’aviez ajoutée manuellement (pour laisser la valeur du Dockerfile), **ou** la laisser identique à `/ms-playwright`.
2. S’assurer que le build utilise bien le **Dockerfile** (`railway.toml` : `builder = "DOCKERFILE"`).
3. Redéployer après modification des variables.

Les flux RSS / DNS en erreur (`tr_ahval`, etc.) sont indépendants de Playwright : à traiter côté source ou réseau.
