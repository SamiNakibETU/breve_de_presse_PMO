"use client";

/**
 * EditionPeriodFrise — Timeline interactive Figma OLJ.
 *
 * Architecture :
 *   [Info card]  +  [Timeline 3 jours glissable]
 *   [     Sélecteur de jours ◄ · · · ► ]
 *
 * Timezone : Europe/Paris (fenêtres d'édition définies en heure de Paris).
 * Hachure  : SVG pattern 24° `#FF4E08` — fidèle au SVG Figma fourni.
 * Ticks    : minuit #191919 60px | 6/12/18h #817c7c 50px | autres #e7e3e3 38px.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { shiftIsoDate } from "@/lib/beirut-date";
import { EditionCalendarPopover } from "@/components/edition/edition-calendar-popover";

const TZ = "Europe/Paris";
const DAY_PX = 260;       // px par jour dans la timeline
const VISIBLE_DAYS = 3;   // J-1, J, J+1
const SELECTOR_RANGE = 7; // ±7 jours dans le sélecteur

/* ── Géométrie des ticks ──────────────────────────────────────────── */
const TICK_MAJOR_H = 60;   // minuit
const TICK_SEMI_H  = 50;   // 6/12/18h
const TICK_MINOR_H = 38;   // autres heures
const TICK_BOTTOM  = 78;   // Y où tous les ticks se terminent
const LABEL_Y      = 4;    // Y des labels d'heure
const DAY_LABEL_Y  = 84;   // Y des noms de jours
const INNER_H      = 114;  // hauteur totale du canvas scrollable

/* ── Couleurs ─────────────────────────────────────────────────────── */
const COL_DARK   = "#191919";
const COL_SEMI   = "#817c7c";
const COL_LIGHT  = "#e7e3e3";
const COL_ORANGE = "#ff4e08";
const COL_LIVE   = "#ee231c";

/* ── Helpers timezone Paris ───────────────────────────────────────── */

/** Décompose un instant UTC ISO en date/heure locale Paris. */
function parisParts(isoStr: string): { date: string; h: number; min: number } {
  const d = new Date(isoStr);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  const rawH = parseInt(parts.hour, 10);
  return {
    date:  `${parts.year}-${parts.month}-${parts.day}`,
    h:     rawH === 24 ? 0 : rawH,
    min:   parseInt(parts.minute, 10),
  };
}

/**
 * Position X (px) d'un instant UTC dans la timeline.
 * Retourne une valeur négative si l'instant précède le premier jour visible.
 */
function timeToX(isoStr: string, firstDayIso: string): number {
  const { date, h, min } = parisParts(isoStr);
  // Différence en jours de calendrier (arithmétique pure sur dates locales)
  const firstMs = new Date(firstDayIso).getTime();
  const thisMs  = new Date(date).getTime();
  const daysDiff = (thisMs - firstMs) / 86_400_000;
  return (daysDiff + (h + min / 60) / 24) * DAY_PX;
}

/* ── Formatage affichage ──────────────────────────────────────────── */

function fmtEditionTitle(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const day   = d.getDate();
  const month = d.toLocaleDateString("fr-FR", { month: "long" });
  return `Édition du ${day} ${month.charAt(0).toUpperCase() + month.slice(1)}`;
}

function fmtFullDayName(iso: string): string {
  const d   = new Date(iso + "T12:00:00");
  const wd  = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const day = d.getDate();
  const mo  = d.toLocaleDateString("fr-FR", { month: "long" });
  const ds  = day === 1 ? "1er" : String(day);
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${ds} ${mo}`;
}

function fmtDayShortTimeline(iso: string): string {
  const d   = new Date(iso + "T12:00:00");
  const wd  = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const day = d.getDate();
  const ds  = day === 1 ? "1er" : String(day);
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${ds}`;
}

