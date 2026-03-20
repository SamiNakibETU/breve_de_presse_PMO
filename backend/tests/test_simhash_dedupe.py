from src.services.simhash_dedupe import simhash_64


def test_simhash_stable_for_same_text():
    t = "mot " * 80
    assert simhash_64(t) == simhash_64(t)
    assert simhash_64(t) != 0


def test_simhash_short_text_zero():
    assert simhash_64("ab") == 0
