# python:3.11-slim n'inclut pas gcc — hdbscan compile des extensions C (.c) :
# sans build-essential, pip échoue avec "gcc failed: No such file or directory".
# PLAYWRIGHT_BROWSERS_PATH ne corrige pas ce problème (c'est pour le runtime, pas le build).

FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    wget gnupg2 ca-certificates fonts-liberation libnss3 libatk1.0-0 \
    libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    libxshmfence1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Chemin fixe dans l'image : évite les décalages si la plateforme définit
# PLAYWRIGHT_BROWSERS_PATH (ex. /tmp/...) sans y avoir installé les binaires au build.
# Sur Railway : ne pas surcharger cette variable dans les variables d'environnement.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    mkdir -p /ms-playwright && \
    playwright install chromium --with-deps && \
    apt-get update && apt-get purge -y build-essential && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

COPY . .

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

EXPOSE 8000

# Image python : CMD hérité = ["python3"] — on le remplace. Pas d'ENTRYPOINT dédié
# pour éviter les conflits si la plateforme injecte une commande sans shell.
# Le shell expand ${PORT:-8000} (Railway définit PORT) ; évite --port '$PORT' littéral.
ENTRYPOINT []
CMD ["/bin/sh", "-c", "exec uvicorn src.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
