"""MinHash LSH dédup surface (Sprint 3)."""

from datasketch import MinHashLSH

from src.services.dedup_surface import JACCARD_THRESHOLD, NUM_PERM, _minhash


def test_identical_fr_text_queries_neighbor():
    text = " ".join(["escalade", "régionale", "diplomatie", "golfe", "iran"] * 12)
    lsh = MinHashLSH(threshold=JACCARD_THRESHOLD, num_perm=NUM_PERM)
    mh_a = _minhash(text)
    mh_b = _minhash(text)
    lsh.insert("a", mh_a)
    lsh.insert("b", mh_b)
    assert "b" in lsh.query(mh_a)
