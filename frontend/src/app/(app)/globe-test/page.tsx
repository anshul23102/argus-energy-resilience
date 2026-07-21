"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useNetworkData } from "@/lib/useNetworkData";
import type { Selection } from "@/components/globe/GlobeMap";

const GlobeMap = dynamic(() => import("@/components/globe/GlobeMap"), { ssr: false });

// Temporary Phase 1/2 verification route. Removed once GlobeMap is swapped
// into war-room/network in Phase 3.
export default function GlobeTestPage() {
  const d = useNetworkData();
  const [selection, setSelection] = useState<Selection | null>(null);

  return (
    <div className="h-full w-full">
      <GlobeMap
        refineries={d.refineries} ports={d.ports} spr={d.spr} chokepoints={d.chokepoints}
        routes={d.routes} suppliers={d.suppliers} risk={d.risk}
        selection={selection} onSelect={setSelection}
      />
      {selection && (
        <div className="absolute bottom-4 left-4 z-20 max-w-sm rounded-md border border-hairline bg-surface p-4 text-[13px] text-ink">
          {JSON.stringify(selection).slice(0, 300)}
        </div>
      )}
    </div>
  );
}
