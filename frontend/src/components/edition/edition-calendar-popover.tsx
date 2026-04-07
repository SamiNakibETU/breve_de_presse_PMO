"use client";

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { todayBeirutIsoDate } from "@/lib/beirut-date";

const WEEKDAY_LABELS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoFromYmdUtc(y: number, m0: number, d: number): string {
  return `${y}-${pad2(m0 + 1)}-${pad2(d)}`;
}

function parseIso(iso: string): { y: number; m0: number; d: number } {
  const [a, b, c] = iso.split("-").map(Number);
  return { y: a ?? 1970, m0: (b ?? 1) - 1, d: c ?? 1 };
}

function monthMatrix(
  y: number,
  m0: number,
): { key: string; day: number | null; iso: string | null }[] {
  const firstDow = new Date(Date.UTC(y, m0, 1)).getUTCDay();
  const startPad = (firstDow + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  const cells: { key: string; day: number | null; iso: string | null }[] = [];
  for (let i = 0; i < startPad; i++) {
    cells.push({ key: `p-${i}`, day: null, iso: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      key: `d-${d}`,
      day: d,
      iso: isoFromYmdUtc(y, m0, d),
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ key: `t-${cells.length}`, day: null, iso: null });
  }
  return cells;
}

function monthTitleFr(y: number, m0: number): string {
  const raw = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m0, 15)));
  return raw.length > 0 ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
}

export type EditionCalendarPopoverProps = {
  currentIso: string;
  /** Libellé court du bouton déclencheur */
  triggerLabel?: string;
  className?: string;
  /** Icône seule (navigation édition minimaliste). */
  compact?: boolean;
  /** Si défini : appelé à la sélection au lieu de naviguer vers `/edition/…`. */
  onDateSelect?: (iso: string) => void;
};

export function EditionCalendarPopover({
  currentIso,
  triggerLabel = "Autre",
  className = "",
  compact = false,
  onDateSelect,
}: EditionCalendarPopoverProps) {
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const panelId = useId();
  const headingId = `${panelId}-title`;

  const initial = useMemo(() => parseIso(currentIso), [currentIso]);
  const [viewY, setViewY] = useState(initial.y);
  const [viewM0, setViewM0] = useState(initial.m0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const { y, m0 } = parseIso(currentIso);
    setViewY(y);
    setViewM0(m0);
  }, [currentIso]);

  const cells = useMemo(
    () => monthMatrix(viewY, viewM0),
    [viewY, viewM0],
  );

  const goPrevMonth = useCallback(() => {
    setViewM0((m) => {
      if (m === 0) {
        setViewY((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const goNextMonth = useCallback(() => {
    setViewM0((m) => {
      if (m === 11) {
        setViewY((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      return;
    }
    const r = btnRef.current.getBoundingClientRect();
    const panelW = 300;
    const left = Math.max(
      8,
      Math.min(r.left, window.innerWidth - panelW - 8),
    );
    setPos({ top: r.bottom + 8, left });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const selectIso = (iso: string) => {
    setOpen(false);
    if (onDateSelect) {
      onDateSelect(iso);
      return;
    }
    router.push(`/edition/${iso}`);
  };

  const todayIso = todayBeirutIsoDate();

  const panel = open && mounted && (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed z-[120] w-[min(100vw-1rem,300px)] rounded-2xl border border-border/60 bg-card p-3 shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className="olj-date-rail__chevron"
          aria-label="Mois précédent"
          onClick={goPrevMonth}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </button>
        <h2
          id={headingId}
          className="min-w-0 flex-1 text-center font-[family-name:var(--font-serif)] text-[15px] font-semibold capitalize leading-tight text-foreground"
        >
          {monthTitleFr(viewY, viewM0)}
        </h2>
        <button
          type="button"
          className="olj-date-rail__chevron"
          aria-label="Mois suivant"
          onClick={goNextMonth}
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        {WEEKDAY_LABELS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          if (c.day === null || c.iso === null) {
            return <div key={c.key} className="aspect-square" />;
          }
          const selected = c.iso === currentIso;
          const isToday = c.iso === todayIso;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => selectIso(c.iso!)}
              className={`flex aspect-square items-center justify-center rounded-xl text-[13px] font-medium tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${
                selected
                  ? "bg-[var(--color-accent)] text-white shadow-sm"
                  : isToday
                    ? "bg-muted/70 text-foreground ring-1 ring-border/60"
                    : "text-foreground hover:bg-muted/50"
              }`}
              aria-pressed={selected}
              aria-label={
                onDateSelect ? `Choisir le jour ${c.iso}` : `Édition du ${c.iso}`
              }
            >
              {c.day}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between gap-2 border-t border-border/50 pt-2">
        <button
          type="button"
          className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => {
            setOpen(false);
          }}
        >
          Fermer
        </button>
        <button
          type="button"
          className="rounded-lg bg-muted/60 px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted"
          onClick={() => selectIso(todayIso)}
        >
          Aujourd’hui
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          compact
            ? `olj-date-rail__chevron shrink-0 ${className}`.trim()
            : `inline-flex shrink-0 flex-col items-center justify-center rounded-2xl border border-border/40 bg-card/80 px-2.5 py-2 text-center text-muted-foreground shadow-[0_1px_0_rgba(0,0,0,0.04)] transition-colors hover:border-border hover:bg-muted/25 hover:text-foreground ${className}`.trim()
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        aria-label={compact ? "Choisir une date dans le calendrier" : undefined}
      >
        <Calendar
          className={compact ? "h-4 w-4 opacity-85" : "h-3.5 w-3.5 opacity-80"}
          aria-hidden
        />
        {compact ? null : (
          <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.12em]">
            {triggerLabel}
          </span>
        )}
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
