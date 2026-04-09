"""
Filtres « bruit » pour la collecte hubs opinion : pages rubrique, légales, listes thématiques, etc.

Utilisé par hub_links (finalisation), smart_content.filter_article_urls, la file harvest
et opinion_hub_scraper après extraction.
"""

from __future__ import annotations

import re
from urllib.parse import unquote, urlparse

_TITLE_NOISE_SUBSTRINGS = (
    "privacy policy",
    "privacy ",
    "cookie policy",
    "terms of use",
    "terms and conditions",
    "conditions d'utilisation",
    "contact us",
    "contact ",
    "צור קשר",
    "מדיניות פרטיות",
    "מוספים מיוחדים",
    "404",
    "500",
    "internal server error",
    "access denied",
    "شروط استخدام",
    "اتصل بنا",
    "سياسة الخصوصية",
    "الخصوصية",
    "هيئة التحرير",
    "جميع الحقوق",
    "op-eds:",
    "op eds:",
    "expert opinions and analysis",
    "الملفات الخاصة",
    "خدمة جديدة لبوابة",
    "بوابة الأهرام",
    "الرئيسية - الأهرام",
)

_TITLE_SPORT_NOISE = (
    "ريال مدريد",
    "برشلونة",
    "أتلتيكو",
    "كامب نو",
    "مدافع ريال",
    "مواجهة ثأرية",
    "العراق يدين بشدة",
    "استكمال جزئي للجان النيابية",
)


def _host_key(netloc: str) -> str:
    n = (netloc or "").lower().split(":")[0]
    if n.startswith("www."):
        n = n[4:]
    return n


def is_noise_opinion_hub_url(url: str) -> bool:
    """
    True si l’URL ne doit pas être traitée comme article d’opinion (candidat lien).
    """
    if not url or not url.startswith("http"):
        return True
    low = url.lower()
    p = urlparse(url)
    host = _host_key(p.netloc)
    path_raw = (p.path or "").lower()
    path_dec = unquote(p.path or "").lower()

    if "/newadv/" in low:
        return True

    if "timesofisrael.com" in host and "/topic/" in low:
        return True

    if "aletihad.ae" in host:
        # Le hub « opinion » renvoie souvent vers /news/ ou /coverage/ (hors chroniques).
        if "/coverage/" in low or "/news/" in low:
            return True

    if "gulfnews.com" in host:
        if re.search(r"/opinion/op-eds/?$", path_raw):
            return True
        pr = path_raw.rstrip("/")
        if pr.endswith("/op-ed") or pr.endswith("/op-eds"):
            return True

    if "ahram.org.eg" in host:
        if "index.aspx" in low and "writerarticles" not in low:
            return True
        if "/writercategory/" in low:
            return True

    if "ynet.co.il" in host or "z.ynet.co.il" in host:
        if "/mshort/" in low:
            return True

    if "alanba.com.kw" in host:
        if "/ar/opinion/" in low:
            return False
        if re.search(r"/ar/[\w-]+-news/[\w-]+/?$", path_raw) and not re.search(r"\d{5,}", path_raw):
            return True
        if re.search(r"/ar/kuwait-community/[\w-]+/?$", path_raw) and not re.search(r"\d{5,}", path_raw):
            return True

    if "azzaman.com" in host:
        noise_markers = (
            "هيئة-التحرير",
            "هيئـ",
            "شروط-استخدام",
            "شروط استخدام",
            "جميع-الحقوق",
            "الحقوق-محفوظة",
        )
        for m in noise_markers:
            if m in path_dec:
                return True

    if "alwatan.com.sa" in host and "/morearticles/" in low:
        return True

    if "donya-e-eqtesad" in host or "donya-e-eqtesad.com" in host:
        if "بسته" in path_dec or "بسته" in low:
            return True
        if "%d8%a8%d8%b3%d8%aa%d9%87" in low:
            return True

    return False


def should_reject_opinion_page(url: str, title: str | None) -> bool:
    """
    Rejet après extraction (titre + URL) : légal, erreurs, sections, sport ramassé par erreur.
    """
    if is_noise_opinion_hub_url(url):
        return True
    t = (title or "").strip().lower()
    if not t:
        return False
    if any(s in t for s in _TITLE_NOISE_SUBSTRINGS):
        return True
    if any(s in t for s in _TITLE_SPORT_NOISE):
        return True
    if re.search(r"\b500\b", t) and "error" in t:
        return True
    return False
