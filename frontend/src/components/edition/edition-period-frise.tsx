"use client";

/**
 * EditionPeriodFrise — Figma-faithful timeline + date selector.
 *
 * Layout (desktop):
 *   ┌──────────────────┐ ┌──────────────────────────────────┐
 *   │  Edition Info     │ │  Timeline (3 days, ticks, Live)  │
 *   └──────────────────┘ └──────────────────────────────────┘
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  ◄  Dim 31 mars │ Lun 1er avril │ ■ Mar 2 │ …    ►   │
 *   └─────────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shiftIsoDate } from "@/lib/beirut-date";
import { EditionCalendarPopover } from "@/components/edition/edition-calendar-popover";
import { ChevronLeft, ChevronRight } from "lucide-react";

const TZ = "Asia/Beirut";
const DAY_PX = 180;
const VISIBLE_DAYS = 3;
const SELECTOR_RANGE = 3;
const TICK_AREA_H = 48;
const TICK_MIDNIGHT_H = 56;

/* ─── helpers ─── */

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
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${d.getDate()}`;
}

function fmtFullDay(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const wd = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const day = d.getDate();
  const month = d.toLocaleDateString("fr-FR", { month: "long" });
  const dayStr = day === 1 ? "1er" : String(day);
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dayStr} ${month}`;
}

function beirutNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: TZ }),
  );
}

function parseToLocal(isoStr: string): Date {
  return new Date(
    new Date(isoStr).toLocaleString("en-US", { timeZone: TZ }),
  );
}

/* ─── sub-components ─── */

interface InfoCardProps {
  currentIso: string;
  windowStart?: string;
  windowEnd?: string;
}

