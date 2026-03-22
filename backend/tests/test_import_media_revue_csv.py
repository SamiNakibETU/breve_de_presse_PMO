"""Import CSV revue : fallback URL sans colonne « catégories »."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import pytest

from src.scripts.import_media_revue_csv import _merge_rows, build_media_list


def test_merge_rows_uses_main_url_when_categories_have_no_urls() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "mini.csv"
        p.write_text(
            "Pays,nom,langue,url,catégories,\n"
            'Testland,Test Media,english,https://example.com/opinion,,note sans URL ici\n',
            encoding="utf-8",
        )
        merged = _merge_rows(p)
        assert len(merged) == 1
        (_k, row) = next(iter(merged.items()))
        assert row["opinion_hub_urls"]
        assert "https://example.com/opinion" in row["opinion_hub_urls"][0]


def test_build_media_list_includes_fallback_entry(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    csv_path = tmp_path / "t.csv"
    csv_path.write_text(
        "Pays,nom,langue,url,catégories,\n"
        'Jordanie,No Cat Media,English,https://nocat.example/,,"rien"\n',
        encoding="utf-8",
    )
    merged = _merge_rows(csv_path)
    media = build_media_list(merged)
    assert len(media) == 1
    assert media[0]["id"] == "jo_no_cat_media"
    assert media[0]["opinion_hub_urls"]


def test_import_script_writes_json(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    out = tmp_path / "out.json"
    monkeypatch.setattr("src.scripts.import_media_revue_csv.OUT_PATH", out)
    csv_path = tmp_path / "t.csv"
    csv_path.write_text(
        "Pays,nom,langue,url,catégories,\n"
        "Jordanie,JT Mini,English,https://jordantimes.com/,,\n",
        encoding="utf-8",
    )
    from src.scripts import import_media_revue_csv as mod

    monkeypatch.setattr(sys, "argv", ["import", str(csv_path)])
    mod.main()
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["metadata"]["count"] >= 1
    assert any(m["name"] == "JT Mini" for m in data["media"])
