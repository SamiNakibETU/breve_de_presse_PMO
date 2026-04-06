from pathlib import Path

from src.services.media_revue_registry import get_media_revue_registry_ids


def test_registry_ids_non_empty_when_file_present() -> None:
    ids = get_media_revue_registry_ids()
    root = Path(__file__).resolve().parents[1]
    registry = root / "data" / "MEDIA_REVUE_REGISTRY.json"
    if registry.is_file():
        assert len(ids) >= 1
        assert all(isinstance(x, str) and x for x in ids)