function FriseInfoCard({ currentIso, windowStart, windowEnd }: InfoCardProps) {
  const ws = windowStart ? parseToLocal(windowStart) : null;
  const we = windowEnd ? parseToLocal(windowEnd) : null;

  const startDay = ws
    ? `${ws.toLocaleDateString("fr-FR", { weekday: "short" })} ${ws.getDate()}`
    : "—";
  const endDay = we
    ? `${we.toLocaleDateString("fr-FR", { weekday: "short" })} ${we.getDate()}`
    : "—";
  const startTime = ws ? `${ws.getHours()}h:${String(ws.getMinutes()).padStart(2, "0")}` : "—";
  const endTime = we ? `${we.getHours()}h:${String(we.getMinutes()).padStart(2, "0")}` : "—";

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-3xl bg-white px-6 py-5 shadow-[0_0_16px_6px_rgba(0,0,0,0.07)]">
      <p className="text-center text-lg font-normal tracking-tight text-foreground">
        {fmtEditionTitle(currentIso)}
      </p>
      <p className="mt-1 text-center text-[11px] text-muted-foreground">
        Les articles disponibles ont été publiés entre :
      </p>

      {/* hatched bar */}
      <div className="relative mt-3 flex w-full max-w-[220px] items-center">
        <div className="absolute left-0 h-2.5 w-0.5 bg-accent" />
        <div
          className="mx-0.5 h-2 flex-1"
          style={{
            background:
              "repeating-linear-gradient(-45deg, transparent, transparent 2.5px, rgba(221,59,49,0.18) 2.5px, rgba(221,59,49,0.18) 5px)",
          }}
        />
        <div className="absolute right-0 h-2.5 w-0.5 bg-accent" />
      </div>

      {/* day labels */}
      <div className="mt-1.5 flex w-full max-w-[220px] justify-between text-[11px] text-foreground">
        <span>{startDay}</span>
        <span>{endDay}</span>
      </div>

      {/* dots + times */}
      <div className="mt-0.5 flex w-full max-w-[220px] justify-between">
        <div className="flex flex-col items-start">
          <span className="mb-0.5 inline-block size-1.5 rounded-full bg-accent" />
          <span className="text-xl font-extralight tracking-tight text-foreground">
            {startTime}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="mb-0.5 inline-block size-1.5 rounded-full bg-accent" />
          <span className="text-xl font-extralight tracking-tight text-foreground">
            {endTime}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── timeline card ─── */

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

  const timelineDays = useMemo(() => {
    const d = new Date(currentIso + "T12:00:00");
    return [-1, 0, 1].map((offset) => {
      const nd = new Date(d);
      nd.setDate(nd.getDate() + offset);
      return nd.toISOString().slice(0, 10);
    });
  }, [currentIso]);

  const isLive = timelineDays.includes(
    new Date(now.toLocaleString("en-US", { timeZone: TZ }))
      .toISOString()
      .slice(0, 10),
  );

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

  const hatchX1 = ws ? Math.max(0, timeToX(ws)) : 0;
  const hatchX2 = we ? Math.min(totalW, timeToX(we)) : 0;
  const hatchW = Math.max(0, hatchX2 - hatchX1);

  const nowX = timeToX(now);
  const showNow = isLive && nowX >= 0 && nowX <= totalW;

  return (
    <div className="relative flex min-w-0 flex-[1.5] flex-col rounded-3xl bg-white px-5 pb-4 pt-5 shadow-[0_0_16px_6px_rgba(0,0,0,0.07)]">
      {/* timeline area */}
      <div className="relative w-full select-none overflow-hidden" style={{ height: TICK_MIDNIGHT_H + 32 }}>
        {/* hatched collection window */}
        {hatchW > 0 && (
          <div
            className="absolute top-1 transition-all duration-300"
            style={{
              left: hatchX1,
              width: hatchW,
              height: TICK_AREA_H,
              background:
                "repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(221,59,49,0.13) 3px, rgba(221,59,49,0.13) 6px)",
            }}
          />
        )}

        {/* ticks */}
        {timelineDays.map((dayIso, dayIdx) =>
          Array.from({ length: 24 }, (_, h) => {
            const x = dayIdx * DAY_PX + (h / 24) * DAY_PX;
            const isMidnight = h === 0;
            const is8h = h === 8;
            const is12h = h === 12 || h === 6 || h === 18;

            const height = isMidnight ? TICK_MIDNIGHT_H : TICK_AREA_H;
            const color = isMidnight
              ? "#191919"
              : is8h
                ? "var(--color-accent)"
                : is12h
                  ? "#817c7c"
                  : "#e7e3e3";
            const top = isMidnight ? 0 : 4;

            return (
              <div
                key={`${dayIso}-${h}`}
                className="absolute transition-colors duration-200"
                style={{
                  left: x,
                  top,
                  width: 1.5,
                  height,
                  backgroundColor: color,
                }}
              />
            );
          }),
        )}

        {/* hour labels */}
        {timelineDays.map((dayIso, dayIdx) =>
          [0, 8].map((h) => {
            const x = dayIdx * DAY_PX + (h / 24) * DAY_PX;
            const is8 = h === 8;
            return (
              <span
                key={`label-${dayIso}-${h}`}
                className="absolute -translate-x-1/2 text-[10px]"
                style={{
                  left: x + 1,
                  top: -13,
                  color: is8 ? "var(--color-accent)" : "#191919",
                }}
              >
                {h}h
              </span>
            );
          }),
        )}

        {/* 8h dots */}
        {timelineDays.map((dayIso, dayIdx) => {
          const x = dayIdx * DAY_PX + (8 / 24) * DAY_PX;
          return (
            <span
              key={`dot-${dayIso}`}
              className="absolute size-1 rounded-full bg-accent"
              style={{ left: x, top: 0 }}
            />
          );
        })}

        {/* Live indicator */}
        {showNow && (
          <>
            <div
              className="absolute top-0 w-[1.5px] bg-[#ee231c]"
              style={{ left: nowX, height: TICK_MIDNIGHT_H + 16 }}
            />
            <span
              className="absolute text-[10px] font-medium text-[#ee231c] motion-safe:animate-pulse"
              style={{ left: nowX + 4, top: -13 }}
            >
              Live
            </span>
          </>
        )}
      </div>

      {/* day labels */}
      <div className="relative mt-1 flex" style={{ width: totalW }}>
        {timelineDays.map((dayIso) => (
          <div
            key={dayIso}
            className="text-center text-[11px] text-foreground"
            style={{ width: DAY_PX }}
          >
            {fmtShortDay(dayIso)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── day selector ─── */

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
    const activeBtn = el.querySelector("[data-active='true']") as HTMLElement;
    if (activeBtn) {
      activeBtn.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }, [currentIso]);

  const scrollBy = useCallback((dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 160, behavior: "smooth" });
  }, []);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => scrollBy(-1)}
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/60"
        aria-label="Jours précédents"
      >
        <ChevronLeft className="size-4" />
      </button>

      <div
        ref={scrollRef}
        className="olj-scrollbar-none flex flex-1 gap-1.5 overflow-x-auto scroll-smooth rounded-md bg-muted/20 p-1.5"
      >
        {days.map((iso) => {
          const isActive = iso === currentIso;
          return (
            <button
              key={iso}
              data-active={isActive}
              onClick={() => onSelect(iso)}
              className={`shrink-0 rounded-md px-3.5 py-2 text-[12px] transition-all duration-150 ${
                isActive
                  ? "bg-white font-medium text-foreground shadow-[0_4px_3px_0_rgba(0,0,0,0.06)]"
                  : "text-foreground/70 hover:bg-white/50 hover:text-foreground active:scale-[0.97]"
              }`}
            >
              {fmtFullDay(iso)}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => scrollBy(1)}
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/60"
        aria-label="Jours suivants"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

/* ─── main export ─── */

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
      {/* top row: info + timeline */}
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

      {/* day selector */}
      <FriseDaySelector
        currentIso={currentIso}
        days={calDays}
        onSelect={unifiedDayNav}
      />

      {/* calendar popover */}
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