/** "18h" ou "8h30" en heure de Paris, sans ":00" superflu. */
function fmtParisTime(isoStr: string): string {
  const { h, min } = parisParts(isoStr);
  return min === 0 ? `${h}h` : `${h}h${String(min).padStart(2, "0")}`;
}

function fmtParisDateShort(isoStr: string): string {
  const { date } = parisParts(isoStr);
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

function isoRange(center: string, range: number): string[] {
  const days: string[] = [];
  for (let i = -range; i <= range; i++) days.push(shiftIsoDate(center, i));
  return days;
}

/* ── FriseInfoCard ────────────────────────────────────────────────── */

interface InfoCardProps {
  currentIso:   string;
  windowStart?: string;
  windowEnd?:   string;
}

function FriseInfoCard({ currentIso, windowStart, windowEnd }: InfoCardProps) {
  const startDayLabel = windowStart ? fmtParisDateShort(windowStart) : "—";
  const endDayLabel   = windowEnd   ? fmtParisDateShort(windowEnd)   : "—";
  const startTime     = windowStart ? fmtParisTime(windowStart)       : "—";
  const endTime       = windowEnd   ? fmtParisTime(windowEnd)         : "—";

  return (
    <div
      className="flex w-full flex-col items-center justify-center rounded-[24px] bg-white px-5 py-5 sm:min-w-[200px] sm:max-w-[260px]"
      style={{ boxShadow: "0 0 16.2px 6px rgba(0,0,0,0.11)" }}
    >
      {/* Titre édition */}
      <p
        className="text-center text-[22px] leading-tight tracking-tight text-[#191919]"
        style={{ fontWeight: 400 }}
      >
        {fmtEditionTitle(currentIso)}
      </p>

      {/* Sous-titre */}
      <p className="mt-1.5 text-center text-[11px] font-light text-[#191919]/55">
        Articles publiés entre :
      </p>

      {/* Barre hachurée SVG Figma */}
      <div className="relative mt-4 flex w-full max-w-[180px] items-center">
        <div className="h-3 w-0.5 shrink-0" style={{ background: COL_ORANGE }} />
        <svg className="h-[10px] flex-1" preserveAspectRatio="none">
          <defs>
            <pattern
              id="info-hatch"
              width="4" height="4"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(24)"
            >
              <line x1="1" y1="0" x2="1" y2="4" stroke={COL_ORANGE} strokeWidth="1.2" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#info-hatch)" opacity="0.7" />
        </svg>
        <div className="h-3 w-0.5 shrink-0" style={{ background: COL_ORANGE }} />
      </div>

      {/* Labels jours */}
      <div className="mt-1 flex w-full max-w-[180px] justify-between">
        <span className="text-[12px] text-[#191919]">{startDayLabel}</span>
        <span className="text-[12px] text-[#191919]">{endDayLabel}</span>
      </div>

      {/* Points orange + heures */}
      <div className="mt-2 flex w-full max-w-[180px] justify-between">
        <div className="flex flex-col items-start gap-1">
          <span className="inline-block size-2 rounded-full" style={{ background: COL_ORANGE }} />
          <span
            className="text-[22px] leading-none tracking-tight text-[#191919]"
            style={{ fontWeight: 100 }}
          >
            {startTime}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="inline-block size-2 rounded-full" style={{ background: COL_ORANGE }} />
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

/* ── FriseTimelineCard ────────────────────────────────────────────── */

interface TimelineCardProps {
  currentIso:   string;
  windowStart?: string;
  windowEnd?:   string;
}

function FriseTimelineCard({ currentIso, windowStart, windowEnd }: TimelineCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef      = useRef<{ startX: number; scrollLeft: number } | null>(null);
  const [nowIso, setNowIso]         = useState(() => new Date().toISOString());
  const [hoverH, setHoverH]         = useState<{ h: number; x: number } | null>(null);

  /* Horloge Live */
  useEffect(() => {
    const id = setInterval(() => setNowIso(new Date().toISOString()), 10_000);
    return () => clearInterval(id);
  }, []);

  /* Jours visibles : J-1, J, J+1 */
  const timelineDays = useMemo(
    () => [-1, 0, 1].map(offset => shiftIsoDate(currentIso, offset)),
    [currentIso],
  );

  const totalW       = DAY_PX * VISIBLE_DAYS;
  const firstDayIso  = timelineDays[0];

  /* Zone de collecte hachurée */
  const rawX1   = windowStart ? timeToX(windowStart, firstDayIso) : -1;
  const rawX2   = windowEnd   ? timeToX(windowEnd,   firstDayIso) : -1;
  const clampX1 = rawX1 >= 0 ? Math.max(0, rawX1) : -1;
  const clampX2 = rawX2 >= 0 ? Math.min(totalW, rawX2) : -1;
  const collecteX1 = clampX1;
  const collecteW  = clampX1 >= 0 && clampX2 >= 0 ? Math.max(0, clampX2 - clampX1) : 0;

  /* Indicateur Live */
  const nowX    = timeToX(nowIso, firstDayIso);
  const showLive = nowX >= 0 && nowX <= totalW;

  /* Auto-scroll : centrer la fenêtre de collecte au montage */
  useEffect(() => {
    const el = containerRef.current;
    if (!el || collecteX1 < 0 || collecteW <= 0) return;
    const mid = collecteX1 + collecteW / 2;
    el.scrollLeft = Math.max(0, mid - el.clientWidth / 2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowStart, windowEnd]);

  /* Drag-to-scroll */
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    dragRef.current = { startX: e.clientX, scrollLeft: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !containerRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    containerRef.current.scrollLeft = dragRef.current.scrollLeft - dx;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    dragRef.current = null;
    containerRef.current.releasePointerCapture(e.pointerId);
    containerRef.current.style.cursor = "grab";
  }, []);

  /* Tooltip hover */
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x    = e.clientX - rect.left + el.scrollLeft;
    const dayIdx = Math.floor(x / DAY_PX);
    if (dayIdx < 0 || dayIdx >= VISIBLE_DAYS) { setHoverH(null); return; }
    const frac = (x - dayIdx * DAY_PX) / DAY_PX;
    setHoverH({ h: Math.floor(frac * 24), x });
  }, []);

  return (
    <div
      className="relative flex flex-1 items-center overflow-hidden rounded-[24px] bg-white"
      style={{ boxShadow: "0 0 16.2px 6px rgba(0,0,0,0.11)", minHeight: 150 }}
    >
      <div
        ref={containerRef}
        className="olj-scrollbar-none w-full overflow-x-auto"
        style={{ cursor: "grab", touchAction: "pan-x" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverH(null)}
      >
        <div className="relative select-none" style={{ width: totalW, height: INNER_H }}>

          {/* ── Hachure SVG Figma ──────────────────────────────────── */}
          <svg
            className="pointer-events-none absolute inset-0"
            style={{ width: totalW, height: INNER_H }}
          >
            <defs>
              <pattern
                id="tl-hatch"
                width="4" height="4"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(24)"
              >
                <line x1="1" y1="0" x2="1" y2="4" stroke={COL_ORANGE} strokeWidth="1.2" />
              </pattern>
            </defs>
            {collecteW > 0 && (
              <rect
                x={collecteX1}
                y={TICK_BOTTOM - TICK_SEMI_H}
                width={collecteW}
                height={TICK_SEMI_H}
                fill="url(#tl-hatch)"
                opacity="0.65"
              />
            )}
          </svg>

          {/* ── Ticks ──────────────────────────────────────────────── */}
          {timelineDays.map((dayIso, dayIdx) =>
            Array.from({ length: 24 }, (_, h) => {
              const x = dayIdx * DAY_PX + (h / 24) * DAY_PX;
              const isMidnight = h === 0;
              const isSemi     = h === 6 || h === 12 || h === 18;
              let tickH: number; let color: string; let w: number;
              if (isMidnight) {
                tickH = TICK_MAJOR_H; color = COL_DARK; w = 2;
              } else if (isSemi) {
                tickH = TICK_SEMI_H;  color = COL_SEMI; w = 1.5;
              } else {
                tickH = TICK_MINOR_H; color = COL_LIGHT; w = 1;
              }
              return (
                <div
                  key={`${dayIso}-${h}`}
                  className="absolute"
                  style={{
                    left:            x,
                    top:             TICK_BOTTOM - tickH,
                    width:           w,
                    height:          tickH,
                    backgroundColor: color,
                  }}
                />
              );
            }),
          )}

          {/* ── Labels heures : 0, 6, 12, 18 ──────────────────────── */}
          {timelineDays.map((dayIso, dayIdx) =>
            [0, 6, 12, 18].map(h => {
              const x = dayIdx * DAY_PX + (h / 24) * DAY_PX;
              // Le "0h" du premier jour s'aligne à gauche; les autres sont centrés
              const translate = dayIdx === 0 && h === 0 ? "none" : "translateX(-50%)";
              return (
                <span
                  key={`lbl-${dayIso}-${h}`}
                  className="pointer-events-none absolute text-[10px] tabular-nums"
                  style={{
                    left:      x,
                    top:       LABEL_Y,
                    transform: translate,
                    color:     COL_SEMI,
                  }}
                >
                  {h}h
                </span>
              );
            }),
          )}

          {/* ── Barres start/end de la fenêtre de collecte ──────── */}
          {collecteW > 0 && (
            <>
              <div
                className="absolute z-[2]"
                style={{
                  left: collecteX1 - 1,
                  top: LABEL_Y + 10,
                  width: 2,
                  height: TICK_BOTTOM - LABEL_Y - 10,
                  background: COL_ORANGE,
                  borderRadius: 1,
                }}
              />
              <div
                className="absolute z-[2]"
                style={{
                  left: collecteX1 + collecteW - 1,
                  top: LABEL_Y + 10,
                  width: 2,
                  height: TICK_BOTTOM - LABEL_Y - 10,
                  background: COL_ORANGE,
                  borderRadius: 1,
                }}
              />
            </>
          )}

          {/* ── Live ───────────────────────────────────────────────── */}
          {showLive && (
            <>
              <div
                className="absolute"
                style={{
                  left:       nowX,
                  top:        LABEL_Y + 12,
                  width:      2,
                  height:     TICK_BOTTOM - LABEL_Y - 12,
                  background: COL_LIVE,
                }}
              />
              <span
                className="absolute text-[10px] font-semibold"
                style={{ left: nowX + 5, top: LABEL_Y + 12, color: COL_LIVE }}
              >
                Live
              </span>
            </>
          )}

          {/* ── Tooltip survol ─────────────────────────────────────── */}
          {hoverH && (
            <div
              className="pointer-events-none absolute z-10 rounded bg-[#191919] px-1.5 py-0.5 text-[10px] text-white"
              style={{ left: hoverH.x + 8, top: TICK_BOTTOM - 30 }}
            >
              {hoverH.h}h
            </div>
          )}

          {/* ── Noms de jours ──────────────────────────────────────── */}
          {timelineDays.map((dayIso, dayIdx) => {
            const isCurrent = dayIso === currentIso;
            return (
              <div
                key={`day-${dayIso}`}
                className="absolute text-center text-[12px]"
                style={{
                  left:       dayIdx * DAY_PX,
                  top:        DAY_LABEL_Y,
                  width:      DAY_PX,
                  color:      isCurrent ? COL_DARK : "#888",
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

/* ── FriseDaySelector ─────────────────────────────────────────────── */

interface DaySelectorProps {
  currentIso: string;
  days:       string[];
  onSelect:   (iso: string) => void;
}

function FriseDaySelector({ currentIso, days, onSelect }: DaySelectorProps) {
  const railRef  = useRef<HTMLDivElement>(null);
  const dragRef  = useRef<{ startX: number; scrollLeft: number; moved: boolean } | null>(null);
  const currentIdx = days.indexOf(currentIso);

  /* Centrer le jour actif à chaque changement */
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const active = el.querySelector("[data-active='true']") as HTMLElement | null;
    if (active) active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [currentIso]);

  const goLeft  = useCallback(() => {
    if (currentIdx > 0) onSelect(days[currentIdx - 1]);
  }, [currentIdx, days, onSelect]);

  const goRight = useCallback(() => {
    if (currentIdx < days.length - 1) onSelect(days[currentIdx + 1]);
  }, [currentIdx, days, onSelect]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button[data-day-btn]")) return;
    const el = railRef.current;
    if (!el) return;
    dragRef.current = { startX: e.clientX, scrollLeft: el.scrollLeft, moved: false };
    el.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !railRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 4) dragRef.current.moved = true;
    railRef.current.scrollLeft = dragRef.current.scrollLeft - dx;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!railRef.current) return;
    try { railRef.current.releasePointerCapture(e.pointerId); } catch { /* */ }
    dragRef.current = null;
  }, []);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <button
        onClick={goLeft}
        disabled={currentIdx <= 0}
        aria-label="Jour précédent"
        className="flex h-[36px] w-7 shrink-0 items-center justify-center rounded-[8px] text-[#191919]/50 transition-colors hover:bg-muted/40 hover:text-[#191919] disabled:opacity-25"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M7 1L3 5L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        ref={railRef}
        className="olj-scrollbar-none min-w-0 flex-1 overflow-x-auto rounded-[10px] p-1"
        style={{ background: "rgba(231,227,227,0.22)", height: 44, cursor: "grab", touchAction: "pan-x" }}
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
                data-day-btn
                data-active={isActive}
                onClick={() => onSelect(iso)}
                className="shrink-0 cursor-pointer whitespace-nowrap rounded-[8px] px-3.5 text-[12px] transition-all duration-150 hover:bg-white/80"
                style={{
                  height:     36,
                  minWidth:   130,
                  background: isActive ? "white" : "transparent",
                  boxShadow:  isActive ? "0 1px 4px 0 rgba(0,0,0,0.08)" : "none",
                  color:      isActive ? COL_DARK : "#888",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {fmtFullDayName(iso)}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={goRight}
        disabled={currentIdx >= days.length - 1}
        aria-label="Jour suivant"
        className="flex h-[36px] w-7 shrink-0 items-center justify-center rounded-[8px] text-[#191919]/50 transition-colors hover:bg-muted/40 hover:text-[#191919] disabled:opacity-25"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M3 1L7 5L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

/* ── Export principal ─────────────────────────────────────────────── */

interface EditionPeriodFriseProps {
  currentIso:      string;
  editionWindow?:  { start: string; end: string };
  unifiedDayNav:   (isoDate: string) => void;
}

export const EditionPeriodFrise = function EditionPeriodFrise({
  currentIso,
  editionWindow,
  unifiedDayNav,
}: EditionPeriodFriseProps) {
  const calDays = useMemo(() => isoRange(currentIso, SELECTOR_RANGE), [currentIso]);

  return (
    <nav className="w-full min-w-0 max-w-full space-y-3" aria-label="Navigation temporelle de l'édition">
      <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row">
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
      <div className="flex min-w-0 w-full max-w-full items-center gap-2">
        <FriseDaySelector
          currentIso={currentIso}
          days={calDays}
          onSelect={unifiedDayNav}
        />
        <EditionCalendarPopover
          className="shrink-0"
          currentIso={currentIso}
          compact
          onDateSelect={unifiedDayNav}
        />
      </div>
    </nav>
  );
};
