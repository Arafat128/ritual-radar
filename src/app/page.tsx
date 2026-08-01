"use client";

import { Suspense } from "react";
import { RadarApp } from "@/components/RadarApp";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-[#050505] text-sm text-white/40">
          Loading Ritual Radar…
        </div>
      }
    >
      <RadarApp />
    </Suspense>
  );
}
