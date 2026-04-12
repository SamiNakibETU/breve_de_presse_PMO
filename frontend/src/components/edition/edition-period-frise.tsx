"use client";

/**
 * EditionPeriodFrise — Timeline interactive fidèle au Figma OLJ.
 *
 * Layout (3 blocs) :
 * ┌─────────────────────┐  ┌────────────────────────────────────────┐
 * │  Carte Info          │  │  Timeline 3 jours (ticks hiérarchiques)│
 * │  "Édition du 3 Avr" │  │  Zone collecte hachurée · Live rouge   │
 * │  8h:00 ··· 18h:00   │  │  Glissable (drag + touch)             │
 * └─────────────────────┘  └────────────────────────────────────────┘
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  ◄  Dimanche 31 mars  │  Lundi 1er avril  │  ■ Mardi 2 avril  ►│
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Chaque flèche navigue d'un jour (discret).
 * Le rail de jours est glissable (pointer events + touch).
 * La timeline affiche un tooltip heure au survol.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { shiftIsoDate } from "@/lib/beirut-date";

const TZ = "Asia/Beirut";
const DAY_PX = 220;          // largeur d'un jour dans la timeline
const VISIBLE_DAYS = 3;      // J-1, J, J+1
const SELECTOR_RANGE = 4;    // ±4 jours dans le sélecteur

/* ── Niveaux de ticks (Figma) ──────────────────────────────────────
 * Majeur    0h        : #191919, 60px
 * Semi-maj  6h/12/18  : #817c7c, 50px
 * Secondaire 3h/9/15/21 : #e7e3e3, 50px
 * Mineur    autres heures : #e7e3e3, 38px
 * 8h        : #ff4e08, 50px + point orange au-dessus
 */
const TICK_MAJOR_H = 60;
const TICK_SEMI_H = 50;
const TICK_MINOR_H = 38;
const TICK_8H_H = 50;
const TIMELINE_TOTAL_H = 72; // zone ticks + labels

const COL_DARK = "#191919";
const COL_SEMI = "#817c7c";
const COL_LIGHT = "#e7e3e3";
const COL_ORANGE = "#ff4e08";
const COL_LIVE = "#ee231c";

/* ── Helpers ───────────────────────────────────────────────────── */

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

/** "Dimanche 31 mars" — nom complet pour le sélecteur */
function fmtFullDayName(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const wd = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const day = d.getDate();
  const month = d.toLocaleDateString("fr-FR", { month: "long" });
  const dayStr = day === 1 ? "1er" : String(day);
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dayStr} ${month}`;
}

/** "Lundi 1" — court pour la timeline */
function fmtDayShortTimeline(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const wd = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const day = d.getDate();
  const dayStr = day === 1 ? "1er" : String(day);
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dayStr}`;
}

function fmtTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return m === 0 ? `${h}h:00` : `${h}h${String(m).padStart(2, "0")}`;
}

function fmtTimeHour(h: number): string {
  return `${h}h`;
}

function beirutNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}

function parseToLocal(isoStr: string): Date {
  return new Date(new Date(isoStr).toLocaleString("en-US", { timeZone: TZ }));
}

/* ── Carte Info (gauche) ────────────────────────────────────────── */

interface InfoCardProps {
  currentIso: string;
  windowStart?: string;
  windowEnd?: string;
}

