"""Types d'articles éditoriaux / opinion — source unique pour clustering et analyse."""

EDITORIAL_CLUSTER_TYPES: frozenset[str] = frozenset({
    "opinion",
    "editorial",
    "tribune",
    "analysis",
})
