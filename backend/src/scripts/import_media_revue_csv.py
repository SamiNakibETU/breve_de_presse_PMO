"""
Importe la liste « media revue » (CSV) vers data/MEDIA_REVUE_REGISTRY.json.

Usage (depuis backend/) :
  python -m src.scripts.import_media_revue_csv
  python -m src.scripts.import_media_revue_csv path/vers/fichier.csv

Les lignes avec plusieurs URLs d’opinion (même média) sont fusionnées par id stable.
"""

from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

from src.scripts.media_revue_paths import (
    DEFAULT_MEDIA_REVUE_CSV_NAME,
    default_media_revue_csv_path,
    resolve_media_revue_csv_path,
)

OUT_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "MEDIA_REVUE_REGISTRY.json"
TIER_OVERRIDES_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "MEDIA_TIER_OVERRIDES.json"

# Quand le CSV n’a ni URL principale ni URL dans « catégories » (ex. Jam-e Jam).
MANUAL_FALLBACK_URLS: dict[tuple[str, str], str] = {
    ("IR", "jam_e_jam"): "https://www.jamejam.ir/",
}

COUNTRY_TO_CODE: dict[str, str] = {
    "arabie saoudite": "SA",
    "turquie": "TR",
    "jordanie": "JO",
    "oman": "OM",
    "algérie": "DZ",
    "algerie": "DZ",
    "qatar": "QA",
    "régional": "ME",
    "regional": "ME",
    "koweït": "KW",
    "koweit": "KW",
    "irak": "IQ",
    "syrie": "SY",
    "emirats arabes unis": "AE",
    "émirats arabes unis": "AE",
    "iran": "IR",
    "bahreïn": "BH",
    "bahrein": "BH",
    "israël": "IL",
    "israel": "IL",
    "egypte": "EG",
    "égypte": "EG",
    "algérie": "DZ",
    "algerie": "DZ",
}

LANG_MAP: dict[str, list[str]] = {
    "english": ["en"],
    "arabic": ["ar"],
    "arabe": ["ar"],
    "arab": ["ar"],
    "turkish": ["tr"],
    "turkish ": ["tr"],
    "hébreu": ["he"],
    "hebreu": ["he"],
    "hebrew": ["he"],
    "farsi": ["fa"],
    "persian": ["fa"],
    "multi": ["en", "ku"],
    "ar/en": ["ar", "en"],
    "ar/en ": ["ar", "en"],
}


def _norm_country(s: str) -> str:
    return (s or "").strip().lower()


def _norm_lang(raw: str) -> list[str]:
    k = (raw or "").strip().lower()
    if k in LANG_MAP:
        return LANG_MAP[k]
    if "ar" in k and "en" in k:
        return ["ar", "en"]
    if k.startswith("en"):
        return ["en"]
    if k.startswith("ar"):
        return ["ar"]
    if k.startswith("tr"):
        return ["tr"]
    if k.startswith("fa"):
        return ["fa"]
    return ["en"]


def _slug_name(name: str) -> str:
    n = unicodedata.normalize("NFKD", name or "")
    n = "".join(c for c in n if not unicodedata.combining(c))
    n = re.sub(r"[^a-zA-Z0-9]+", "_", n.strip().lower()).strip("_")
    return n[:48] or "media"


def _extract_urls(text: str) -> list[str]:
    if not text:
        return []
    found = re.findall(r"https?://[^\s\"'<>]+", text, re.I)
    out: list[str] = []
    seen: set[str] = set()
    for u in found:
        u = u.rstrip(".,);]")
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def _fix_url(url: str) -> str | None:
    u = (url or "").strip()
    if not u:
        return None
    if u.startswith("//"):
        return "https:" + u
    if not u.startswith("http"):
        if "/" in u or "." in u:
            return "https://" + u.lstrip("/")
        return None
    return u


