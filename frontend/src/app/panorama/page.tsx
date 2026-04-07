import { Suspense } from "react";
import { PanoramaPageContent } from "@/components/dashboard/panorama-page-content";

export default function PanoramaPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-[13px] text-muted-foreground">
          Chargement du Panorama…
        </div>
      }
    >
      <PanoramaPageContent />
    </Suspense>
  );
}
