"use client";

/**
 * EditionPeriodFrise — Timeline interactive multi-jours.
 *
 * Layout :
 *   ┌──────────────────┐  ┌──────────────────────────────────────┐
 *   │  Carte Info       │  │  Timeline 3 jours (ticks, périodes)  │
 *   └──────────────────┘  └──────────────────────────────────────┘
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │  ◄  Dim 6  │  Lun 7  │  ■ Mar 8  │  Mer 9  │  Jeu 10  ►  │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Design : Ryo Lu / Dieter Rams — information dense, espace aéré.
 * Ticks hiérarchiques 3 niveaux, périodes collecte + actualisation colorées.
 * MAINTENANT : indicateur pulsant sur l'édition du jour.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shiftIsoDate } from "@/lib/beirut-date";
import { EditionCalendarPopover } from "@/components/edition/edition-calendar-popover";
import { ChevronLeft, ChevronRight } from "lucide-react";

const TZ = "Asia/Beirut";
const DAY_PX = 200;
const VISIBLE_DAYS = 3;
const SELECTOR_RANGE = 4;

/* ── Hiérarchie des ticks ──────────────────────────────────── */
// Majeur   : 0h, 6h, 12h, 18h  → 20px, label heure
// Secondaire: 3h, 9h, 15h, 21h → 12px, pas de label
// Mineur   : toutes les heures → 5px

const TICK_H_MAJOR = 20;
const TICK_H_SECONDARY = 12;
const TICK_H_MINOR = 5;
const TIMELINE_H = 56; // hauteur totale de la zone ticks

/* ── Helpers ───────────────────────────────────────────────── */

function isoRange(center: string, range: number): string[] {
  const days: string[] = [];
  for (let i = -range; i <= range; i++) days.push(shiftIsoDate(center, i));
  return days;
}

function fmtEditionTitle(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const day = d.getDate();
  const month = d.toLocaleDateString("fr-FR", { month: "long" });
  return `Édition du ${day} ${month.charAt(0).toUpperCase() + month.slice(1)}`;
}

function fmtShortDay(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const wd = d.toLocaleDateString("fr-FR", { weekday: "short" });
  const day = d.getDate();
  const dayStr = day === 1 ? "1er" : String(day);
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)}. ${dayStr}`;
}

function fmtFullDay(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const wd = d.toLocaleDateString("fr-FR", { weekday: "short" });
  const day = d.getDate();
  const month = d.toLocaleDateString("fr-FR", { month: "short" });
  const dayStr = day === 1 ? "1er" : String(day);
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)}. ${dayStr} ${month.charAt(0).toUpperCase() + month.slice(1)}`;
}

function fmtTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function beirutNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}

function parseToLocal(isoStr: string): Date {
  return new Date(new Date(isoStr).toLocaleString("en-US", { timeZone: TZ }));
}

/* ── Carte Info (gauche) ──────────────────────────────────── */

interface InfoCardProps {
  currentIso: string;
  windowStart?: string;
  windowEnd?: string;
}

