import { Suspense } from "react";
import { ArticlesPageClient } from "./articles-page-client";

export default function ArticlesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-[13px] text-muted-foreground">Chargement…</div>
      }
    >
      <ArticlesPageClient />
    </Suspense>
  );
}
