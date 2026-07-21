"use client";

export default function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-hairline-strong text-[10px] leading-none text-ink-3 transition-colors duration-150 hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none"
        aria-label={text}
      >
        ?
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-md border border-hairline bg-surface-3 p-2.5 text-[12px] font-normal leading-snug text-ink-2 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  );
}
