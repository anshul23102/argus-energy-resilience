const DATASETS = [
  {
    name: "Refineries",
    file: "data/refineries.json",
    sources: [
      "PPAC (Petroleum Planning and Analysis Cell), Refining Capacity in India, FY2024 to 25",
      "Company annual reports: IOCL, BPCL, HPCL, RIL, Nayara, MRPL, CPCL, HMEL, NRL",
    ],
  },
  {
    name: "Ports and strategic reserves",
    file: "data/ports_spr.json",
    sources: [
      "Indian Ports Association and port authority public data",
      "ISPRL, Indian Strategic Petroleum Reserves Limited, Phase I sites",
      "PPAC import infrastructure notes",
    ],
  },
  {
    name: "Suppliers and crude grades",
    file: "data/suppliers_grades.json",
    sources: [
      "PPAC import statistics, FY2024 to 25, country shares approximate",
      "Published crude assays from operator and marketer assay sheets",
      "Vortexa and Kpler press summaries for supplier share trends",
      "Terminal to grade pairings from public export flow reporting",
    ],
  },
  {
    name: "Shipping routes and chokepoints",
    file: "data/routes_chokepoints.json",
    sources: [
      "EIA World Oil Transit Chokepoints report",
      "Standard sea route distance tables",
    ],
  },
];

const LIVE_FEEDS = [
  { name: "Crude and currency prices", source: "Yahoo Finance futures data, five minute cache" },
  { name: "News signal", source: "GDELT 2.0 Doc API and Google News RSS, polled roughly every 15 minutes" },
  { name: "Event extraction", source: "Gemini or Groq language model when a key is configured, deterministic keyword rules otherwise" },
];

const CONFIDENCE_LEVELS = [
  { tier: "High", detail: "Published hard data: PPAC capacity figures, ISPRL reserve volumes, EIA chokepoint flow." },
  { tier: "Medium", detail: "Published estimate ranges: elasticities, freight premiums, RBI macro sensitivities." },
  { tier: "Low", detail: "Order of magnitude expert judgment, explicitly flagged. This is the point, not a weakness: every low confidence value is visible and editable on the Assumptions page." },
  { tier: "Design choice", detail: "Tunable model knobs with no single correct answer, such as Monte Carlo run count or evidence half life." },
];

export default function SourcesPage() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <p className="text-[13px] leading-relaxed text-ink-2">
        ARGUS is built on a hybrid of curated public infrastructure data and live market and news
        feeds. Nothing in the model is invented. Every figure below traces to a named public
        source, and every assumption carries a confidence tag that is visible and editable on the{" "}
        <a href="/assumptions" className="text-accent hover:underline">Assumptions page</a>.
      </p>

      <section className="mt-8">
        <h2 className="text-[15px] font-semibold text-ink">Curated infrastructure datasets</h2>
        <div className="mt-3 space-y-3">
          {DATASETS.map((ds) => (
            <div key={ds.file} className="card p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[13px] font-medium text-ink">{ds.name}</h3>
                <span className="figure text-[11px] text-ink-3">{ds.file}</span>
              </div>
              <ul className="mt-2 space-y-1">
                {ds.sources.map((s) => (
                  <li key={s} className="text-[12px] leading-relaxed text-ink-2">- {s}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-semibold text-ink">Live feeds</h2>
        <div className="mt-3 space-y-2">
          {LIVE_FEEDS.map((f) => (
            <div key={f.name} className="card flex items-center justify-between p-4">
              <span className="text-[13px] text-ink">{f.name}</span>
              <span className="text-[12px] text-ink-2">{f.source}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-semibold text-ink">Confidence tiers</h2>
        <p className="caption mt-1">Every assumption in the model is tagged with one of these four levels.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CONFIDENCE_LEVELS.map((c) => (
            <div key={c.tier} className="card p-4">
              <p className="text-[13px] font-semibold text-ink">{c.tier}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-2">{c.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-semibold text-ink">What is simplified today</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          Corridor flow splits assume even distribution across a supplier's available routes until
          AIS vessel data can refine them. Freight cost is approximated rather than pulled from a
          live Worldscale feed. Retail price impact assumes full pass through, while India has
          historically buffered consumers through excise adjustments. Each simplification lives as
          a named, editable parameter rather than a hidden constant.
        </p>
      </section>
    </div>
  );
}
