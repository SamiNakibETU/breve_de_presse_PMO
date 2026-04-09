"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { FriseLabAnchorMarkers } from "@/components/design-frise/frise-lab-anchor-markers";
import {
  labFormatBoundaryDateTimeFr,
  labFormatDayShortFr,
} from "@/components/design-frise/frise-lab-datetime";
import { FriseLabRichTicks } from "@/components/design-frise/frise-lab-rich-ticks";
import { LAB_DAY_ANCHORS } from "@/components/design-frise/frise-lab-metrics";
import { FriseLabScrollTrack } from "@/components/design-frise/frise-lab-scroll-track";
import {
  type EditionFriseLabController,
  useEditionFriseLab,
} from "@/components/design-frise/use-edition-frise-lab";

/* ─── Dimensions ─────────────────────────────────────────── */

const RICH_RAIL_H = 96;
const ANCHOR_ROW_PX = 22;
const TOTAL_TRACK_H = RICH_RAIL_H + ANCHOR_ROW_PX;

/* ─── Piste partagée ─────────────────────────────────────── */

function RichRail({ c }: { c: EditionFriseLabController }): ReactElement {
  return (
    <div className="relative w-full">
      <FriseLabScrollTrack
        variant="bare"
        readOnly={false}
        scrubCursor
        scrollRef={c.scrollRef}
        padPx={c.padPx}
        railHeightPx={TOTAL_TRACK_H}
        railAriaLabel="Frise éditions — glisser horizontalement pour choisir un jour"
        onKeyDown={c.onKeyDown}
        onScroll={c.readViewportAnchor}
        onPointerDown={c.onPointerDown}
        onPointerMove={c.onPointerMove}
        onPointerUp={c.onPointerUp}
        onPointerCancel={c.onPointerCancel}
      >
        <div className="relative" style={{ width: c.w, height: TOTAL_TRACK_H }}>
          <div className="absolute inset-x-0 bottom-0" style={{ height: TOTAL_TRACK_H }}>
            <div className="relative w-full" style={{ height: RICH_RAIL_H }}>
              <FriseLabRichTicks startH={c.startH} endH={c.endH} railH={RICH_RAIL_H} showHourLabels />
            </div>
            <FriseLabAnchorMarkers selectedAnchorHour={c.viewportAnchorHour} density="ryo" />
          </div>
        </div>
      </FriseLabScrollTrack>

      {/* Aiguille rouge — dot en haut + trait + halo */}
      <div
        className="pointer-events-none absolute inset-0 z-20 flex justify-center"
        aria-hidden
      >
        <div className="relative flex h-full flex-col items-center">
          {/* Dot */}
          <div className="mt-0 size-[5px] rounded-full bg-[var(--color-accent)] shadow-[0_0_0_2px_rgba(255,255,255,0.95),0_0_6px_2px_color-mix(in_srgb,var(--color-accent)_35%,transparent)]" />
          {/* Ligne */}
          <div className="flex-1 w-px bg-[var(--color-accent)] shadow-[0_0_0_0.5px_rgba(255,255,255,0.85)]" />
        </div>
      </div>
    </div>
  );
}

/* ─── Calendrier segmenté (style Cursor tabs) ────────────── */

