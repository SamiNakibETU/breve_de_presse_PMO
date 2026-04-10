"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { EditionPeriodFrise } from "@/components/edition/edition-period-frise";
import { shiftIsoDate } from "@/lib/beirut-date";
import { formatEditionCalendarTitleFr } from "@/lib/dates-display-fr";

const TZ = "Asia/Beirut";

function daySegment(iso: string): { wd: string; d: string } {
  const [y, mo, dd] = iso.split("-").map(Number);
  const utc = Date.UTC(y!, (mo! - 1), dd!, 12);
  const wd = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    timeZone: TZ,
  })
    .format(utc)
    .replace(/\.$/, "")
    .toLowerCase();
  const d = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    timeZone: TZ,
  }).format(utc);
  return { wd, d };
}

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

  const fade = `transition-[opacity,transform] duration-[160ms] ease-out ${
    vis ? "translate-y-0 opacity-100" : "-translate-y-0.5 opacity-0"
  }`;

  const title = formatEditionCalendarTitleFr(dispIso);

  /* ── Calendar days: 6 days, centred on current ── */
  const calDays = Array.from({ length: 6 }, (_, i) =>
    shiftIsoDate(currentIso, i - 2),
  );

  /* ── Swipe gesture (native events, zero React state) ── */
  const gestureRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = gestureRef.current;
    if (!el) return;
    let pid = -1;
    let sx = 0;
    let sy = 0;
    let moved = false;

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("a,button,input,label")) return;
      pid = e.pointerId;
      sx = e.clientX;
      sy = e.clientY;
      moved = false;
      try {
        el.setPointerCapture(pid);
      } catch {
        /* ignore */
      }
    };

    const move = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      const dx = e.clientX - sx;
      if (!moved) {
        if (Math.abs(e.clientY - sy) > Math.abs(dx) * 1.2) {
          pid = -1;
          return;
        }
        if (Math.abs(dx) < 8) return;
        moved = true;
      }
      el.style.transform = `translateX(${dx * 0.18}px)`;
      el.style.transition = "none";
    };

    const up = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      const dx = e.clientX - sx;
      el.style.transform = "";
      el.style.transition = "transform 280ms cubic-bezier(.22,.9,.36,1)";
      pid = -1;
      if (moved && Math.abs(dx) > 45) {
        router.push(
          `/edition/${shiftIsoDate(currentIso, dx > 0 ? -1 : 1)}`,
        );
      }
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [currentIso, router]);

  return (
    <div className={`w-full ${className}`.trim()}>
      {/* Title — animated fade */}
      <h1
        className={`font-[family-name:var(--font-serif)] text-[1.4rem] font-normal leading-snug tracking-tight text-foreground sm:text-[1.75rem] ${fade}`}
      >
        {title}
      </h1>

      {/* Frise bar (with swipe area) */}
      <div ref={gestureRef} className="mt-4 touch-pan-y">
        {editionWindow?.start && editionWindow?.end ? (
          <EditionPeriodFrise
            windowStartIso={editionWindow.start}
            windowEndIso={editionWindow.end}
            publishRouteIso={currentIso}
          />
        ) : null}
      </div>

      {/* Calendar rail ── ‹ [days] › */}
      <div className="mt-4 flex items-center gap-1">
        <Link
          href={`/edition/${shiftIsoDate(currentIso, -1)}`}
          scroll={false}
          aria-label="Jour précédent"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-lg font-thin text-muted-foreground/50 transition-colors duration-150 hover:bg-muted/40 hover:text-foreground"
        >
          ‹
        </Link>

        <div className="flex min-w-0 flex-1 items-center rounded-lg bg-muted/25 p-0.5">
          {calDays.map((iso) => {
            const on = iso === currentIso;
            const { wd, d } = daySegment(iso);
            return (
              <Link
                key={iso}
                href={`/edition/${iso}`}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={`flex flex-1 flex-col items-center justify-center rounded-md px-0.5 py-1.5 no-underline transition-all duration-200 ${
                  on
                    ? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                    : "text-muted-foreground/55 hover:text-muted-foreground"
                }`}
              >
                <span
                  className={`text-[6.5px] uppercase leading-none tracking-[0.1em] ${
                    on ? "opacity-50" : "opacity-40"
                  }`}
                >
                  {wd}
                </span>
                <span
                  className={`mt-0.5 text-[11px] tabular-nums leading-none ${
                    on ? "font-semibold" : "font-normal"
                  }`}
                >
                  {d}
                </span>
              </Link>
            );
          })}
        </div>

        <Link
          href={`/edition/${shiftIsoDate(currentIso, 1)}`}
          scroll={false}
          aria-label="Jour suivant"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-lg font-thin text-muted-foreground/50 transition-colors duration-150 hover:bg-muted/40 hover:text-foreground"
        >
          ›
        </Link>
      </div>
    </div>
  );
}
