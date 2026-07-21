"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home, ShieldAlert, Radio, SlidersHorizontal, Waypoints, Settings2, BookOpen, ScanEye,
} from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import PriceTicker from "./PriceTicker";
import IntroOverlay from "./IntroOverlay";

const ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  "/": Home,
  "/risk": ShieldAlert,
  "/intelligence": Radio,
  "/scenario": SlidersHorizontal,
  "/network": Waypoints,
  "/assumptions": Settings2,
  "/sources": BookOpen,
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [apiDown, setApiDown] = useState(false);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const check = () =>
      fetch((process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api/health")
        .then((r) => setApiDown(!r.ok))
        .catch(() => setApiDown(true));
    check();
    const t1 = setInterval(check, 30_000);
    const t2 = setInterval(() => setClock(new Date().toISOString().slice(0, 19).replace("T", " ") + "Z"), 1000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  const current = NAV_ITEMS.find((n) => n.href === pathname);

  return (
    <div className="flex h-full w-full bg-bg text-ink">
      <IntroOverlay />
      {/* Left nav rail */}
      <nav className="flex w-[96px] shrink-0 flex-col items-center border-r border-hairline bg-surface py-6">
        <Link href="/" className="mb-8 flex flex-col items-center gap-1.5" title="ARGUS, energy supply chain intelligence">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-accent/30 bg-accent/10">
            <ScanEye size={19} strokeWidth={1.75} className="text-accent" />
          </span>
          <span className="whitespace-nowrap font-display text-[13px] font-bold tracking-[0.12em] text-accent">ARGUS</span>
        </Link>
        <div className="flex flex-1 flex-col items-center gap-2">
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.href];
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.description}
                className={`group relative flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-lg transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent ${
                  active ? "bg-accent/12 text-accent" : "text-ink-3 hover:bg-surface-2 hover:text-ink-2"
                }`}
              >
                {active && <span className="absolute left-0 h-6 w-[3px] rounded-r bg-accent" style={{ left: -14 }} />}
                <Icon size={21} strokeWidth={1.75} />
                <span className="text-[11px] leading-none">{item.label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-hairline bg-surface/80 px-7 backdrop-blur">
          <div>
            <h1 className="section-title">{current?.label ?? "ARGUS"}</h1>
            {current && <p className="caption mt-0.5">{current.description}</p>}
          </div>
          <div className="flex items-center gap-7">
            <PriceTicker />
            <span className="figure hidden text-[13px] text-ink-3 xl:inline">{clock}</span>
            <span className="flex items-center gap-2 text-[13px]">
              <span className={`live-dot h-1.5 w-1.5 rounded-full ${apiDown ? "bg-risk-high" : "bg-risk-low"}`} />
              <span className={apiDown ? "text-risk-high" : "text-risk-low"}>{apiDown ? "Offline" : "Live"}</span>
            </span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
