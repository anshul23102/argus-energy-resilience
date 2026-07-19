"""Event extractor: turns raw headlines into structured risk events.

Provider-agnostic LLM layer:
  1. GEMINI_API_KEY set  -> Google Gemini (free tier, aistudio.google.com)
  2. GROQ_API_KEY set    -> Groq (free tier, console.groq.com, Llama models)
  3. ANTHROPIC_API_KEY   -> Claude (if the team ever gets credits)
  4. none                -> deterministic keyword rules (system stays fully functional)

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

_PROMPT = """You classify a news headline/snippet about energy shipping security.
Return ONLY JSON: {{"corridor": one of {corridors} or "none",
"severity": one of {severities} or "none", "summary": "<=140 chars factual summary"}}.
severity guide: rhetoric=threats/warnings/drills; incident=jamming/near-miss/harassment;
attack=strike/seizure/boarding/mine; partial_closure=traffic restricted or major operators
suspending transit; full_closure=corridor shut. If not about energy shipping security, corridor=none.
TEXT: {text}"""

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
    ("partial_closure", r"suspend(s|ed|ing)? (transit|shipping|passage)|reroute|divert(s|ing|ed)? (around|away)|halts? (red sea|hormuz|suez)"),
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


# --- LLM providers ----------------------------------------------------------
def _call_gemini(prompt: str) -> str:
    key = os.environ["GEMINI_API_KEY"]
    r = httpx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        params={"key": key},
        json={"contents": [{"parts": [{"text": prompt}]}],
              "generationConfig": {"temperature": 0.0, "responseMimeType": "application/json"}},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"]


def _call_groq(prompt: str) -> str:
    key = os.environ["GROQ_API_KEY"]
    r = httpx.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}"},
        json={"model": "llama-3.3-70b-versatile", "temperature": 0.0,
              "response_format": {"type": "json_object"},
              "messages": [{"role": "user", "content": prompt}]},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _call_anthropic(prompt: str) -> str:
    import anthropic

    client = anthropic.Anthropic()
    msg = client.messages.create(model="claude-sonnet-5", max_tokens=200,
                                 messages=[{"role": "user", "content": prompt}])
    return msg.content[0].text


def provider() -> str:
    if os.environ.get("GEMINI_API_KEY"):
        return "gemini"
    if os.environ.get("GROQ_API_KEY"):
        return "groq"
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    return "rules"


def extract(text: str) -> dict | None:
    """Extract a structured event, or None if text is irrelevant."""
    prov = provider()
    if prov == "rules":
        return _extract_rules(text)
    prompt = _PROMPT.format(corridors=CORRIDORS, severities=SEVERITIES, text=text[:800])
    try:
        raw = {"gemini": _call_gemini, "groq": _call_groq, "anthropic": _call_anthropic}[prov](prompt)
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        parsed = json.loads(m.group(0) if m else raw)
        if parsed.get("corridor") in (None, "none") or parsed.get("severity") in (None, "none"):
            return None
        if parsed["corridor"] not in CORRIDORS or parsed["severity"] not in SEVERITIES:
            return None
        return {**parsed, "extractor": prov}
    except Exception:
        return _extract_rules(text)  # never lose an event to an API hiccup
