"use client";

import dynamic from "next/dynamic";

const GlobeMap = dynamic(() => import("@/components/globe/GlobeMap"), { ssr: false });

// Temporary Phase 1 verification route. Removed once GlobeMap is swapped
// into war-room/network in Phase 3.
export default function GlobeTestPage() {
  return (
    <div className="h-full w-full">
      <GlobeMap />
    </div>
  );
}
