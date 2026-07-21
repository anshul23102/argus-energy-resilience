"use client";

import Link from "next/link";
import { ArrowUpRight, ScanEye } from "lucide-react";
import { useNetworkData } from "@/lib/useNetworkData";
import { NAV_ITEMS } from "@/lib/nav";

export default function LandingPage() {
  const d = useNetworkData();

  const stats: [string, string][] = [
    ["Refineries tracked", String(d.refineries.length || 22)],
    ["Supplier nations", String(d.suppliers.length || 8)],
    ["Shipping chokepoints", String(d.chokepoints.length || 7)],
  ];

  return (
    <div className="mx-auto flex min-h-full max-w-[1400px] flex-col px-8 py-8 lg:px-16">
      <header className="flex items-center justify-between">
        <Link href="/war-room" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-accent/30 bg-accent/10">
            <ScanEye size={19} strokeWidth={1.75} className="text-accent" />
          </span>
          <span className="font-display text-[15px] font-bold tracking-[0.12em] text-accent">ARGUS</span>
        </Link>
        <Link
          href="/war-room"
          className="rounded-md bg-accent px-5 py-2.5 text-[14px] font-semibold text-accent-ink transition-[filter] duration-150 hover:brightness-110"
        >
          Enter the War Room
        </Link>
      </header>

      <section className="flex flex-1 flex-col justify-center py-20">
        <p className="section-label mb-4">Energy supply chain intelligence for India</p>
        <h1 className="font-display max-w-4xl text-[56px] font-bold leading-[1.05] tracking-tight text-ink lg:text-[72px]">
          88% of crude is imported.
          <br />
          40% sails through one strait.
        </h1>
        <p className="mt-6 max-w-2xl text-[18px] leading-relaxed text-ink-2">
          ARGUS scores disruption risk from live news, simulates what a chokepoint closure would
          actually cost, and prices the fastest real replacement barrels, an end-to-end model of
          the single dependency India's energy security runs on, built entirely on real, sourced
          data.
        </p>
        <div className="mt-9 flex items-center gap-4">
          <Link
            href="/war-room"
            className="rounded-md bg-accent px-7 py-3.5 text-[15px] font-semibold text-accent-ink transition-[filter] duration-150 hover:brightness-110"
          >
            Enter the War Room
          </Link>
          <Link
            href="/sources"
            className="text-[15px] font-medium text-ink-2 transition-colors duration-150 hover:text-ink"
          >
            See where the data comes from →
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-3 gap-x-10 border-t border-hairline pt-8 sm:max-w-xl">
          {stats.map(([label, value]) => (
            <div key={label}>
              <p className="stat-value text-[36px] text-ink">{value}</p>
              <p className="caption mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-14">
        <h2 className="section-title mb-6">Every view of the same supply chain</h2>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-hairline sm:grid-cols-2 lg:grid-cols-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col justify-between bg-bg p-6 transition-colors duration-150 hover:bg-surface"
            >
              <div>
                <p className="text-[16px] font-semibold text-ink">{item.label}</p>
                <p className="caption mt-1.5">{item.description}</p>
              </div>
              <ArrowUpRight size={16} className="mt-6 text-ink-3 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-hairline py-8">
        <p className="caption">
          Built for the ET AI Hackathon 2.0. Nothing in the model is invented, every figure traces
          to a named public source on the{" "}
          <Link href="/sources" className="text-accent hover:underline">Sources page</Link>.
        </p>
      </footer>
    </div>
  );
}
