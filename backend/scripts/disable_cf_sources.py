"""Désactive les sources Cloudflare total dans MEDIA_REVUE_REGISTRY.json."""
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
REGISTRY_PATH = BASE / "data" / "MEDIA_REVUE_REGISTRY.json"

CF_TOTAL = {
    "ae_gulf_news",
    "bh_al_watan",
    "iq_al_sabah",
    "ir_iran_international",
    "jo_jordan_times",
    "qa_al_sharq",
}

reg = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
for m in reg["media"]:
    if m["id"] in CF_TOTAL:
        m["is_active"] = False
        print(f"Desactive: {m['id']} ({m['name']})")

REGISTRY_PATH.write_text(json.dumps(reg, ensure_ascii=False, indent=2), encoding="utf-8")
print("Done.")
