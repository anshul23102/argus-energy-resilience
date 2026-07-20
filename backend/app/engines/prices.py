"""Live market feed: Brent, WTI, USD/INR via Yahoo Finance public data.

Cached with a short TTL so the UI can poll freely without hammering the source.
Falls back to assumption defaults (flagged stale=True) if the feed is down —
the system degrades gracefully, it never fabricates a live number silently.
"""
from __future__ import annotations

import time
from typing import Any

import yfinance as yf

from ..core import data

_TICKERS = {"brent": "BZ=F", "wti": "CL=F", "usd_inr": "INR=X"}
_TTL_SECONDS = 300
_cache: dict[str, Any] = {"at": 0.0, "quotes": None}


def _fetch() -> dict[str, Any]:
    quotes: dict[str, Any] = {}
    for name, ticker in _TICKERS.items():
        try:
            h = yf.Ticker(ticker).history(period="5d", interval="1d")
            if len(h) == 0:
                raise ValueError("empty history")
            last = float(h["Close"].iloc[-1])
            prev = float(h["Close"].iloc[-2]) if len(h) > 1 else last
            quotes[name] = {
                "price": round(last, 2),
                "change_pct": round((last - prev) / prev * 100, 2),
                "stale": False,
            }
        except Exception:
            fallback = {
                "brent": data.assumption("economics.brent_default_usd"),
                "wti": data.assumption("economics.brent_default_usd") - 4.0,
                "usd_inr": data.assumption("economics.usd_inr"),
            }[name]
            quotes[name] = {"price": fallback, "change_pct": 0.0, "stale": True}
    return quotes


def quotes() -> dict[str, Any]:
    now = time.time()
    if _cache["quotes"] is None or now - _cache["at"] > _TTL_SECONDS:
        _cache["quotes"] = _fetch()
        _cache["at"] = now
    return {"as_of": _cache["at"], **_cache["quotes"]}


_hist_cache: dict[str, Any] = {"at": 0.0, "days": 0, "rows": None}


def brent_recent(days: int = 30):
    """Recent daily Brent closes for the header sparkline. 1h TTL."""
    now = time.time()
    if _hist_cache["rows"] is None or _hist_cache["days"] != days or now - _hist_cache["at"] > 3600:
        try:
            h = yf.Ticker("BZ=F").history(period=f"{days + 10}d", interval="1d")
            _hist_cache["rows"] = [
                {"date": str(idx.date()), "close": round(float(row["Close"]), 2)}
                for idx, row in h.iterrows()
            ][-days:]
        except Exception:
            _hist_cache["rows"] = _hist_cache["rows"] or []
        _hist_cache.update(at=now, days=days)
    return _hist_cache["rows"]


def brent_history(start: str, end: str):
    """Daily Brent closes for backtesting, as [{date, close}]."""
    h = yf.Ticker("BZ=F").history(start=start, end=end, interval="1d")
    return [
        {"date": str(idx.date()), "close": round(float(row["Close"]), 2)}
        for idx, row in h.iterrows()
    ]