function SegmentedCalendar({ c }: { c: EditionFriseLabController }): ReactElement {
  return (
    <div className="flex items-center rounded-[10px] bg-muted/30 p-[3px]">
      {LAB_DAY_ANCHORS.map((d) => {
        const on = d.anchorHour === c.viewportAnchorHour;
        const parts = d.label.split(". ");
        const week = parts[0] ?? "";
        const day = parts[1] ?? "";
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => c.scrollToHour(d.anchorHour, "smooth")}
            aria-label={d.title}
            aria-pressed={on}
            className={`flex min-h-[2.35rem] flex-1 flex-col items-center justify-center rounded-[7px] px-1.5 py-1 transition-all duration-200 ease-out ${
              on
                ? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_0_0_0.5px_rgba(0,0,0,0.05)]"
                : "text-muted-foreground/70 hover:text-muted-foreground"
            }`}
          >
            <span
              className={`block text-[7.5px] uppercase leading-none tracking-[0.1em] transition-opacity duration-200 ${
                on ? "opacity-55" : "opacity-50"
              }`}
            >
              {week}
            </span>
            <span
              className={`mt-0.5 block text-[12px] font-medium tabular-nums leading-none transition-[font-weight] duration-200 ${
                on ? "font-semibold" : "font-normal"
              }`}
            >
              {day}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Version finale ──────────────────────────────────────── */

/**
 * Fusion A (Signal, grand mono full-width) + B (chips) enrichie de :
 * — fade animé du titre + de la période collecte au changement de jour
 * — transitions CSS 500 ms sur les ticks (couleur + hauteur)
 * — aiguille rouge avec dot + halo
 * — calendrier segmenté « Cursor tabs »
 */
export function EditionFriseLabFinal(): ReactElement {
  const c = useEditionFriseLab();

  /* ── Fade animé sur changement de jour ── */
  const [visible, setVisible] = useState(true);
  const [display, setDisplay] = useState<{
    day: (typeof LAB_DAY_ANCHORS)[number];
    startH: number;
    endH: number;
  }>({ day: c.day, startH: c.startH, endH: c.endH });

  const prevId = useRef(c.day.id);
  useEffect(() => {
    if (prevId.current === c.day.id) {
      return;
    }
    prevId.current = c.day.id;
    setVisible(false);
    const t = setTimeout(() => {
      setDisplay({ day: c.day, startH: c.startH, endH: c.endH });
      setVisible(true);
    }, 180);
    return () => clearTimeout(t);
  }, [c.day, c.startH, c.endH]);

  const startMeta = labFormatBoundaryDateTimeFr(display.startH);
  const endMeta = labFormatBoundaryDateTimeFr(display.endH);
  const startDay = labFormatDayShortFr(display.startH);
  const endDay = labFormatDayShortFr(display.endH);

  const fadeClass = `transition-[opacity,transform] duration-[180ms] ease-out ${
    visible ? "translate-y-0 opacity-100" : "-translate-y-[3px] opacity-0"
  }`;

  return (
    <article className="mx-auto w-full max-w-[34rem] overflow-hidden px-0 py-4">
      {/* Kicker */}
      <p className="text-[10px] font-medium uppercase tracking-[0.36em] text-muted-foreground/70">
        Édition
      </p>

      {/* Titre animé */}
      <h2 className={`mt-2.5 font-sans text-[1.45rem] font-light tracking-[-0.03em] text-foreground sm:text-[1.85rem] sm:tracking-[-0.035em] ${fadeClass}`}>
        {display.day.title}
      </h2>

      {/* Séparateur */}
      <div className="mt-8 h-px bg-gradient-to-r from-transparent via-border/55 to-transparent" />

      {/* Fenêtre collecte — full width, deux colonnes mono */}
      <div className={`mt-7 flex items-end justify-between gap-4 ${fadeClass}`}>
        <div>
          <p className="font-mono text-[1.6rem] font-extralight tabular-nums leading-none tracking-[-0.025em] text-foreground sm:text-[2.05rem]">
            {startMeta.time}
          </p>
          <p className="mt-2 text-[9px] font-normal uppercase tracking-[0.2em] text-muted-foreground/75 sm:text-[9.5px] sm:tracking-[0.22em]">
            {startDay}
          </p>
        </div>

        {/* Ligne pointillée centrale — masquée sur très petits écrans */}
        <div className="mb-5 hidden min-w-0 flex-1 sm:block">
          <div
            className="h-px w-full"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg,color-mix(in srgb,var(--color-foreground) 14%,transparent) 0,color-mix(in srgb,var(--color-foreground) 14%,transparent) 2px,transparent 2px,transparent 7px)",
            }}
          />
        </div>
        <div className="mb-5 block min-w-2 flex-1 sm:hidden" />

        <div className="text-right">
          <p className="font-mono text-[1.6rem] font-extralight tabular-nums leading-none tracking-[-0.025em] text-foreground sm:text-[2.05rem]">
            {endMeta.time}
          </p>
          <p className="mt-2 text-[9px] font-normal uppercase tracking-[0.2em] text-muted-foreground/75 sm:text-[9.5px] sm:tracking-[0.22em]">
            {endDay}
          </p>
        </div>
      </div>

      {/* Frise */}
      <div className="mt-7">
        <RichRail c={c} />
      </div>
      <p className="mt-3 text-center text-[10px] italic text-muted-foreground/42">
        Période couverte par la revue
      </p>

      {/* Navigation */}
      <div className="mt-9 flex items-center gap-2">
        <button
          type="button"
          aria-label="Jour précédent"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-lg text-muted-foreground/60 transition-all duration-150 hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
          disabled={c.idx <= 0}
          onClick={c.onPrev}
        >
          ‹
        </button>

        <div className="flex-1">
          <SegmentedCalendar c={c} />
        </div>

        <button
          type="button"
          aria-label="Jour suivant"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-lg text-muted-foreground/60 transition-all duration-150 hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
          disabled={c.idx < 0 || c.idx >= LAB_DAY_ANCHORS.length - 1}
          onClick={c.onNext}
        >
          ›
        </button>
      </div>

      <span className="sr-only" aria-live="polite">
        Édition sélectionnée : {display.day.title}
      </span>
    </article>
  );
}

/* ─── Variantes A / B / C — conservées pour la section lab ── */

export function EditionFriseLabRichSignal(): ReactElement {
  const c = useEditionFriseLab();
  const startMeta = labFormatBoundaryDateTimeFr(c.startH);
  const endMeta = labFormatBoundaryDateTimeFr(c.endH);
  const startDay = labFormatDayShortFr(c.startH);
  const endDay = labFormatDayShortFr(c.endH);

  return (
    <article className="mx-auto max-w-xl px-2 py-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-muted-foreground">Édition</p>
      <h2 className="mt-3 font-sans text-[1.7rem] font-light tracking-[-0.03em] text-foreground sm:text-3xl">
        {c.day.title}
      </h2>
      <div className="mt-9 flex items-center justify-center gap-6">
        <div className="text-right">
          <p className="font-mono text-[2rem] font-thin tabular-nums leading-none tracking-[-0.04em] text-foreground">
            {startMeta.time}
          </p>
          <p className="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{startDay}</p>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className="h-px w-10 bg-border/60" />
          <div className="h-1 w-1 rounded-full bg-border/40" />
        </div>
        <div className="text-left">
          <p className="font-mono text-[2rem] font-thin tabular-nums leading-none tracking-[-0.04em] text-foreground">
            {endMeta.time}
          </p>
          <p className="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{endDay}</p>
        </div>
      </div>
      <div className="mt-10">
        <RichRail c={c} />
        <p className="mt-3.5 text-center text-[10px] italic text-muted-foreground/60">
          Période couverte par la revue
        </p>
      </div>
      <div className="mt-10 flex items-center gap-2">
        <button
          type="button"
          aria-label="Jour précédent"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-lg text-muted-foreground/60 transition-all hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
          disabled={c.idx <= 0}
          onClick={c.onPrev}
        >
          ‹
        </button>
        <div className="flex-1">
          <SegmentedCalendar c={c} />
        </div>
        <button
          type="button"
          aria-label="Jour suivant"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-lg text-muted-foreground/60 transition-all hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
          disabled={c.idx < 0 || c.idx >= LAB_DAY_ANCHORS.length - 1}
          onClick={c.onNext}
        >
          ›
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{c.day.title}</span>
    </article>
  );
}

export function EditionFriseLabRichStamp(): ReactElement {
  const c = useEditionFriseLab();
  const startMeta = labFormatBoundaryDateTimeFr(c.startH);
  const endMeta = labFormatBoundaryDateTimeFr(c.endH);
  const startDay = labFormatDayShortFr(c.startH);
  const endDay = labFormatDayShortFr(c.endH);

  return (
    <article className="mx-auto max-w-xl px-2 py-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-muted-foreground">Édition</p>
        <p className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
          {c.idx + 1} / {LAB_DAY_ANCHORS.length}
        </p>
      </div>
      <h2 className="mt-3 font-sans text-[1.7rem] font-light tracking-[-0.03em] text-foreground sm:text-3xl">
        {c.day.title}
      </h2>
      <div className="mt-10">
        <RichRail c={c} />
      </div>
      <div className="mt-7 flex items-center justify-center gap-2">
        <div className="flex flex-col items-center rounded-md border border-border/50 px-4 py-2.5 text-center">
          <span className="font-mono text-[11px] tabular-nums uppercase tracking-[0.12em] text-muted-foreground">
            {startDay}
          </span>
          <span className="mt-1 font-mono text-xl font-light tabular-nums leading-none text-foreground">
            {startMeta.time}
          </span>
        </div>
        <svg className="shrink-0 text-border/60" width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden>
          <path
            d="M1 5h14M10 1l5 4-5 4"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="flex flex-col items-center rounded-md border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/[0.03] px-4 py-2.5 text-center">
          <span className="font-mono text-[11px] tabular-nums uppercase tracking-[0.12em] text-muted-foreground">
            {endDay}
          </span>
          <span className="mt-1 font-mono text-xl font-light tabular-nums leading-none text-foreground">
            {endMeta.time}
          </span>
        </div>
      </div>
      <div className="mt-9 flex items-center gap-2">
        <button
          type="button"
          aria-label="Jour précédent"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-lg text-muted-foreground/60 transition-all hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
          disabled={c.idx <= 0}
          onClick={c.onPrev}
        >
          ‹
        </button>
        <div className="flex-1">
          <SegmentedCalendar c={c} />
        </div>
        <button
          type="button"
          aria-label="Jour suivant"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-lg text-muted-foreground/60 transition-all hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
          disabled={c.idx < 0 || c.idx >= LAB_DAY_ANCHORS.length - 1}
          onClick={c.onNext}
        >
          ›
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{c.day.title}</span>
    </article>
  );
}

export function EditionFriseLabRichGrid(): ReactElement {
  const c = useEditionFriseLab();
  const startMeta = labFormatBoundaryDateTimeFr(c.startH);
  const endMeta = labFormatBoundaryDateTimeFr(c.endH);
  const startDay = labFormatDayShortFr(c.startH);
  const endDay = labFormatDayShortFr(c.endH);

  return (
    <article className="mx-auto max-w-xl px-2 py-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-muted-foreground">Édition</p>
      <div className="mt-3 flex items-end gap-6">
        <h2 className="font-sans text-[1.7rem] font-light tracking-[-0.03em] text-foreground sm:text-3xl">
          {c.day.title}
        </h2>
        <div className="mx-auto grid max-w-xs grid-cols-[1fr_auto_1fr] items-center gap-x-4">
          <div className="text-right">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">début</p>
            <p className="mt-1 font-mono text-2xl font-extralight tabular-nums leading-none text-foreground">
              {startMeta.time}
            </p>
            <p className="mt-1 text-[11px] capitalize text-muted-foreground">{startDay}</p>
          </div>
          <div className="flex h-full flex-col items-center justify-center gap-1 py-1">
            <div className="h-12 w-px bg-border/40" />
          </div>
          <div className="text-left">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">fin</p>
            <p className="mt-1 font-mono text-2xl font-extralight tabular-nums leading-none text-foreground">
              {endMeta.time}
            </p>
            <p className="mt-1 text-[11px] capitalize text-muted-foreground">{endDay}</p>
          </div>
        </div>
      </div>
      <div className="mt-10">
        <RichRail c={c} />
      </div>
      <div className="mt-9 flex items-center gap-2">
        <button
          type="button"
          aria-label="Jour précédent"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-lg text-muted-foreground/60 transition-all hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
          disabled={c.idx <= 0}
          onClick={c.onPrev}
        >
          ‹
        </button>
        <div className="flex-1">
          <SegmentedCalendar c={c} />
        </div>
        <button
          type="button"
          aria-label="Jour suivant"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-lg text-muted-foreground/60 transition-all hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
          disabled={c.idx < 0 || c.idx >= LAB_DAY_ANCHORS.length - 1}
          onClick={c.onNext}
        >
          ›
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{c.day.title}</span>
    </article>
  );
}
