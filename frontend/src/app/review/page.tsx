import { Suspense } from "react";
import { ReviewPageClient } from "./review-page-client";

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-[13px] text-muted-foreground">Chargement…</div>
      }
    >
      <ReviewPageClient />
    </Suspense>
  );
}
