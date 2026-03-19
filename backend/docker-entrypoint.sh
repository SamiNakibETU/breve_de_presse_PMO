#!/bin/sh
set -e
# Même logique que le CMD du Dockerfile (lancement manuel : docker run ... /app/docker-entrypoint.sh).
# Sur Railway, préférer l’image telle quelle + backend/railway.toml (pas de commande uvicorn brute).
_port="${PORT:-8000}"
exec uvicorn src.app:app --host 0.0.0.0 --port "${_port}"
