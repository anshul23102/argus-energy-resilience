"""Generates docs/deliverables/ARGUS_Detailed_Document.pdf — the ET AI Hackathon
2.0 detailed submission document. Run: python3 generate_pdf.py
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    ListFlowable, ListItem, HRFlowable,
)

INK = colors.HexColor("#12213a")
ACCENT = colors.HexColor("#c9822f")
MUTED = colors.HexColor("#5b6b85")
LINE = colors.HexColor("#d7dce6")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle("TitleBig", parent=styles["Title"], fontSize=28, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle("Subtitle", parent=styles["Normal"], fontSize=13, textColor=MUTED, spaceAfter=24))
styles.add(ParagraphStyle("H1", parent=styles["Heading1"], fontSize=17, textColor=INK, spaceBefore=22, spaceAfter=10, borderColor=ACCENT))
styles.add(ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, textColor=INK, spaceBefore=14, spaceAfter=6))
styles.add(ParagraphStyle("Body", parent=styles["Normal"], fontSize=10.2, leading=15, textColor=colors.HexColor("#1c2636"), spaceAfter=8))
styles.add(ParagraphStyle("Small", parent=styles["Normal"], fontSize=9, leading=13, textColor=MUTED, spaceAfter=6))
styles.add(ParagraphStyle("Bull", parent=styles["Normal"], fontSize=10.2, leading=14.5, textColor=colors.HexColor("#1c2636")))
styles.add(ParagraphStyle("Cell", parent=styles["Normal"], fontSize=8.5, leading=11.5, textColor=colors.HexColor("#1c2636")))
styles.add(ParagraphStyle("CellHead", parent=styles["Cell"], textColor=colors.white, fontName="Helvetica-Bold"))
styles.add(ParagraphStyle("CellMono", parent=styles["Cell"], fontName="Courier", fontSize=7.6, leading=10.5, wordWrap="CJK"))

story = []

def h1(t): story.append(Paragraph(t, styles["H1"])); story.append(HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=8))
def h2(t): story.append(Paragraph(t, styles["H2"]))
def p(t): story.append(Paragraph(t, styles["Body"]))
def small(t): story.append(Paragraph(t, styles["Small"]))
def bullets(items):
    story.append(ListFlowable([ListItem(Paragraph(i, styles["Bull"]), spaceAfter=4) for i in items],
                               bulletType="bullet", start="•", leftIndent=14))
    story.append(Spacer(1, 8))

def table(header, rows, widths, mono_col=None):
    """widths must sum to <= 16.8cm (A4 minus 2cm margins each side).
    mono_col: index of a column to render in a small monospace font that can
    break mid-token (file paths etc.) — everything else wraps on word breaks."""
    def cell(text, is_header, col_idx):
        style = styles["CellHead"] if is_header else (
            styles["CellMono"] if col_idx == mono_col else styles["Cell"]
        )
        return Paragraph(text, style)

    data = [[cell(c, True, i) for i, c in enumerate(header)]]
    for row in rows:
        data.append([cell(c, False, i) for i, c in enumerate(row)])

    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f7fa")]),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

# ---------------------------------------------------------------- COVER ----
story.append(Spacer(1, 3 * cm))
story.append(Paragraph("ARGUS", styles["TitleBig"]))
story.append(Paragraph("AI-Driven Energy Supply Chain Resilience for India", styles["Subtitle"]))
story.append(Spacer(1, 0.6 * cm))
p("<b>ET AI Hackathon 2.0 — Problem Statement 2</b><br/>"
  "AI-Driven Energy Supply Chain Resilience for Import-Dependent Economies")
story.append(Spacer(1, 0.4 * cm))
small("GitHub: github.com/anshul23102/argus-energy-resilience")
story.append(Spacer(1, 1.5 * cm))
p("<b>What this document is:</b> a complete technical account of ARGUS — the problem it "
  "answers, the architecture, every engine and how it works, the technology stack, the data "
  "and assumptions behind every number, and how the system maps onto each item in the "
  "problem statement's evaluation focus and judging criteria.")
story.append(PageBreak())

# ---------------------------------------------------------------- SUMMARY ----
h1("1. Executive Summary")
p("India sources roughly 88% of its crude oil from imports, with 40–45% of that volume "
  "transiting the Strait of Hormuz — a single chokepoint. India's Strategic Petroleum "
  "Reserves cover only about 9.5 days of national consumption. Traditional supply-chain "
  "planning tools cannot model geopolitical scenario impacts in real time, evaluate "
  "alternative procurement corridors dynamically, or orchestrate a coordinated response "
  "across refiners, logistics, and reserves.")
p("<b>ARGUS is that missing intelligence layer.</b> It continuously monitors geopolitical and "
  "logistics risk from live news, models the cascading impact of specific disruption "
  "scenarios, and generates an executable procurement response — turning a reactive crisis "
  "into a managed, anticipated one.")
h2("Design philosophy: neuro-symbolic, not agent-does-everything")
p("ARGUS deliberately keeps LLMs at the perception edges only — reading headlines, extracting "
  "structured signals, and writing the final briefing. Every risk score, every dollar, every "
  "barrel is computed by deterministic, auditable math: Bayesian updating, Monte Carlo "
  "simulation, and linear programming. The LLM never does the math. This is a conscious "
  "positioning against \"wrap an LLM around everything\" — the parts of a crisis response "
  "that must be trustworthy are computed, not generated.")

# ---------------------------------------------------------------- ARCHITECTURE ----
h1("2. System Architecture")
p("ARGUS is a FastAPI (Python) backend and a Next.js 16 / React 19 / TypeScript frontend, "
  "with a shared, versioned assumptions file as the single source of truth for every "
  "parameter. The pipeline for a single response, end to end:")
bullets([
    "<b>Watchtower</b> — the risk engine reads live evidence and produces a threat assessment (corridor and/or supplier).",
    "<b>Simulator</b> — the scenario engine runs a 1,000-path Monte Carlo simulation of the disruption's cascade.",
    "<b>Trader</b> — the procurement engine solves a linear program for the cheapest feasible replacement barrel mix.",
    "<b>Reservist</b> — the SPR engine schedules a strategic-reserve bridge and its post-crisis replenishment.",
    "<b>Briefer</b> — an LLM (with a deterministic template fallback) turns the structured output into a one-page briefing.",
])
p("The full pipeline — from a scenario request to a complete, LLM-authored situation "
  "briefing — runs in under one second on a laptop, with every stage's wall-clock time "
  "reported in the response.")

h2("Data flow")
table(
    ["Layer", "What it does", "Key files"],
    [
        ["Perception", "GDELT + Google News RSS polling, LLM/rule-based headline extraction (corridor + supplier + severity)", "news.py<br/>extractor.py"],
        ["Risk", "Bayesian corridor and supplier disruption scoring from decayed, corroborated evidence", "risk.py"],
        ["Scenario", "Monte Carlo cascade simulation: chokepoint closure or OPEC+ production cut", "scenario.py"],
        ["Procurement", "Linear program for cheapest feasible replacement barrels, tanker/port-constrained", "procurement.py"],
        ["Reserves", "SPR drawdown scheduling and post-crisis replenishment window", "spr.py"],
        ["Orchestration", "Ties every stage together, times each stage, drafts the briefing", "orchestrator.py"],
        ["Knowledge graph", "Supplier-route-chokepoint-refinery relationships", "graph.py"],
        ["Frontend", "War Room 3D globe, Corridor/Supplier Risk, Intelligence feed, Scenario Console, Network, Global, Assumptions, Sources", "app/(app)/*"],
    ],
    widths=[2.6 * cm, 9.6 * cm, 4.4 * cm],
    mono_col=2,
)

# ---------------------------------------------------------------- MODULES ----
h1("3. Core Modules")

h2("3.1 Geopolitical Risk Intelligence")
p("A live-updating Bayesian engine scores disruption probability by <b>corridor</b> (7 "
  "chokepoints: Hormuz, Bab el-Mandeb, Suez, Malacca, Danish Straits, Turkish Straits, Cape "
  "of Good Hope) and independently by <b>supplier</b> (all 8 of India's crude sources). "
  "Every 15 minutes, ~500 headlines from GDELT and Google News are classified by an LLM "
  "(Gemini → Groq → deterministic rule-based fallback chain) into corridor, supplier, and "
  "severity ('rhetoric' through 'full closure'). Same-incident coverage is clustered so "
  "volume doesn't inflate the score. Each event decays the posterior probability with a "
  "14-day evidence half-life, calibrated and validated against real historical episodes.")

h2("3.2 Disruption Scenario Modeller")
p("Two shock types share one Monte Carlo engine (1,000 simulated paths, 90-day horizon):")
bullets([
    "<b>Chokepoint closure</b> — a named strait closes at a chosen severity and duration; models bypass-pipeline recovery, refinery run-rate cuts, retail price pass-through, GDP and CAD impact.",
    "<b>OPEC+ emergency production cut</b> — a production-side shock across all 7 OPEC+-associated suppliers, no shipping route involved; the LP is barred from sourcing relief from any cutting supplier.",
    "<b>Power sector stress</b> (new) — models the indirect strain of a crude shock on India's grid: diesel backup-generator capacity squeezed by refinery run cuts, and gas-fired generation curtailed by cost stress. Explicitly not a direct oil-to-electricity effect, since India's grid is barely oil-fired (~0.2%).",
])
p("Every scenario reports both a <b>managed</b> and an <b>unmanaged</b> trajectory side by "
  "side, so the value of ARGUS's own response is a measured number, not a claim.")

h2("3.3 Adaptive Procurement Orchestrator")
p("A linear program (PuLP/CBC) finds the cheapest feasible replacement-barrel mix across "
  "every open (supplier, grade, route) combination, subject to real constraints:")
bullets([
    "Supplier spare capacity (mb/d each supplier could realistically add within weeks)",
    "Refinery sour/sweet grade compatibility (India's slate is majority sour-configured)",
    "Closed chokepoints excluded entirely from candidate routes",
    "<b>Tanker availability</b> (new) — a per-route ceiling from voyage round-trip time and an available-tanker-fleet assumption, forcing route diversification instead of dumping all volume on one lane",
    "<b>Port congestion</b> (new) — an aggregate India-wide discharge-capacity ceiling using previously unused vlcc_capacity_mbbl / port_max_vlcc_per_day assumptions",
])
p("Output is an executable order sheet: supplier, grade, route, volume, ETA, landed cost per "
  "barrel, and premium versus baseline.")

h2("3.4 Strategic Reserve Optimisation")
p("Models optimal SPR drawdown against the supply gap (ISPRL Phase I, 5.33 MMT), and — new "
  "this round — the <b>replenishment window</b>: once relief cargoes arrive and a cooldown "
  "period passes, dedicated refill purchasing begins at a realistic injection rate until the "
  "reserve is back to full, with an exact day-count estimate.")

h2("3.5 Supply Chain Digital Twin")
p("A live 3D globe (React Three Fiber) renders 22 refineries, ports, SPR sites, 8 supplier "
  "export terminals, and 10 shipping routes with risk-colored markers, plus a flat-map "
  "toggle. A NetworkX knowledge graph underlies supplier→route→chokepoint→refinery "
  "relationships, exportable to Neo4j.")

# ---------------------------------------------------------------- STACK ----
h1("4. Technology Stack")
table(
    ["Layer", "Technology"],
    [
        ["Backend", "Python, FastAPI, NumPy, PuLP (CBC solver), NetworkX"],
        ["LLM chain", "Gemini → Groq → deterministic rule-based fallback (never a single point of failure)"],
        ["Live data", "GDELT + Google News RSS (news), yfinance (Brent/WTI/USDINR)"],
        ["Frontend", "Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS"],
        ["3D visualization", "React Three Fiber / Three.js, custom globe↔flat-map morph shader"],
        ["Testing", "pytest — 37 backend regression tests across risk, scenario, procurement, SPR, extractor"],
    ],
    widths=[3.4 * cm, 13.2 * cm],
)

# ---------------------------------------------------------------- DATA ----
h1("5. Data, Assumptions &amp; Transparency")
p("Every numeric parameter ARGUS computes with — hazard priors, elasticities, capacity "
  "figures, response-speed assumptions — lives in a single versioned <font face='Courier'>"
  "assumptions.yaml</font>, each entry tagged with a source and a confidence level "
  "(high / medium / low / calibrated). Low-confidence values are not hidden — they are "
  "the explicit, testable, editable assumptions the evaluation focus asks for. The "
  "Assumptions page lets a judge change any parameter and re-run a scenario live to see "
  "the cascade move.")
h2("Confidence legend")
bullets([
    "<b>high</b> — published hard data (e.g. VLCC capacity, retail pass-through arithmetic)",
    "<b>medium</b> — published estimate ranges (e.g. commercial stock days, refinery product slate)",
    "<b>low</b> — order-of-magnitude expert judgment, flagged in the UI (e.g. tanker fleet availability, power-sector transmission)",
    "<b>calibrated</b> — fitted and validated against real historical episodes (e.g. evidence half-life, severity likelihood ratios)",
])

h1("6. Backtesting &amp; Validation")
p("ARGUS replays 5 real historical disruption episodes — including the 2019 Abqaiq attack, "
  "the 2021 Ever Given Suez blockage, and 2023–24 Red Sea/Houthi escalation — through the "
  "exact same risk engine used live, with no lookahead: each event is only visible to the "
  "engine after its real-world timestamp. The engine's lead time and peak-risk accuracy are "
  "measured against what actually happened, and the core parameters (evidence half-life, "
  "severity likelihood ratios) were calibrated on one episode and validated out-of-sample "
  "on the others.")

# ---------------------------------------------------------------- EVAL MAPPING ----
h1("7. Mapping to the Problem Statement")
h2("7.1 Evaluation Focus")
table(
    ["Evaluation Focus item", "How ARGUS addresses it"],
    [
        ["Disruption signal detection lead time and accuracy", "Backtested against 5 real historical episodes with no-lookahead replay; lead time reported per episode"],
        ["Quality and executability of procurement alternatives", "LP-generated order sheet: exact supplier, grade, route, volume, ETA, cost — not a suggestion"],
        ["Scenario model fidelity, explicit and testable assumptions", "Every parameter sourced, confidence-tagged, and live-editable on the Assumptions page"],
        ["Geospatial evidence depth", "22 refineries, ports, SPR sites, 8 suppliers, 10 routes on an interactive 3D globe with live risk coloring"],
        ["End-to-end response time from signal to recommendation", "Full pipeline (risk → scenario → procurement → SPR → briefing) instrumented and reported; consistently under 1 second"],
    ],
    widths=[6.2 * cm, 10.4 * cm],
)
h2("7.2 What You May Build — coverage")
table(
    ["Suggested capability", "Status"],
    [
        ["Geopolitical Risk Intelligence Agent", "Built — live, corridor + supplier, continuous 15-min polling"],
        ["Disruption Scenario Modeller", "Built — chokepoint closure, OPEC+ cut, refinery/price/GDP/CAD/power-sector cascades"],
        ["Adaptive Procurement Orchestrator", "Built — LP with grade, spare-capacity, tanker, and port-congestion constraints"],
        ["Strategic Reserve Optimisation Agent", "Built — drawdown scheduling and replenishment window estimation"],
        ["Supply Chain Digital Twin", "Built — live 3D globe, knowledge graph, what-if scenario console"],
    ],
    widths=[6.2 * cm, 10.4 * cm],
)

h1("8. Repository")
p("<font face='Courier'>github.com/anshul23102/argus-energy-resilience</font>")
p("The repository includes the full backend and frontend source, the versioned assumptions "
  "file, 37 backend regression tests, and design/implementation documentation for every "
  "development phase under <font face='Courier'>docs/superpowers/</font>.")

doc = SimpleDocTemplate(
    "/Users/aj.ts1758/Downloads/argus-energy-resilience/docs/deliverables/ARGUS_Detailed_Document.pdf",
    pagesize=A4, topMargin=2.2 * cm, bottomMargin=2 * cm, leftMargin=2 * cm, rightMargin=2 * cm,
    title="ARGUS — Detailed Document", author="ARGUS Team",
)
doc.build(story)
print("done")
