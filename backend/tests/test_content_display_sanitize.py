"""Golden tests : nettoyage affichage / extraction plaintext."""

from __future__ import annotations

from src.services.content_display_sanitize import sanitize_extracted_plain_text


def test_drops_zero_comment_line() -> None:
    raw = "Paragraphe utile.\n\n0 commentaire\n\nSuite."
    out = sanitize_extracted_plain_text(raw)
    assert "0 commentaire" not in out
    assert "Paragraphe utile" in out
    assert "Suite" in out


def test_drops_digit_comment_line() -> None:
    raw = "Texte.\n\n3 commentaires\n\nFin."
    out = sanitize_extracted_plain_text(raw)
    assert "commentaires" not in out


def test_splits_french_date_after_period() -> None:
    raw = "La décision tombe.6 avril 2026 le parlement réagit."
    out = sanitize_extracted_plain_text(raw)
    assert ".6 avril" not in out.replace("\n", "")
    assert "6 avril 2026" in out
    assert "\n\n" in out
