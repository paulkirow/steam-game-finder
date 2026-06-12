import { Suspense } from "react";
import ResultsLoader from "@/components/ResultsLoader";

export default function ResultsPage() {
  return (
    <main className="min-h-screen">
      <Suspense
        fallback={
          <div className="text-slate-400 text-center py-20">Loading…</div>
        }
      >
        <ResultsLoader />
      </Suspense>
    </main>
  );
}
