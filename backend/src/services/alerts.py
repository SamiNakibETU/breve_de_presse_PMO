"""Alertes ops légères (webhook) — MEMW phase 4."""

from __future__ import annotations

import json
from typing import Any

import aiohttp
import structlog

from src.config import get_settings

logger = structlog.get_logger(__name__)


async def _post_json_alert(url: str | None, payload: dict[str, Any]) -> None:
    if not url:
        return
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                data=json.dumps(payload, ensure_ascii=False),
                headers={"Content-Type": "application/json"},
                timeout=aiohttp.ClientTimeout(total=12),
            ) as resp:
                if resp.status >= 400:
                    logger.warning(
                        "alert.webhook_http",
                        status=resp.status,
                        url=url[:80],
                    )
    except Exception as exc:
        logger.warning("alert.webhook_failed", error=str(exc)[:200], url=url[:80])


async def _send_resend_email(*, subject: str, text_body: str) -> None:
    s = get_settings()
    key = (s.resend_api_key or "").strip()
    to_raw = (s.alert_email_to or "").strip()
    if not key or not to_raw:
        return
    recipients = [x.strip() for x in to_raw.split(",") if x.strip()]
    if not recipients:
        return
    body = {
        "from": s.alert_email_from,
        "to": recipients,
        "subject": subject,
        "text": text_body,
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.resend.com/emails",
                data=json.dumps(body, ensure_ascii=False),
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status >= 400:
                    txt = await resp.text()
                    logger.warning(
                        "alert.resend_http",
                        status=resp.status,
                        detail=txt[:200],
                    )
    except Exception as exc:
        logger.warning("alert.resend_failed", error=str(exc)[:200])


async def post_dead_source_alert(source_id: str, name: str, health: str) -> None:
    s = get_settings()
    payload = {
        "type": "media_source_health",
        "source_id": source_id,
        "name": name,
        "health_status": health,
    }
    await _post_json_alert(s.alert_webhook_url, payload)
    await _post_json_alert(s.alert_email_webhook_url, payload)
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    await _send_resend_email(
        subject=f"[MEMW] Source {name} — {health}",
        text_body=text,
    )


async def post_pipeline_step_timeout_alert(
    *,
    step: str,
    timeout_s: int,
    trigger: str,
) -> None:
    """Webhook / email lorsqu’une étape pipeline dépasse son budget."""
    s = get_settings()
    payload = {
        "type": "pipeline_step_timeout",
        "step": step,
        "timeout_s": timeout_s,
        "trigger": trigger,
    }
    await _post_json_alert(s.alert_webhook_url, payload)
    await _post_json_alert(s.alert_email_webhook_url, payload)
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    await _send_resend_email(
        subject=f"[MEMW] Pipeline — timeout étape {step} ({timeout_s}s)",
        text_body=text,
    )


async def post_pipeline_stalled_alert(
    *,
    holder_id: str | None,
    seconds_since_heartbeat: float,
    trigger_label: str | None,
) -> None:
    s = get_settings()
    payload = {
        "type": "pipeline_stalled",
        "holder_id": holder_id,
        "seconds_since_heartbeat": round(seconds_since_heartbeat, 1),
        "trigger_label": trigger_label,
    }
    await _post_json_alert(s.alert_webhook_url, payload)
    await _post_json_alert(s.alert_email_webhook_url, payload)
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    await _send_resend_email(
        subject="[MEMW] Pipeline — progression bloquée (heartbeat)",
        text_body=text,
    )


async def post_pipeline_timeout_alert(*, timeout_s: int, trigger: str) -> None:
    """Webhook / email lorsque le pipeline complet dépasse le délai max."""
    s = get_settings()
    payload = {
        "type": "pipeline_timeout",
        "timeout_s": timeout_s,
        "trigger": trigger,
    }
    await _post_json_alert(s.alert_webhook_url, payload)
    await _post_json_alert(s.alert_email_webhook_url, payload)
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    await _send_resend_email(
        subject=f"[MEMW] Pipeline — timeout {timeout_s}s",
        text_body=text,
    )


async def post_topic_detector_low_articles_alert(
    *,
    edition_id: str,
    count: int,
    min_required: int,
) -> None:
    """Webhook optionnel : corpus insuffisant pour la détection de sujets (LLM)."""
    s = get_settings()
    payload = {
        "type": "topic_detector_too_few_articles",
        "edition_id": edition_id,
        "count": count,
        "min_required": min_required,
    }
    await _post_json_alert(s.alert_webhook_url, payload)
    await _post_json_alert(s.alert_email_webhook_url, payload)


async def post_cluster_hot_alert(
    *,
    cluster_id: str,
    label: str | None,
    articles_total: int,
    articles_last_7d: int,
) -> None:
    s = get_settings()
    payload = {
        "type": "cluster_hot",
        "cluster_id": cluster_id,
        "label": label,
        "articles_total": articles_total,
        "articles_last_7d": articles_last_7d,
    }
    await _post_json_alert(s.alert_webhook_url, payload)
    await _post_json_alert(s.alert_email_webhook_url, payload)
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    await _send_resend_email(
        subject=f"[MEMW] Cluster actif — {label or cluster_id}",
        text_body=text,
    )
