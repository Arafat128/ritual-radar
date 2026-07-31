"use client";

import dynamic from "next/dynamic";
import { TopBar } from "@/components/ui/TopBar";
import { DetailPanel } from "@/components/ui/DetailPanel";
import { BottomChrome } from "@/components/ui/BottomChrome";

const ForceGraphCanvas = dynamic(
  () =>
    import("@/components/graph/ForceGraph").then((m) => m.ForceGraphCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-white/40">
        Loading 3D radar…
      </div>
    ),
  }
);

export default function Home() {
  return (
    <main className="radar-grid relative h-dvh w-full overflow-hidden">
      <div className="absolute left-0 right-0 top-0 z-20 p-3">
        <TopBar />
      </div>
      <div className="absolute inset-0 z-0">
        <ForceGraphCanvas />
      </div>
      <DetailPanel />
      <BottomChrome />
    </main>
  );
}
