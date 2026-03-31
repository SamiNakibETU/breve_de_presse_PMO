"""
Fichier source « media revue » : nom fixe, cherché d’abord à la racine du dépôt,
puis dans `archive/` (brouillons locaux, souvent ignoré par git).
"""

from __future__ import annotations

from pathlib import Path

# Nom exact du fichier (feuille exportée) — inchangé pour éviter les chemins magiques dispersés.
DEFAULT_MEDIA_REVUE_CSV_NAME = "media revue - Sheet1.csv"


def repo_root() -> Path:
    """Racine du dépôt (parent de `backend/`)."""
    return Path(__file__).resolve().parent.parent.parent.parent


def resolve_media_revue_csv_path() -> Path | None:
    """Premier emplacement existant : racine repo, puis `archive/`."""
    root = repo_root()
    for rel in (
        DEFAULT_MEDIA_REVUE_CSV_NAME,
        Path("archive") / DEFAULT_MEDIA_REVUE_CSV_NAME,
    ):
        p = root / rel
        if p.is_file():
            return p
    return None


def default_media_revue_csv_path() -> Path:
    """Chemin à utiliser par défaut (fichier trouvé, sinon racine pour les messages d’erreur)."""
    found = resolve_media_revue_csv_path()
    if found is not None:
        return found
    return repo_root() / DEFAULT_MEDIA_REVUE_CSV_NAME
