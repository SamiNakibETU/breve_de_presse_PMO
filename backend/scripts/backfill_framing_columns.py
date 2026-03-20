"""Remplit framing_actor, framing_tone, framing_prescription depuis framing_json (one-shot)."""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from src.database import get_session_factory
from src.models.article import Article
from src.services.translator import _denormalize_framing_columns


async def main() -> None:
    factory = get_session_factory()
    async with factory() as db:
        q = await db.execute(select(Article).where(Article.framing_json.isnot(None)))
        rows = q.scalars().all()
        n = 0
        for art in rows:
            _denormalize_framing_columns(art, art.framing_json)
            n += 1
        await db.commit()
    print(f"updated {n} articles")


if __name__ == "__main__":
    asyncio.run(main())
