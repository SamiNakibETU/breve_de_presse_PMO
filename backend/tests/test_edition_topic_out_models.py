"""Schémas Pydantic topics + aperçus articles."""

from uuid import uuid4

from src.routers.editions import EditionTopicOut, TopicArticlePreviewOut


def test_edition_topic_out_with_previews() -> None:
    tid = uuid4()
    aid = uuid4()
    prev = TopicArticlePreviewOut(
        id=aid,
        title_fr="Titre FR",
        title_original="Title",
        media_name="Média",
        url="https://example.com/a",
    )
    t = EditionTopicOut(
        id=tid,
        rank=0,
        title_proposed="Sujet",
        title_final=None,
        status="proposed",
        dominant_angle=None,
        counter_angle=None,
        editorial_note=None,
        country_coverage=None,
        generated_text=None,
        article_count=2,
        article_previews=[prev],
    )
    d = t.model_dump()
    assert d["article_count"] == 2
    assert len(d["article_previews"]) == 1
    assert d["article_previews"][0]["url"] == "https://example.com/a"
