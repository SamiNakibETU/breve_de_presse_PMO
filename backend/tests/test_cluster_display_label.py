"""Libellés d’affichage cluster (repli titre / repli fixe)."""

from types import SimpleNamespace

from src.services.curator_service import (
    FALLBACK_CLUSTER_DISPLAY_LABEL,
    _cluster_display_label,
)


def test_cluster_display_label_uses_db_when_non_empty() -> None:
    cl = SimpleNamespace(label="  Mon sujet  ")
    assert _cluster_display_label(cl, ["autre titre"]) == "Mon sujet"


def test_cluster_display_label_falls_through_titles() -> None:
    cl = SimpleNamespace(label="   ")
    assert _cluster_display_label(cl, ["", "  Titre article  "]) == "Titre article"


def test_cluster_display_label_fallback_when_no_titles() -> None:
    cl = SimpleNamespace(label=None)
    assert _cluster_display_label(cl, ["", "  "]) == FALLBACK_CLUSTER_DISPLAY_LABEL


def test_cluster_display_label_none_cluster_uses_titles() -> None:
    assert _cluster_display_label(None, ["OK"]) == "OK"
