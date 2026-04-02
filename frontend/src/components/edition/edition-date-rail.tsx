"use client";

import { Calendar } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { shiftIsoDate } from "@/lib/beirut-date";

/** Nombre de jours avant / après la date courante dans la bande défilante. */
const RADIUS = 7;

function chipLabels(iso: string): { weekday: string; dayMonth: string } {
  const parts = iso.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    timeZone: "UTC",
  }).format(dt);
  const dayMonth = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(dt);
  return {
    weekday: weekday.replace(/\.$/, ""),
    dayMonth,
  };
}

type EditionDateRailProps = {
  currentIso: string;
  className?: string;
};

export function EditionDateRail({
  currentIso,
  className = "",
}: EditionDateRailProps) {
  const router = useRouter();
  const activeRef = useRef<HTMLAnchorElement>(null);
  const hiddenPickerRef = useRef<HTMLInputElement>(null);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = -RADIUS; i <= RADIUS; i++) {
      out.push(shiftIsoDate(currentIso, i));
    }
    return out;
  }, [currentIso]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }, [currentIso]);

  const openNativePicker = () => {
    const el = hiddenPickerRef.current;
    if (!el) {
      return;
    }
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        /* navigateurs stricts : repli sur click */
      }
    }
    el.click();
  };

  const chipBase =
    "flex min-w-[3.35rem] shrink-0 snap-center flex-col items-center justify-center rounded-md border px-2 py-1.5 text-center transition-colors duration-150 touch-manipulation no-underline";

  return (
    <div
      className={`min-w-0 max-w-full ${className}`.trim()}
      aria-label="Choisir une date d’édition"
    >
      <ul className="m-0 flex list-none snap-x snap-mandatory gap-1 overflow-x-auto scroll-smooth py-0.5 [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin]">
        {days.map((iso) => {
          const active = iso === currentIso;
          const { weekday, dayMonth } = chipLabels(iso);
          return (
            <li key={iso} className="shrink-0">
              <Link
                ref={active ? activeRef : undefined}
                href={`/edition/${iso}`}
                scroll={false}
                aria-current={active ? "page" : undefined}
                title={`Édition du ${iso}`}
                className={`${chipBase} ${
                  active
                    ? "border-accent bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-foreground shadow-[inset_0_0_0_1px_rgba(221,59,49,0.28)]"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                }`}
              >
                <span className="text-[9px] font-semibold uppercase tracking-wide opacity-85">
                  {weekday}
                </span>
                <span className="font-[family-name:var(--font-serif)] text-[12px] font-semibold tabular-nums leading-tight">
                  {dayMonth}
                </span>
              </Link>
            </li>
          );
        })}
        <li className="shrink-0">
          <button
            type="button"
            onClick={openNativePicker}
            className={`${chipBase} border-dashed border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-accent`}
            title="Ouvrir le sélecteur de date du navigateur"
            aria-label="Choisir une autre date dans le calendrier"
          >
            <Calendar className="mx-auto h-3.5 w-3.5 opacity-90" aria-hidden />
            <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide">
              Autre
            </span>
          </button>
          <input
            ref={hiddenPickerRef}
            type="date"
            value={currentIso}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (v) {
                router.push(`/edition/${v}`);
              }
            }}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
        </li>
      </ul>
    </div>
  );
}
