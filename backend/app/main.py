"""ARGUS backend — AI Energy Supply Chain Resilience Platform.

ET AI Hackathon 2.0, Problem Statement 2.
"""
import asyncio
from contextlib import asynccontextmanager

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).resolve().parents[1] / ".env")  # keys stay local, never committed

from .engines import news
from .routers import assets, intel, risk, scenario

POLL_INTERVAL_S = 900  # GDELT refreshes every 15 min


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assets.router, prefix="/api/assets", tags=["assets"])
app.include_router(risk.router, prefix="/api/risk", tags=["risk"])
app.include_router(intel.router, prefix="/api/intel", tags=["intel"])
app.include_router(scenario.router, prefix="/api/scenario", tags=["scenario"])


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "argus"}
