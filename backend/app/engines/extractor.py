"""Event extractor: turns raw headlines into structured risk events.

Free-tier-aware design (Gemini free: ~1,500 req/day; Groq free: ~1,000 req/day):
  - BATCHED: one LLM call per polling cycle (~25 headlines), not one per headline.
    At 15-min polls that's <100 calls/day — comfortable inside either free tier.
  - CHAINED: gemini -> groq -> anthropic -> rules. A 429 or outage on one provider
    silently falls through to the next; the deterministic rules layer means the
    pipeline NEVER stops, even with zero API keys.

The LLM's ONLY job is perception: headline -> {corridor, severity, summary}.
All scoring math stays in the risk engine (see engines/risk.py docstring).
"""
from __future__ import annotations

import json
import os
import re

import httpx

CORRIDORS = ["hormuz", "bab-el-mandeb", "suez", "malacca", "danish-straits"]
SEVERITIES = ["rhetoric", "incident", "attack", "partial_closure", "full_closure"]

_BATCH_PROMPT = """You classify news headlines about energy shipping security.
For EACH numbered headline, output one object. Return ONLY a JSON array, same order,
same length as the input list: [{{"corridor": one of {corridors} or "none",
"severity": one of {severities} or "none", "summary": "<=140 chars factual summary"}}, ...]
severity guide: rhetoric=threats/warnings/drills; incident=jamming/near-miss/harassment;
attack=strike/seizure/boarding/mine; partial_closure=traffic restricted or major operators
suspending transit; full_closure=corridor shut. Not about energy shipping security => corridor "none".
HEADLINES:
{texts}"""

# --- rule fallback ----------------------------------------------------------
_CORRIDOR_PATTERNS = {
    "hormuz": r"hormuz|persian gulf|gulf of oman|iran.{0,30}(tanker|strait|navy)|fujairah",
    "bab-el-mandeb": r"bab.el.mandeb|red sea|houthi|yemen|gulf of aden",
    "suez": r"suez|sumed",
    "malacca": r"malacca|singapore strait",
    "danish-straits": r"danish strait|baltic.{0,20}(tanker|oil)|primorsk",
}
_SEVERITY_PATTERNS = [
    ("full_closure", r"clos(ed|ure) to (all )?(shipping|traffic)|blockade in effect"),
    ("partial_closure", r"suspend\w{0,3}\b.{0,25}(transit|shipping|passage|crossing)|reroute|divert(s|ing|ed)? (around|away)|halts?\b.{0,20}(red sea|hormuz|suez)"),
    ("attack", r"attack|missile|drone str|struck|seiz(e|ed|ure)|boarded|mine (hit|blast)|explosion|hijack"),
    ("incident", r"jamming|near.miss|harass|intercept|close encounter|fired warning|collision"),
    ("rhetoric", r"threat(en)?s?|warn(s|ing)?|vows|drill|exercise|escalat"),
]


def _extract_rules(text: str) -> dict | None:
    t = text.lower()
    corridor = next((c for c, p in _CORRIDOR_PATTERNS.items() if re.search(p, t)), None)
    if corridor is None:
        return None
    severity = next((s for s, p in _SEVERITY_PATTERNS if re.search(p, t)), None)
    if severity is None:
        return None
    return {"corridor": corridor, "severity": severity,
            "summary": text[:140], "extractor": "rules"}


# --- LLM providers (each raises on failure; the chain catches) ---------------
def _call_gemini(prompt: str, json_mode: bool = True) -> str:
    key = os.environ["GEMINI_API_KEY"]
    # "-latest" alias: named generations (2.0/2.5-flash) get closed to new accounts
    # as they age; the alias always resolves to the current free-tier flash model.
    model = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
    cfg: dict = {"temperature": 0.0}
    if json_mode:
        cfg["responseMimeType"] = "application/json"
    r = httpx.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        params={"key": key},
        json={"contents": [{"parts": [{"text": prompt}]}], "generationConfig": cfg},
        timeout=45,
    )
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"]


def _call_groq(prompt: str, json_mode: bool = True) -> str:
    key = os.environ["GROQ_API_KEY"]
    model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
    body = {"model": model, "temperature": 0.0,
            "messages": [{"role": "user", "content": prompt}]}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    r = httpx.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}"}, json=body, timeout=45,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _call_anthropic(prompt: str, json_mode: bool = True) -> str:
    import anthropic

    client = anthropic.Anthropic()
    msg = client.messages.create(model="claude-sonnet-5", max_tokens=2000,
                                 messages=[{"role": "user", "content": prompt}])
    return msg.content[0].text


_CHAIN = [("gemini", "GEMINI_API_KEY", _call_gemini),
          ("groq", "GROQ_API_KEY", _call_groq),
          ("anthropic", "ANTHROPIC_API_KEY", _call_anthropic)]


def provider() -> str:
    """First provider with a key configured, else 'rules'."""
    for name, env, _ in _CHAIN:
        if os.environ.get(env):
            return name
    return "rules"


def llm_complete(prompt: str, json_mode: bool = True) -> tuple[str, str] | None:
    """Try each configured provider in order. Returns (text, provider) or None.
    A 429 / outage on one provider falls through to the next — free-tier resilience.
    json_mode=False for prose outputs (briefings); True for structured extraction."""
    for name, env, fn in _CHAIN:
        if not os.environ.get(env):
            continue
        try:
            return fn(prompt, json_mode=json_mode), name
        except Exception:
            continue
    return None


def _parse_array(raw: str, n: int) -> list[dict | None] | None:
    m = re.search(r"\[.*\]", raw, re.DOTALL)
    try:
        arr = json.loads(m.group(0) if m else raw)
    except Exception:
        return None
    if not isinstance(arr, list) or len(arr) != n:
        return None
    out: list[dict | None] = []
    for item in arr:
        if (not isinstance(item, dict)
                or item.get("corridor") not in CORRIDORS
                or item.get("severity") not in SEVERITIES):
            out.append(None)
        else:
            out.append({"corridor": item["corridor"], "severity": item["severity"],
                        "summary": str(item.get("summary", ""))[:140]})
    return out


def extract_batch(texts: list[str]) -> list[dict | None]:
    """Classify a whole polling cycle in ONE LLM call. Same order as input;
    None = irrelevant headline. Falls back to rules per headline."""
    if not texts:
        return []
    numbered = "\n".join(f"{i + 1}. {t[:300]}" for i, t in enumerate(texts))
    prompt = _BATCH_PROMPT.format(corridors=CORRIDORS, severities=SEVERITIES, texts=numbered)
    got = llm_complete(prompt)
    if got is not None:
        raw, prov = got
        parsed = _parse_array(raw, len(texts))
        if parsed is not None:
            return [({**p, "extractor": prov} if p else None) for p in parsed]
    return [_extract_rules(t) for t in texts]


def extract(text: str) -> dict | None:
    """Single-text convenience wrapper (manual injection, tests)."""
    return extract_batch([text])[0]
