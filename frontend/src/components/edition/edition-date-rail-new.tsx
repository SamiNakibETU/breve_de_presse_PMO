"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { EditionPeriodFrise } from "@/components/edition/edition-period-frise";
import { formatEditionCalendarTitleFr } from "@/lib/dates-display-fr";

export type EditionDateRailNewProps = {
  currentIso: string;
  editionWindow?: { start: string; end: string } | null;
  className?: string;
};

export function EditionDateRailNew({
  currentIso,
  editionWindow,
  className = "",
}: EditionDateRailNewProps): ReactElement {
  const router = useRouter();
  /* ── Animated title on day change ── */
  const [vis, setVis] = useState(true);
  const [dispIso, setDispIso] = useState(currentIso);
  const prev = useRef(currentIso);

  useEffect(() => {
    if (prev.current === currentIso) return;
    prev.current = currentIso;
    setVis(false);
    const t = setTimeout(() => {
      setDispIso(currentIso);
      setVis(true);
    }, 160);
    return () => clearTimeout(t);
  }, [currentIso]);

  const fadeClass = vis
    ? "translate-y-0 opacity-100"
    : "-translate-y-1 opacity-0";

  return (
    <div className={`w-full ${className}`.trim()}>
      {/* Title — animated fade on day change */}
      <h1
        className={`font-[family-name:var(--font-serif)] text-[1.35rem] font-normal leading-snug tracking-tight text-foreground transition-[opacity,transform] duration-[160ms] ease-out sm:text-[1.65rem] ${fadeClass}`}
      >
        {formatEditionCalendarTitleFr(dispIso)}
      </h1>

      {/* Multi-day scrollable frise */}
      <div className="mt-4">
        <EditionPeriodFrise
          currentIso={currentIso}
          editionWindow={
            editionWindow?.start && editionWindow?.end
              ? { start: editionWindow.start, end: editionWindow.end }
              : undefined
          }
          unifiedDayNav={(iso) => router.push(`/edition/${iso}`)}
        />
      </div>
    </div>
  );
}
