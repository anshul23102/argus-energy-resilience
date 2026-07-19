"""Live intelligence endpoints: prices, news polling, backtests, extractor status."""
from fastapi import APIRouter

from ..engines import backtest, news, prices
from ..engines.extractor import provider
from ..engines.risk import ENGINE

router = APIRouter()


@router.get("/prices")
def get_prices():
    return prices.quotes()


@router.post("/news/poll")
def poll_news(hours: int = 24):
    return news.poll(hours=hours)


@router.get("/news/status")
def news_status():
    return {"last_poll": news.status(), "extractor_provider": provider(),
            "events_held": len(ENGINE.events())}


@router.get("/events")
def get_events():
    return [
        {"corridor": e.corridor, "severity": e.severity, "summary": e.summary,
         "source": e.source, "timestamp": e.timestamp, "corroborations": e.corroborations}
        for e in sorted(ENGINE.events(), key=lambda e: -e.timestamp)[:50]
    ]


@router.get("/backtest")
def backtest_summary():
    return backtest.summary()


@router.get("/backtest/{episode_id}")
def backtest_run(episode_id: str):
    return backtest.run(episode_id)
