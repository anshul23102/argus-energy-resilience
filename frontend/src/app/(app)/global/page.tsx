"use client";

import { useNetworkData } from "@/lib/useNetworkData";

const RANKINGS = [
  { metric: "Population", rank: 1, data: "1.46 billion people (+38% since 2000)" },
  { metric: "GDP (PPP, current prices)", rank: 3, data: "$17.71 trillion, 6-7% real growth" },
  { metric: "Annual energy consumption", rank: 3, data: "46 EJ, 7% of world total" },
  { metric: "Net energy importer", rank: 3, data: "37% of total energy supply" },
  { metric: "Annual electricity consumption", rank: 3, data: "1,987 TWh (+254% since 2000)" },
  { metric: "Annual GHG emissions", rank: 3, data: "3.81 GtCO2e, 7.5% of world total" },
  { metric: "Renewables share of electricity", rank: 89, data: "22% of generation (+62% since 2000)" },
];

const RESOURCE_RANKINGS = [
  { resource: "Coal", metric: "consumption", rank: 2 },
  { resource: "Oil", metric: "consumption", rank: 3 },
  { resource: "Natural gas", metric: "consumption", rank: 12 },
  { resource: "Solar", metric: "electricity generation", rank: 3 },
  { resource: "Wind", metric: "electricity generation", rank: 6 },
  { resource: "Hydro", metric: "electricity generation", rank: 6 },
  { resource: "Nuclear", metric: "electricity generation", rank: 9 },
];

const ENERGY_SUPPLY_MIX = [
  { label: "Coal", pct: 46, color: "#e85e4e" },
  { label: "Oil", pct: 25, color: "#ebb946" },
  { label: "Biomass", pct: 20, color: "#8a9cc4" },
  { label: "Other renewables", pct: 2, color: "#52d8a6" },
  { label: "Natural gas", pct: 5, color: "#c48bd8" },
  { label: "Nuclear", pct: 1, color: "#6ea8f5" },
  { label: "Hydropower", pct: 1, color: "#3ac0c0" },
];

const ELECTRICITY_MIX = [
  { label: "Coal", pct: 74, color: "#e85e4e" },
  { label: "Hydropower", pct: 7, color: "#3ac0c0" },
  { label: "Solar PV", pct: 6, color: "#ebb946" },
  { label: "Wind", pct: 5, color: "#52d8a6" },
  { label: "Natural gas", pct: 3, color: "#c48bd8" },
  { label: "Nuclear", pct: 2, color: "#6ea8f5" },
  { label: "Biomass", pct: 2, color: "#8a9cc4" },
  { label: "Oil", pct: 0.2, color: "#9caac4" },
];

const RESERVES = [
  { resource: "Coal reserves", value: "389.42 billion tonnes", leaders: "Odisha 25.5%, Jharkhand 23.6%, Chhattisgarh 21.2%" },
  { resource: "Crude oil reserves", value: "671.40 million tonnes", leaders: "Western Offshore ~32%, Assam 21.7%, Rajasthan 19.6%" },
  { resource: "Natural gas reserves", value: "1,094.19 billion cubic metres", leaders: "Western Offshore 31.3%, Eastern Offshore 24.1%, Assam 15.0%" },
  { resource: "Renewable potential", value: "2,109,655 MW", leaders: "Wind (@150m) 55.2%, Solar 35.5%, Large hydro 6.3%" },
];

const IMPORT_DEPENDENCY = [
  { resource: "Crude oil", pct: 89.0 },
  { resource: "Natural gas", pct: 46.6 },
  { resource: "Coal", pct: 25.86 },
];

