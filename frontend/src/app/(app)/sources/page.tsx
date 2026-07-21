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
      "Turkish Straits (Bosphorus/Dardanelles) added as a 7th chokepoint at 3.7 mb/d, EIA H1 2025 figure, linked to the Novorossiysk to Suez route it physically transits before Suez",
    ],
  },
];

const LIVE_FEEDS = [
  { name: "Crude and currency prices", source: "Yahoo Finance futures data, five minute cache" },
  { name: "News signal", source: "GDELT 2.0 Doc API and Google News RSS, polled roughly every 15 minutes" },
  { name: "Event extraction", source: "Gemini or Groq language model when a key is configured, deterministic keyword rules otherwise" },
];

const REAL_WORLD_VALIDATION = [
  {
    name: "Carriers actively manage Hormuz risk today",
    detail: "Maersk publishes a standing operational advisory titled \"Maersk Operations through Strait of Hormuz\", confirming this corridor is a live operational concern for a top-3 global carrier, not a hypothetical modeled for this project.",
    link: "https://www.maersk.com/local-information/imea/india/routes",
  },
  {
    name: "India's energy sector is a named FDI reform priority",
    detail: "The Asia Society Policy Institute's Indo-Pacific supply chain tracker records India's 2021 inbound FDI at $44.7B (versus $44.5B five years earlier) and a 2020 World Bank ease-of-doing-business rank of 63/190, with energy explicitly named among the sectors targeted for onshoring reform, macro context for why corridor resilience matters strategically, not an engine input.",
    link: "https://asiasociety.org/policy-institute/supply-chains-shifting-indo-pacific/india",
  },
];

const CONFIDENCE_LEVELS = [
  { tier: "High", detail: "Published hard data: PPAC capacity figures, ISPRL reserve volumes, EIA chokepoint flow." },
  { tier: "Medium", detail: "Published estimate ranges: elasticities, freight premiums, RBI macro sensitivities." },
  { tier: "Low", detail: "Order of magnitude expert judgment, explicitly flagged. This is the point, not a weakness: every low confidence value is visible and editable on the Assumptions page." },
  { tier: "Design choice", detail: "Tunable model knobs with no single correct answer, such as Monte Carlo run count or evidence half life." },
];

export default function SourcesPage() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <p className="max-w-2xl text-[15px] leading-relaxed text-ink-2">
        ARGUS is built on a hybrid of curated public infrastructure data and live market and news
        feeds. Nothing in the model is invented. Every figure below traces to a named public
        source, and every assumption carries a confidence tag that is visible and editable on the{" "}
        <a href="/assumptions" className="text-accent hover:underline">Assumptions page</a>.
      </p>

      <section className="mt-10">
        <h2 className="section-title">Curated infrastructure datasets</h2>
        <div className="mt-3">
          {DATASETS.map((ds, i) => (
            <div key={ds.file} className={`py-4 ${i > 0 ? "hairline-section" : ""}`}>
              <div className="flex items-baseline justify-between">
                <h3 className="text-[14px] font-medium text-ink">{ds.name}</h3>
                <span className="figure text-[12px] text-ink-3">{ds.file}</span>
              </div>
              <ul className="mt-1.5">
                {ds.sources.map((s) => (
                  <li key={s} className="text-[13px] leading-relaxed text-ink-2">{s}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="section-title">Live feeds</h2>
        <div className="mt-3">
          {LIVE_FEEDS.map((f, i) => (
            <div key={f.name} className={`flex items-center justify-between py-3 ${i > 0 ? "hairline-section" : ""}`}>
              <span className="text-[14px] text-ink">{f.name}</span>
              <span className="text-[13px] text-ink-2">{f.source}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="section-title">Confidence tiers</h2>
        <p className="caption mt-1">Every assumption in the model is tagged with one of these four levels.</p>
        <div className="mt-3">
          {CONFIDENCE_LEVELS.map((c, i) => (
            <div key={c.tier} className={`py-3 ${i > 0 ? "hairline-section" : ""}`}>
              <p className="text-[14px] font-semibold text-ink">{c.tier}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{c.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="section-title">Live operational validation</h2>
        <p className="caption mt-1">
          External, independent confirmation that this corridor matters in the real world today.
        </p>
        <div className="mt-3">
          {REAL_WORLD_VALIDATION.map((v, i) => (
            <div key={v.name} className={`py-3 ${i > 0 ? "hairline-section" : ""}`}>
              <a href={v.link} target="_blank" rel="noopener noreferrer" className="text-[14px] font-semibold text-accent hover:underline">
                {v.name}
              </a>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{v.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="section-title">What is simplified today</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
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
