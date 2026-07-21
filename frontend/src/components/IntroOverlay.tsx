"use client";

import { useEffect, useState } from "react";
import { NAV_ITEMS } from "@/lib/nav";

const STORAGE_KEY = "argus-intro-seen-v1";

const SLIDES = [
  {
    title: "What ARGUS does",
    body: "India imports 88% of its crude oil, and 40% of it sails through a single strait. ARGUS models that dependency end to end: it scores disruption risk from live news, simulates what a closure would cost, and prices the fastest real replacement barrels, all from real, sourced data.",
  },
  {
    title: "How to read the numbers",
    body: "The risk percentage on Corridor Risk is a Bayesian probability of disruption in the next 30 days, updated from corroborated news evidence. It is not a prediction of war or a guess, it is a calculation you can trace, and it moves as evidence ages out or new evidence arrives.",
  },
  {
    title: "What each page is for",
    body: null,
  },
];

export default function IntroOverlay() {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (!window.localStorage.getItem(STORAGE_KEY)) setStep(0);
  }, []);

  const dismiss = () => {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setStep(null);
  };

  if (step === null) return null;
  const slide = SLIDES[step];
  const last = step === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 backdrop-blur-sm">
      <div className="panel-glass w-[480px] max-w-[90vw] p-8">
        <p className="section-label mb-3">
          {step + 1} of {SLIDES.length}
        </p>
        <h2 className="text-[22px] font-semibold text-ink">{slide.title}</h2>

        {slide.body && (
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{slide.body}</p>
        )}

        {slide.body === null && (
          <div className="mt-4">
            {NAV_ITEMS.map((item, i) => (
              <div key={item.href} className={`flex items-baseline justify-between gap-4 py-2.5 ${i > 0 ? "hairline-section" : ""}`}>
                <span className="text-[14px] font-medium text-ink">{item.label}</span>
                <span className="caption text-right">{item.description}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-7 flex items-center justify-between">
          <button
            onClick={dismiss}
            className="text-[13px] text-ink-3 transition-colors duration-150 hover:text-ink-2"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {SLIDES.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors duration-150 ${i === step ? "bg-accent" : "bg-hairline-strong"}`}
              />
            ))}
          </div>
          <button
            onClick={() => (last ? dismiss() : setStep((s) => (s ?? 0) + 1))}
            className="rounded-md bg-accent px-5 py-2 text-[13px] font-semibold text-accent-ink transition-[filter] duration-150 hover:brightness-110"
          >
            {last ? "Start" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
