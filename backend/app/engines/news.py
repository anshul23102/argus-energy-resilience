"""GDELT news watcher: polls the GDELT 2.0 DOC API for energy-shipping-security
coverage, dedupes, runs the extractor, and feeds structured events to the risk engine.

GDELT is free, global, and updates every 15 minutes — this is a genuinely live feed.
"""
from __future__ import annotations

import time

import httpx

from .extractor import extract_batch
from .risk import ENGINE, Event

GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
QUERY = (
    '(("strait of hormuz" OR "red sea shipping" OR houthi OR "suez canal" OR '
    '"bab el-mandeb" OR "oil tanker") AND (attack OR seized OR missile OR drone OR '
    'closure OR suspend OR threat OR jamming OR reroute))'
)

RSS_QUERIES = [
    "strait of hormuz tanker", "red sea shipping attack", "houthi shipping",
    "suez canal disruption", "oil tanker seized",
]

_seen_urls: set[str] = set()
_last_poll: dict = {"at": None, "fetched": 0, "extracted": 0, "error": None}


def _fetch_rss() -> list[dict]:
    """Google News RSS fallback — free, unthrottled, titles only."""
    import xml.etree.ElementTree as ET
    articles = []
    for q in RSS_QUERIES:
        try:
            r = httpx.get("https://news.google.com/rss/search",
                          params={"q": q, "hl": "en-IN", "gl": "IN"}, timeout=20,
                          follow_redirects=True)
            r.raise_for_status()
            for item in ET.fromstring(r.text).iter("item"):
                title = item.findtext("title") or ""
                link = item.findtext("link") or ""
                src = item.findtext("source") or "news.google.com"
                if title and link:
                    articles.append({"title": title, "url": link, "domain": f"rss:{src}"})
        except Exception:
            continue
    return articles


def poll(hours: int = 24, max_records: int = 40) -> dict:
    """One polling pass. Returns stats; ingests new events into the risk engine."""
    global _last_poll
    stats = {"at": time.time(), "fetched": 0, "extracted": 0, "error": None, "source": "gdelt"}
    try:
        r = None
        for attempt in range(2):
            r = httpx.get(GDELT_URL, params={
                "query": QUERY, "mode": "ArtList", "format": "json",
                "maxrecords": max_records, "timespan": f"{hours}h", "sort": "DateDesc",
            }, timeout=30)
            if r.status_code != 429:
                break
            time.sleep(8 * (attempt + 1))  # GDELT free tier throttles per-IP
        try:
            r.raise_for_status()
            articles = r.json().get("articles", [])
        except Exception:  # 429 cooldown, HTML error body, malformed JSON — any of GDELT's moods
            articles = _fetch_rss()
            stats["source"] = "google-news-rss"
        stats["fetched"] = len(articles)
        fresh: list[dict] = []
        for a in articles:
            url = a.get("url", "")
            if not url or url in _seen_urls or not a.get("title"):
                continue
            _seen_urls.add(url)
            fresh.append(a)
        # ONE batched LLM call for the whole cycle — free-tier rate limits are a
        # per-request budget, so we spend requests per poll, not per headline.
        results = extract_batch([a["title"] for a in fresh])
        extracted = [
            (ev, a.get("domain", "unknown"))
            for a, ev in zip(fresh, results) if ev is not None
        ]
        stats["extracted"] = len(extracted)

        # Cluster: N articles about the same (corridor, severity) in one poll are one
        # incident with N corroborations — not N independent incidents. Without this,
        # heavy news coverage would saturate the Bayesian engine.
        clusters: dict[tuple[str | None, str | None, str], list[tuple[dict, str]]] = {}
        for ev, domain in extracted:
            clusters.setdefault((ev.get("corridor"), ev.get("supplier"), ev["severity"]), []).append((ev, domain))
        for (corridor, supplier, severity), members in clusters.items():
            ev, domain = members[0]
            ENGINE.ingest(Event(
                corridor=corridor, supplier=supplier, severity=severity, summary=ev["summary"],
                source=f"{stats['source']}:{domain} (+{len(members) - 1} corroborating)",
                corroborations=len(members),
            ))
        stats["incidents"] = len(clusters)
    except Exception as e:  # feed down != system down
        stats["error"] = str(e)[:200]
    _last_poll = stats
    return stats


def status() -> dict:
    return _last_poll
