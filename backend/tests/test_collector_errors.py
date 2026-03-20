import asyncio
import socket

from src.services.collector import _aggregate_error_breakdown, _classify_collection_error


def test_classify_timeout():
    assert _classify_collection_error(asyncio.TimeoutError()) == "timeout"


def test_classify_dns_gaierror():
    exc = socket.gaierror(8, "nodename nor servname provided")
    assert _classify_collection_error(exc) == "dns"


def test_classify_timeout_message():
    assert _classify_collection_error(RuntimeError("Connection timed out")) == "timeout"


def test_classify_http_403():
    assert _classify_collection_error(RuntimeError("403 Forbidden")) == "http_403"


def test_aggregate_breakdown():
    errors = [
        {"source": "a", "error": "x", "reason": "dns"},
        {"source": "b", "error": "y", "reason": "dns"},
        {"source": "c", "error": "z"},
    ]
    assert _aggregate_error_breakdown(errors) == {"dns": 2, "other": 1}