function FriseInfoCard({ currentIso, windowStart, windowEnd }: InfoCardProps) {
  const ws = windowStart ? parseToLocal(windowStart) : null;
  const we = windowEnd ? parseToLocal(windowEnd) : null;

  const startLabel = ws
    ? `${ws.toLocaleDateString("fr-FR", { weekday: "short" })} ${ws.getDate()}`
    : "—";
  const endLabel = we
    ? `${we.toLocaleDateString("fr-FR", { weekday: "short" })} ${we.getDate()}`
    : "—";
  const startTime = ws ? fmtTime(ws) : "—";
  const endTime = we ? fmtTime(we) : "—";

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-2xl border border-border/40 bg-background px-5 py-5 shadow-mid">
      {/* Titre édition */}
      <p className="text-center text-[15px] font-semibold leading-tight tracking-tight text-foreground font-[family-name:var(--font-serif)]">
        {fmtEditionTitle(currentIso)}
      </p>
      <p className="mt-1 text-center text-[11px] text-muted-foreground">
        Articles publiés entre :
      </p>

      {/* Barre hachuree — 2 couleurs : collecte (accent) + actualisation (info) */}
      <div className="relative mt-4 flex w-full max-w-[200px] items-center gap-0">
        {/* Marqueur gauche */}
        <div className="h-3 w-0.5 shrink-0 bg-accent" />

        {/* Segment collecte matinale (accent) */}
        <div
          className="h-1.5 flex-1"
          style={{
            background:
              "repeating-linear-gradient(-45deg, transparent, transparent 2px, color-mix(in srgb, var(--color-accent) 22%, transparent) 2px, color-mix(in srgb, var(--color-accent) 22%, transparent) 4px)",
          }}
          title="Fenêtre de collecte"
        />

        {/* Marqueur droit */}
        <div className="h-3 w-0.5 shrink-0 bg-accent" />
      </div>

      {/* Jours */}
      <div className="mt-1.5 flex w-full max-w-[200px] justify-between">
        <span className="text-[11px] font-medium text-foreground">{startLabel}</span>
        <span className="text-[11px] font-medium text-foreground">{endLabel}</span>
      </div>

      {/* Heures */}
      <div className="mt-0.5 flex w-full max-w-[200px] justify-between">
        <div className="flex flex-col items-start">
          <span className="inline-block mb-0.5 size-1.5 rounded-full bg-accent" />
          <span className="text-[20px] font-extralight tracking-tight text-foreground tabular-nums">
            {startTime}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="inline-block mb-0.5 size-1.5 rounded-full bg-accent" />
          <span className="text-[20px] font-extralight tracking-tight text-foreground tabular-nums">
            {endTime}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Timeline Card (droite) ───────────────────────────────── */

interface TimelineCardProps {
  currentIso: string;
  windowStart?: string;
  windowEnd?: string;
}

function FriseTimelineCard({
  currentIso,
  windowStart,
  windowEnd,
}: TimelineCardProps) {
  const [now, setNow] = useState(beirutNow);
  useEffect(() => {
    const id = setInterval(() => setNow(beirutNow()), 30_000);
    return () => clearInterval(id);
  }, []);

  /* Les 3 jours affichés : J-1, J, J+1 */
  const timelineDays = useMemo(() => {
    const d = new Date(currentIso + "T12:00:00");
    return [-1, 0, 1].map((offset) => {
      const nd = new Date(d);
      nd.setDate(nd.getDate() + offset);
      return nd.toISOString().slice(0, 10);
    });
  }, [currentIso]);

  const totalW = DAY_PX * VISIBLE_DAYS;

  const ws = windowStart ? parseToLocal(windowStart) : null;
  const we = windowEnd ? parseToLocal(windowEnd) : null;

  function timeToX(d: Date): number {
    const iso = d.toISOString().slice(0, 10);
    const dayIdx = timelineDays.indexOf(iso);
    if (dayIdx < 0) {
      if (d < new Date(timelineDays[0] + "T00:00:00")) return 0;
      return totalW;
    }
    const hours = d.getHours() + d.getMinutes() / 60;
    return dayIdx * DAY_PX + (hours / 24) * DAY_PX;
  }

  /* Fenêtre de collecte (accent) */
  const collecteX1 = ws ? Math.max(0, timeToX(ws)) : -1;
  const collecteX2 = we ? Math.min(totalW, timeToX(we)) : -1;
  const collecteW = collecteX1 >= 0 && collecteX2 >= 0 ? Math.max(0, collecteX2 - collecteX1) : 0;

  /* Indicateur MAINTENANT */
  const nowIso = now.toISOString().slice(0, 10);
  const isLive = timelineDays.includes(nowIso);
  const nowX = isLive ? timeToX(now) : -1;
  const showNow = isLive && nowX >= 0 && nowX <= totalW;

  return (
    <div
      className="relative flex min-w-0 flex-[1.6] flex-col rounded-2xl border border-border/40 bg-background px-4 pb-3 pt-4 shadow-mid"
      style={{ overflow: "hidden" }}
    >
      {/* Zone timeline */}
      <div
        className="relative w-full select-none"
        style={{ height: TIMELINE_H + 28, minWidth: totalW + 8 }}
      >
        {/* Période collecte (accent hachuré) */}
        {collecteW > 0 && (
          <div
            className="absolute top-[18px] transition-all duration-300"
            style={{
              left: collecteX1,
              width: collecteW,
              height: TICK_H_MAJOR + TICK_H_SECONDARY,
              background:
                "repeating-linear-gradient(-45deg, transparent, transparent 3px, color-mix(in srgb, var(--color-accent) 14%, transparent) 3px, color-mix(in srgb, var(--color-accent) 14%, transparent) 6px)",
            }}
            title={`Collecte : ${ws ? fmtTime(ws) : "?"} → ${we ? fmtTime(we) : "?"}`}
          />
        )}

        {/* Ticks — 3 niveaux par jour */}
        {timelineDays.map((dayIso, dayIdx) =>
          Array.from({ length: 24 }, (_, h) => {
            const x = dayIdx * DAY_PX + (h / 24) * DAY_PX;
            const isMajor = h % 6 === 0;
            const isSecondary = h % 3 === 0 && !isMajor;

            const tickH = isMajor
              ? TICK_H_MAJOR
              : isSecondary
                ? TICK_H_SECONDARY
                : TICK_H_MINOR;

            const top = TIMELINE_H - tickH + (isMajor ? 0 : isSecondary ? 4 : 8);

            /* Couleur : 8h = accent (heure de publication), majeur = foreground, secondary = muted, minor = border */
            const color =
              h === 8
                ? "var(--color-accent)"
                : isMajor
                  ? "var(--color-foreground)"
                  : isSecondary
                    ? "var(--color-muted-foreground)"
                    : "var(--color-border)";

            return (
              <div
                key={`${dayIso}-${h}`}
                className="absolute"
                style={{
                  left: x,
                  top,
                  width: isMajor ? 1.5 : 1,
                  height: tickH,
                  backgroundColor: color,
                }}
              />
            );
          }),
        )}

        {/* Labels heures majeures : 0h, 6h, 12h, 18h + 8h en accent */}
        {timelineDays.map((dayIso, dayIdx) =>
          [0, 6, 8, 12, 18].map((h) => {
            const x = dayIdx * DAY_PX + (h / 24) * DAY_PX;
            const isAccent = h === 8;
            return (
              <span
                key={`lbl-${dayIso}-${h}`}
                className="absolute -translate-x-1/2 select-none text-[9.5px] tabular-nums"
                style={{
                  left: x,
                  top: 2,
                  color: isAccent
                    ? "var(--color-accent)"
                    : "var(--color-muted-foreground)",
                  fontWeight: isAccent ? 600 : 400,
                }}
              >
                {h}h
              </span>
            );
          }),
        )}

        {/* Point 8h (publication) */}
        {timelineDays.map((dayIso, dayIdx) => {
          const x = dayIdx * DAY_PX + (8 / 24) * DAY_PX;
          return (
            <span
              key={`dot8-${dayIso}`}
              className="absolute size-1.5 rounded-full bg-accent"
              style={{ left: x - 3, top: 14 }}
            />
          );
        })}

        {/* Indicateur MAINTENANT */}
        {showNow && (
          <>
            {/* Trait vertical accent */}
            <div
              className="absolute top-0 w-[1.5px] bg-accent"
              style={{ left: nowX, height: TIMELINE_H + 14 }}
            />
            {/* Label pulsant */}
            <span
              className="absolute text-[9px] font-semibold uppercase tracking-wide text-accent motion-safe:animate-pulse"
              style={{ left: nowX + 4, top: 0 }}
            >
              live
            </span>
          </>
        )}
      </div>

      {/* Labels jours */}
      <div
        className="relative mt-1 flex"
        style={{ width: totalW }}
      >
        {timelineDays.map((dayIso) => {
          const isCurrent = dayIso === currentIso;
          return (
            <div
              key={dayIso}
              className={`text-center text-[11px] ${
                isCurrent
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground"
              }`}
              style={{ width: DAY_PX }}
            >
              {isCurrent ? (
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block size-1.5 rounded-full bg-accent"
                    aria-hidden
                  />
                  {fmtShortDay(dayIso)}
                </span>
              ) : (
                fmtShortDay(dayIso)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Sélecteur de jours ───────────────────────────────────── */

interface DaySelectorProps {
  currentIso: string;
  days: string[];
  onSelect: (iso: string) => void;
}

function FriseDaySelector({ currentIso, days, onSelect }: DaySelectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const active = el.querySelector("[data-active='true']") as HTMLElement | null;
    if (active) {
      active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }, [currentIso]);

  const scrollBy = useCallback((dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 180, behavior: "smooth" });
  }, []);

  return (
    <div className="flex items-center gap-2">
      {/* Flèche gauche — cercle */}
      <button
        onClick={() => scrollBy(-1)}
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground"
        aria-label="Jours précédents"
      >
        <ChevronLeft className="size-3.5" />
      </button>

      {/* Rail de jours */}
      <div
        ref={scrollRef}
        className="olj-scrollbar-none flex flex-1 gap-1 overflow-x-auto scroll-smooth rounded-xl bg-muted/20 p-1"
      >
        {days.map((iso) => {
          const isActive = iso === currentIso;
          return (
            <button
              key={iso}
              data-active={isActive}
              onClick={() => onSelect(iso)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all duration-150 ${
                isActive
                  ? "bg-foreground text-background shadow-low"
                  : "text-muted-foreground hover:bg-background/80 hover:text-foreground active:scale-[0.97]"
              }`}
            >
              {fmtFullDay(iso)}
            </button>
          );
        })}
      </div>

      {/* Flèche droite — cercle */}
      <button
        onClick={() => scrollBy(1)}
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground"
        aria-label="Jours suivants"
      >
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  );
}

/* ── Export principal ─────────────────────────────────────── */

interface EditionPeriodFriseProps {
  currentIso: string;
  editionWindow?: { start: string; end: string };
  unifiedDayNav: (isoDate: string) => void;
}

export const EditionPeriodFrise = function EditionPeriodFrise({
  currentIso,
  editionWindow,
  unifiedDayNav,
}: EditionPeriodFriseProps) {
  const calDays = useMemo(() => isoRange(currentIso, SELECTOR_RANGE), [currentIso]);

  return (
    <nav className="w-full space-y-3" aria-label="Navigation temporelle de l'édition">
      {/* Cartes info + timeline */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <FriseInfoCard
          currentIso={currentIso}
          windowStart={editionWindow?.start}
          windowEnd={editionWindow?.end}
        />
        <FriseTimelineCard
          currentIso={currentIso}
          windowStart={editionWindow?.start}
          windowEnd={editionWindow?.end}
        />
      </div>

      {/* Sélecteur de jours */}
      <FriseDaySelector
        currentIso={currentIso}
        days={calDays}
        onSelect={unifiedDayNav}
      />

      {/* Calendrier popover */}
      <div className="flex items-center justify-center">
        <EditionCalendarPopover
          currentIso={currentIso}
          triggerLabel="Calendrier"
          onDateSelect={unifiedDayNav}
        />
      </div>
    </nav>
  );
};
