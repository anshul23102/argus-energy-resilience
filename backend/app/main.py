"""ARGUS backend — AI Energy Supply Chain Resilience Platform.

ET AI Hackathon 2.0, Problem Statement 2.
"""
import asyncio
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

load_dotenv(Path(__file__).resolve().parents[1] / ".env")  # keys stay local, never committed

from .engines import news
from .routers import assets, assumptions, intel, risk, scenario

POLL_INTERVAL_S = 900  # GDELT refreshes every 15 min

# Rate limiting: write endpoints run a real solver/simulation per request
# (Monte Carlo, LP, LLM calls) and are unauthenticated, so an unthrottled
# client could cheaply drive real compute/API cost. In-memory sliding-window
# limiter, no external dependency — sessions are single-instance for this
# deployment, so this doesn't need to be shared across processes.
RATE_LIMITED_PATHS = {"/api/scenario/respond", "/api/scenario/simulate", "/api/assumptions"}
RATE_LIMIT_MAX_REQUESTS = 20
RATE_LIMIT_WINDOW_S = 60
_request_log: dict[str, deque] = defaultdict(deque)


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in RATE_LIMITED_PATHS:
            key = f"{request.client.host if request.client else 'unknown'}:{request.url.path}"
            now = time.time()
            log = _request_log[key]
            while log and now - log[0] > RATE_LIMIT_WINDOW_S:
                log.popleft()
            if len(log) >= RATE_LIMIT_MAX_REQUESTS:
                return JSONResponse(
                    {"detail": "Rate limit exceeded, slow down and try again shortly."},
                    status_code=429,
                )
            log.append(now)
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async def poller():
        while True:
            await asyncio.to_thread(news.poll)
            await asyncio.sleep(POLL_INTERVAL_S)

    task = asyncio.create_task(poller())
    yield
    task.cancel()


app = FastAPI(title="ARGUS", version="0.2.0", lifespan=lifespan,
              description="Live intelligence war-room for India's crude oil supply chain")

app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("ALLOWED_ORIGIN", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assets.router, prefix="/api/assets", tags=["assets"])
app.include_router(risk.router, prefix="/api/risk", tags=["risk"])
app.include_router(intel.router, prefix="/api/intel", tags=["intel"])
app.include_router(scenario.router, prefix="/api/scenario", tags=["scenario"])
app.include_router(assumptions.router, prefix="/api/assumptions", tags=["assumptions"])


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "argus"}