function Donut({ data, size = 160 }: { data: { label: string; pct: number; color: string }[]; size?: number }) {
  const r = size / 2 - 14;
  const cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={16} />
      {data.map((d) => {
        const len = (d.pct / 100) * circumference;
        const dash = `${len} ${circumference - len}`;
        const el = (
          <circle
            key={d.label} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={16}
            strokeDasharray={dash} strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}

function MixChart({ title, data }: { title: string; data: { label: string; pct: number; color: string }[] }) {
  return (
    <div>
      <h3 className="section-label mb-3">{title}</h3>
      <div className="flex items-center gap-6">
        <Donut data={data} />
        <div className="flex-1">
          {data.slice().sort((a, b) => b.pct - a.pct).map((d) => (
            <div key={d.label} className="flex items-center justify-between py-1">
              <span className="flex items-center gap-2 text-[13px] text-ink-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
                {d.label}
              </span>
              <span className="figure text-[13px] text-ink-3">{d.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function GlobalContextPage() {
  const d = useNetworkData();
  const liveImportedPct = d.suppliers.length
    ? Math.round(d.suppliers.reduce((s, sup) => s + sup.share_pct, 0))
    : null;

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-10 lg:px-16">
      <p className="max-w-2xl text-[15px] leading-relaxed text-ink-2">
        Everything else in ARGUS is about India's own supply chain. This page zooms out: where
        India stands in the world's energy system, by the numbers, sourced from the IEA (via
        Stanford's Understand Energy Learning Hub) and India's own Ministry of Statistics.
      </p>

      <section className="mt-10">
        <h2 className="section-title">India's global rank</h2>
        <div className="mt-3 grid grid-cols-1 gap-x-12 lg:grid-cols-2">
          {RANKINGS.map((r, i) => (
            <div key={r.metric} className={`flex items-center justify-between gap-4 py-3 ${i > 1 ? "hairline-section" : ""}`}>
              <div>
                <p className="text-[14px] text-ink">{r.metric}</p>
                <p className="caption mt-0.5">{r.data}</p>
              </div>
              <span className="stat-value shrink-0 text-[26px] text-accent">#{r.rank}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="section-title">Global rank by resource</h2>
        <p className="caption mt-1">Where India ranks worldwide for each energy resource.</p>
        <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-4">
          {RESOURCE_RANKINGS.map((r) => (
            <div key={r.resource} className="py-3">
              <p className="stat-value text-[24px] text-ink">#{r.rank}</p>
              <p className="text-[13px] text-ink-2">{r.resource}</p>
              <p className="caption">{r.metric}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-2">
        <MixChart title="India's total energy supply, 2023" data={ENERGY_SUPPLY_MIX} />
        <MixChart title="India's electricity generation, 2023" data={ELECTRICITY_MIX} />
      </section>

      <section className="mt-12">
        <h2 className="section-title">National reserves</h2>
        <p className="caption mt-1">As of March 31, 2024, Ministry of Statistics and Programme Implementation.</p>
        <div className="mt-3 grid grid-cols-1 gap-x-12 sm:grid-cols-2">
          {RESERVES.map((r, i) => (
            <div key={r.resource} className={`py-3 ${i > 1 ? "hairline-section" : ""}`}>
              <p className="text-[14px] text-ink">{r.resource}</p>
              <p className="stat-value mt-1 text-[22px] text-ink">{r.value}</p>
              <p className="caption mt-1">{r.leaders}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="section-title">Import dependency, FY 2023-24</h2>
        <p className="caption mt-1">
          Government figures (MoSPI), alongside ARGUS's own live-computed crude import share for
          comparison, one independent source checking the other.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-x-12 sm:grid-cols-4">
          {[
            ...IMPORT_DEPENDENCY,
            { resource: "ARGUS live figure (crude)", pct: liveImportedPct },
          ].map((r, i) => (
            <div key={r.resource} className={`py-3 ${i > 0 ? "hairline-section" : ""}`}>
              <p className={`stat-value text-[32px] ${i === IMPORT_DEPENDENCY.length ? "text-accent" : "text-ink"}`}>
                {r.pct ?? "..."}%
              </p>
              <p className="text-[13px] text-ink-2">{r.resource}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-12 border-t border-hairline pt-6">
        <p className="caption">
          Sources:{" "}
          <a href="https://understand-energy.stanford.edu/news/understand-energy-india" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            Stanford Understand Energy Learning Hub, India spotlight
          </a>{" "}
          (IEA-sourced, Jan 2026), and{" "}
          <a href="https://www.mospi.gov.in" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            Ministry of Statistics and Programme Implementation, Energy Statistics India 2025
          </a>{" "}
          (32nd edition, FY 2023-24 data).
        </p>
      </footer>
    </div>
  );
}