def _merge_rows(csv_path: Path) -> dict[tuple[str, str], dict]:
    """Clé (country_code, slug_name) -> agrégat."""
    merged: dict[tuple[str, str], dict] = {}

    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        rows = list(reader)

    header_idx = None
    for i, row in enumerate(rows):
        if row and len(row) >= 1 and row[0].strip().lower() in ("pays", "country"):
            header_idx = i
            break
    if header_idx is None:
        raise SystemExit("En-tête 'Pays' introuvable dans le CSV.")

    for row in rows[header_idx + 1 :]:
        if len(row) < 5:
            continue
        pays, nom, langue, url, categories = (
            (row[0] or "").strip(),
            (row[1] or "").strip(),
            (row[2] or "").strip(),
            (row[3] or "").strip(),
            (row[4] or "").strip(),
        )
        notes = (row[5] or "").strip() if len(row) > 5 else ""

        if not pays or pays.replace(",", "").strip() == "":
            continue
        if not nom:
            continue

        cc = COUNTRY_TO_CODE.get(_norm_country(pays))
        if not cc:
            cc = pays[:2].upper() if len(pays) >= 2 else "XX"

        slug = _slug_name(nom)
        key = (cc, slug)

        base = _fix_url(url)
        cat_urls = _extract_urls(categories)
        if not base and cat_urls:
            from urllib.parse import urlparse

            p = urlparse(cat_urls[0])
            if p.scheme and p.netloc:
                base = f"{p.scheme}://{p.netloc}/"

        hubs: list[str] = []
        for u in cat_urls:
            fu = _fix_url(u)
            if fu:
                hubs.append(fu)
        inactive_hints = (
            "doesn't open",
            "does not open",
            "acces denied",
            "access denied",
            "website doesn't open",
        )
        inactive = any(h in notes.lower() for h in inactive_hints)

        if key not in merged:
            merged[key] = {
                "country": pays.strip(),
                "country_code": cc,
                "name": nom,
                "languages": _norm_lang(langue),
                "url": base or (hubs[0] if hubs else ""),
                "opinion_hub_urls": [],
                "editorial_line": notes or None,
                "is_active": not inactive,
            }
        else:
            m = merged[key]
            if notes and len(notes) > len(m.get("editorial_line") or ""):
                m["editorial_line"] = notes
            if inactive:
                m["is_active"] = False
            if base and not m.get("url"):
                m["url"] = base

        for h in hubs:
            if h not in merged[key]["opinion_hub_urls"]:
                merged[key]["opinion_hub_urls"].append(h)

    # Fallback : URL principale comme hub si la colonne « catégories » n’a aucune URL
    for key, m in merged.items():
        if not m["opinion_hub_urls"]:
            base_u = _fix_url(m.get("url") or "")
            if base_u:
                m["opinion_hub_urls"].append(base_u)
        if not m.get("url") and m["opinion_hub_urls"]:
            from urllib.parse import urlparse

            p = urlparse(m["opinion_hub_urls"][0])
            m["url"] = f"{p.scheme}://{p.netloc}/" if p.netloc else m["opinion_hub_urls"][0]
        if key in MANUAL_FALLBACK_URLS:
            fb = MANUAL_FALLBACK_URLS[key]
            if not m.get("url"):
                m["url"] = fb
            if not m["opinion_hub_urls"]:
                fu = _fix_url(fb)
                if fu:
                    m["opinion_hub_urls"].append(fu)

    return merged


def _load_tier_overrides() -> dict[str, int]:
    if not TIER_OVERRIDES_PATH.is_file():
        return {}
    raw = json.loads(TIER_OVERRIDES_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        return {}
    out: dict[str, int] = {}
    for k, v in raw.items():
        if k.startswith("_"):
            continue
        if isinstance(v, int) and 0 <= v <= 2:
            out[str(k)] = v
    return out


def build_media_list(merged: dict[tuple[str, str], dict]) -> list[dict]:
    tier_overrides = _load_tier_overrides()
    media: list[dict] = []
    for (cc, slug), m in sorted(merged.items(), key=lambda x: (x[0][0], x[0][1])):
        mid = f"{cc.lower()}_{slug}"
        if not m["opinion_hub_urls"]:
            continue
        if not m.get("url"):
            from urllib.parse import urlparse

            p = urlparse(m["opinion_hub_urls"][0])
            m["url"] = f"{p.scheme}://{p.netloc}/" if p.netloc else "https://example.invalid"

        tier = tier_overrides.get(mid, 1)
        entry = {
            "id": mid,
            "name": m["name"],
            "country": m["country"],
            "country_code": m["country_code"],
            "tier": tier,
            "languages": m["languages"],
            "editorial_line": m.get("editorial_line"),
            "bias": None,
            "content_types": ["opinion", "editorial", "analysis"],
            "url": m["url"],
            "rss_url": None,
            "rss_opinion_url": None,
            "english_version_url": None,
            "opinion_hub_urls": m["opinion_hub_urls"],
            "collection_method": "opinion_hub",
            "paywall": "free",
            "translation_quality_to_fr": "high",
            "editorial_notes": "Liste revue de presse (CSV) — hub opinion / colonnes.",
            "is_active": m["is_active"],
        }
        media.append(entry)

    return media


def load_revue_media_entries_from_csv(csv_path: Path) -> list[dict]:
    """Parse le CSV revue et retourne la liste `media` (même logique que l’export JSON)."""
    merged = _merge_rows(csv_path)
    return build_media_list(merged)


def main() -> None:
    if len(sys.argv) > 1:
        csv_path = Path(sys.argv[1])
    else:
        resolved = resolve_media_revue_csv_path()
        csv_path = resolved if resolved is not None else default_media_revue_csv_path()
    if not csv_path.is_file():
        root = Path(__file__).resolve().parent.parent.parent.parent
        print(
            f"Fichier introuvable: {csv_path}\n"
            f"  Placez « {DEFAULT_MEDIA_REVUE_CSV_NAME} » sous {root} "
            f"ou sous {root / 'archive'}.",
        )
        sys.exit(1)

    media = load_revue_media_entries_from_csv(csv_path)
    payload = {
        "metadata": {
            "source_csv": str(csv_path.name),
            "version": "1.0.0",
            "count": len(media),
        },
        "media": media,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Écrit {len(media)} médias dans {OUT_PATH}")


if __name__ == "__main__":
    main()