function FriseInfoCard({ currentIso, windowStart, windowEnd }: InfoCardProps) {
  const ws = windowStart ? parseToLocal(windowStart) : null;
  const we = windowEnd ? parseToLocal(windowEnd) : null;

  const startDayLabel = ws
    ? ws.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })
    : "—";
  const endDayLabel = we
    ? we.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })
    : "—";
  const startTime = ws ? fmtTime(ws) : "—";
  const endTime = we ? fmtTime(we) : "—";

  return (
    <div
      className="flex min-w-[220px] max-w-[280px] flex-col items-center justify-center rounded-[24px] bg-white px-5 py-5"
      style={{ boxShadow: "0 0 16.2px 6px rgba(0,0,0,0.11)" }}
    >
      {/* Titre édition */}
      <p
        className="text-center text-[22px] leading-tight tracking-tight text-[#191919]"
        style={{ fontFamily: "inherit", fontWeight: 400 }}
      >
        {fmtEditionTitle(currentIso)}
      </p>

      {/* Sous-titre */}
      <p className="mt-1.5 text-center text-[12px] font-light text-[#191919]/60">
        Les articles disponibles ont été publiés entre :
      </p>

      {/* Barre hachurée collecte */}
      <div className="relative mt-4 flex w-full max-w-[180px] items-center">
        {/* Marqueur gauche */}
        <div className="h-3 w-0.5 shrink-0" style={{ background: COL_ORANGE }} />
        {/* Segment hachuré */}
        <div
          className="h-[10px] flex-1"
          style={{
            background: `repeating-linear-gradient(-45deg, transparent, transparent 3px, ${COL_ORANGE}55 3px, ${COL_ORANGE}55 6px)`,
          }}
        />
        {/* Marqueur droit */}
        <div className="h-3 w-0.5 shrink-0" style={{ background: COL_ORANGE }} />
      </div>

      {/* Labels jours */}
      <div className="mt-1 flex w-full max-w-[180px] justify-between">
        <span className="text-[12px] text-[#191919]">{startDayLabel}</span>
        <span className="text-[12px] text-[#191919]">{endDayLabel}</span>
      </div>

      {/* Points orange */}
      <div className="mt-2 flex w-full max-w-[180px] justify-between">
        <div className="flex flex-col items-start gap-1">
          <span
            className="inline-block size-2 rounded-full"
            style={{ background: COL_ORANGE }}
          />
          <span
            className="text-[22px] leading-none tracking-tight text-[#191919]"
            style={{ fontWeight: 100 }}
          >
            {startTime}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className="inline-block size-2 rounded-full"
            style={{ background: COL_ORANGE }}
          />
          <span
            className="text-[22px] leading-none tracking-tight text-[#191919]"
            style={{ fontWeight: 100 }}
          >
            {endTime}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Timeline Card (droite) — draggable ────────────────────────── */

interface TimelineCardProps {
  currentIso: string;
  windowStart?: string;
  windowEnd?: string;
}

function FriseTimelineCard({ currentIso, windowStart, windowEnd }: TimelineCardProps) {
  const [now, setNow] = useState(beirutNow);
  const [hoverHour, setHoverHour] = useState<{ h: number; x: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* LIVE clock */
  useEffect(() => {
    const id = setInterval(() => setNow(beirutNow()), 30_000);
    return () => clearInterval(id);
  }, []);

  /* Drag-to-scroll */
  const dragState = useRef<{ startX: number; scrollLeft: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    dragState.current = { startX: e.clientX, scrollLeft: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !containerRef.current) return;
    const dx = e.clientX - dragState.current.startX;
    containerRef.current.scrollLeft = dragState.current.scrollLeft - dx;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    dragState.current = null;
    containerRef.current.releasePointerCapture(e.pointerId);
    containerRef.current.style.cursor = "grab";
  }, []);

  /* 3 jours : J-1, J, J+1 */
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
    const dayIso = d.toISOString().slice(0, 10);
    const dayIdx = timelineDays.indexOf(dayIso);
    if (dayIdx < 0) {
      if (d < new Date(timelineDays[0] + "T00:00:00")) return 0;
      return totalW;
    }
    const hours = d.getHours() + d.getMinutes() / 60;
    return dayIdx * DAY_PX + (hours / 24) * DAY_PX;
  }

  /* Fenêtre collecte */
  const collecteX1 = ws ? Math.max(0, timeToX(ws)) : -1;
  const collecteX2 = we ? Math.min(totalW, timeToX(we)) : -1;
  const collecteW = collecteX1 >= 0 && collecteX2 >= 0 ? Math.max(0, collecteX2 - collecteX1) : 0;

  /* Indicateur LIVE */
  const nowDayIso = (() => {
    const d = new Date(now);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const isLive = timelineDays.includes(nowDayIso);
  const nowX = isLive ? timeToX(now) : -1;
  const showNow = isLive && nowX >= 0 && nowX <= totalW;

  /* Hover heure */
  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const dayIdx = Math.floor(x / DAY_PX);
    if (dayIdx < 0 || dayIdx >= VISIBLE_DAYS) { setHoverHour(null); return; }
    const fracInDay = (x - dayIdx * DAY_PX) / DAY_PX;
    const h = Math.floor(fracInDay * 24);
    setHoverHour({ h, x });
  }

  return (
    <div
      className="relative flex-1 overflow-hidden rounded-[24px] bg-white"
      style={{ boxShadow: "0 0 16.2px 6px rgba(0,0,0,0.11)", minHeight: 150 }}
    >
      <div
        ref={containerRef}
        className="olj-scrollbar-none overflow-x-auto"
        style={{ cursor: "grab", touchAction: "pan-x" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverHour(null)}
      >
        <div
          className="relative select-none"
          style={{ width: totalW, height: TIMELINE_TOTAL_H + 32 }}
        >
          {/* Zone collecte hachurée */}
          {collecteW > 0 && (
            <div
              className="absolute"
              style={{
                left: collecteX1,
                top: 18,
                width: collecteW,
                height: TICK_SEMI_H,
                background: `repeating-linear-gradient(-45deg, transparent, transparent 3px, ${COL_ORANGE}33 3px, ${COL_ORANGE}33 6px)`,
              }}
            />
          )}

          {/* Ticks par jour */}
          {timelineDays.map((dayIso, dayIdx) =>
            Array.from({ length: 24 }, (_, h) => {
              const x = dayIdx * DAY_PX + (h / 24) * DAY_PX;
              const isMidnight = h === 0;
              const isSemiMajor = h === 6 || h === 12 || h === 18;
              const is8h = h === 8;
              const isSecondary = h === 3 || h === 9 || h === 15 || h === 21;

              let tickH: number;
              let color: string;
              let width: number;

              if (isMidnight) {
                tickH = TICK_MAJOR_H; color = COL_DARK; width = 2;
              } else if (is8h) {
                tickH = TICK_8H_H; color = COL_ORANGE; width = 2;
              } else if (isSemiMajor) {
                tickH = TICK_SEMI_H; color = COL_SEMI; width = 2;
              } else if (isSecondary) {
                tickH = TICK_SEMI_H; color = COL_LIGHT; width = 1;
              } else {
                tickH = TICK_MINOR_H; color = COL_LIGHT; width = 1;
              }

              const top = TICK_MAJOR_H - tickH + 18;

              return (
                <div
                  key={`${dayIso}-${h}`}
                  className="absolute"
                  style={{ left: x, top, width, height: tickH, backgroundColor: color }}
                />
              );
            }),
          )}

          {/* Labels heures : 0h, 8h (accent), 12h, 18h */}
          {timelineDays.map((dayIso, dayIdx) =>
            [0, 8, 12, 18].map((h) => {
              const x = dayIdx * DAY_PX + (h / 24) * DAY_PX;
              const isOrange = h === 8;
              return (
                <span
                  key={`lbl-${dayIso}-${h}`}
                  className="pointer-events-none absolute -translate-x-1/2 text-[10px] tabular-nums"
                  style={{
                    left: x,
                    top: 4,
                    color: isOrange ? COL_ORANGE : "#888",
                    fontWeight: isOrange ? 600 : 400,
                  }}
                >
                  {fmtTimeHour(h)}
                </span>
              );
            }),
          )}

          {/* Points 8h orange */}
          {timelineDays.map((dayIso, dayIdx) => {
            const x = dayIdx * DAY_PX + (8 / 24) * DAY_PX;
            return (
              <span
                key={`dot8-${dayIso}`}
                className="absolute inline-block size-[4px] rounded-full"
                style={{ left: x - 2, top: 14, background: COL_ORANGE }}
              />
            );
          })}

          {/* Indicateur LIVE */}
          {showNow && (
            <>
              <div
                className="absolute"
                style={{
                  left: nowX,
                  top: 0,
                  width: 2,
                  height: 100,
                  background: COL_LIVE,
                }}
              />
              <span
                className="absolute text-[12px] font-light text-[#191919]"
                style={{ left: nowX + 5, top: 4 }}
              >
                Live
              </span>
            </>
          )}

          {/* Tooltip heure au survol */}
          {hoverHour && (
            <div
              className="pointer-events-none absolute z-10 rounded bg-[#191919] px-1.5 py-0.5 text-[10px] text-white"
              style={{ left: hoverHour.x + 6, top: TICK_MAJOR_H - 10 }}
            >
              {fmtTimeHour(hoverHour.h)}
            </div>
          )}

          {/* Labels jours (bas) */}
          {timelineDays.map((dayIso, dayIdx) => {
            const isCurrent = dayIso === currentIso;
            return (
              <div
                key={`day-${dayIso}`}
                className="absolute text-center text-[12px]"
                style={{
                  left: dayIdx * DAY_PX,
                  top: TICK_MAJOR_H + 20,
                  width: DAY_PX,
                  color: isCurrent ? COL_DARK : "#888",
                  fontWeight: isCurrent ? 600 : 400,
                }}
              >
                {fmtDayShortTimeline(dayIso)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Sélecteur de jours — draggable ────────────────────────────── */

interface DaySelectorProps {
  currentIso: string;
  days: string[];
  onSelect: (iso: string) => void;
}

function FriseDaySelector({ currentIso, days, onSelect }: DaySelectorProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; scrollLeft: number; moved: boolean } | null>(null);

  /* Centrer le jour actif */
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const active = el.querySelector("[data-active='true']") as HTMLElement | null;
    if (active) {
      active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }, [currentIso]);

  /* Navigation discrète par jour */
  const currentIdx = days.indexOf(currentIso);

  const goLeft = useCallback(() => {
    if (currentIdx > 0) onSelect(days[currentIdx - 1]);
  }, [currentIdx, days, onSelect]);

  const goRight = useCallback(() => {
    if (currentIdx < days.length - 1) onSelect(days[currentIdx + 1]);
  }, [currentIdx, days, onSelect]);

  /* Drag-to-scroll */
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = railRef.current;
    if (!el) return;
    dragState.current = { startX: e.clientX, scrollLeft: el.scrollLeft, moved: false };
    el.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !railRef.current) return;
    const dx = e.clientX - dragState.current.startX;
    if (Math.abs(dx) > 4) dragState.current.moved = true;
    railRef.current.scrollLeft = dragState.current.scrollLeft - dx;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!railRef.current) return;
    railRef.current.releasePointerCapture(e.pointerId);
    dragState.current = null;
  }, []);

  /* Click sur un jour — seulement si pas de drag */
  function handleDayClick(iso: string, e: React.MouseEvent) {
    if (dragState.current?.moved) { e.preventDefault(); return; }
    onSelect(iso);
  }

  /* Flèche SVG triangulaire */
  const ArrowLeft = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M7 1L3 5L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  const ArrowRight = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M3 1L7 5L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  return (
    <div className="flex items-center gap-1.5">
      {/* Flèche gauche */}
      <button
        onClick={goLeft}
        disabled={currentIdx <= 0}
        className="flex shrink-0 items-center justify-center rounded-[5px] text-[#191919]/60 transition-colors hover:text-[#191919] disabled:opacity-30"
        style={{
          width: 32,
          height: 38,
          background: "rgba(231,227,227,0.33)",
        }}
        aria-label="Jour précédent"
      >
        <ArrowLeft />
      </button>

      {/* Rail de jours glissable */}
      <div
        ref={railRef}
        className="olj-scrollbar-none flex-1 overflow-x-auto rounded-[5px] p-1.5"
        style={{
          background: "rgba(231,227,227,0.33)",
          height: 50,
          cursor: "grab",
          touchAction: "pan-x",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="flex h-full gap-1">
          {days.map((iso) => {
            const isActive = iso === currentIso;
            return (
              <button
                key={iso}
                data-active={isActive}
                onClick={(e) => handleDayClick(iso, e)}
                className="shrink-0 whitespace-nowrap rounded-[5px] px-3 text-[12px] transition-all duration-100"
                style={{
                  height: 38,
                  minWidth: 147,
                  background: isActive ? "white" : "rgba(231,227,227,0.16)",
                  boxShadow: isActive ? "0 4px 2.5px 0 rgba(0,0,0,0.06)" : "none",
                  color: isActive ? COL_DARK : "#888",
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                {fmtFullDayName(iso)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Flèche droite */}
      <button
        onClick={goRight}
        disabled={currentIdx >= days.length - 1}
        className="flex shrink-0 items-center justify-center rounded-[5px] text-[#191919]/60 transition-colors hover:text-[#191919] disabled:opacity-30"
        style={{
          width: 32,
          height: 38,
          background: "rgba(231,227,227,0.33)",
        }}
        aria-label="Jour suivant"
      >
        <ArrowRight />
      </button>
    </div>
  );
}

/* ── Export principal ───────────────────────────────────────────── */

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
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
    </nav>
  );
};
