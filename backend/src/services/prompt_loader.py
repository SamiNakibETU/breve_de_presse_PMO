"""
Charge les prompts versionnés depuis backend/config/prompts/*.yaml (MEMW v2).
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

_PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / "config" / "prompts"


class PromptBundle:
    """Contenu d'un fichier prompt YAML."""

    def __init__(self, prompt_id: str, version: str, data: dict[str, Any]) -> None:
        self.prompt_id = prompt_id
        self.version = version
        self._data = data

    @property
    def system_prompt(self) -> str:
        return str(self._data.get("system_prompt") or "")

    @property
    def user_template(self) -> str:
        return str(self._data.get("user_template") or "")

    def render_user(self, **kwargs: Any) -> str:
        """Substitutions simples {{key}} dans le template utilisateur."""
        out = self.user_template
        for k, v in kwargs.items():
            out = out.replace("{{" + k + "}}", str(v))
        return out

    @property
    def json_schema(self) -> dict[str, Any] | None:
        js = self._data.get("json_schema")
        if isinstance(js, dict):
            return js
        return None


@lru_cache(maxsize=32)
def load_prompt_bundle(prompt_file_stem: str) -> PromptBundle:
    """
    prompt_file_stem : nom sans extension, ex. curator_v2, cluster_label_v2.
    """
    path = _PROMPTS_DIR / f"{prompt_file_stem}.yaml"
    if not path.is_file():
        raise FileNotFoundError(f"Prompt YAML manquant : {path}")
    with open(path, encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    pid = str(raw.get("id") or prompt_file_stem)
    ver = str(raw.get("version") or "1")
    return PromptBundle(pid, ver, raw)


def clear_prompt_cache() -> None:
    load_prompt_bundle.cache_clear()
