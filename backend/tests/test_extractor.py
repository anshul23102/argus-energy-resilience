"""Tests for the rule-based fallback extractor (app/engines/extractor.py).
The LLM path isn't tested here — it needs network/API keys — but the rule
fallback is pure and deterministic, and it's what runs with zero API keys
configured, which is the common case for judges/reviewers running this locally.
"""
from app.engines.extractor import _extract_rules


def test_corridor_only_headline():
    ev = _extract_rules("Houthi rebels attack oil tanker in the Red Sea")
    assert ev is not None
    assert ev["corridor"] == "bab-el-mandeb"
    assert ev["supplier"] is None
    assert ev["severity"] == "attack"


def test_supplier_only_headline():
    ev = _extract_rules("US imposes new sanctions on Rosneft oil exports")
    assert ev is not None
    assert ev["corridor"] is None
    assert ev["supplier"] == "russia"
    assert ev["severity"] == "rhetoric"


def test_headline_matching_neither_axis_is_irrelevant():
    assert _extract_rules("Local council approves new bike lane funding") is None


def test_severity_required_even_with_a_matched_axis():
    """A headline that names a supplier country but carries no severity signal
    at all should still be dropped — matching an axis alone isn't enough."""
    assert _extract_rules("Saudi Arabia announces new tourism campaign") is None
