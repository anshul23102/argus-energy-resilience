"""ARGUS backend — AI Energy Supply Chain Resilience Platform.

ET AI Hackathon 2.0, Problem Statement 2.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import assets, risk

app = FastAPI(title="ARGUS", version="0.1.0",
              description="Live intelligence war-room for India's crude oil supply chain")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assets.router, prefix="/api/assets", tags=["assets"])
app.include_router(risk.router, prefix="/api/risk", tags=["risk"])


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "argus"}
