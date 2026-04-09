"use client";

import { useMemo, type ReactElement, type ReactNode } from "react";
import {
  LAB_COLLECT,
  LAB_LAST_H,
  LAB_PX_PER_HOUR,
  LAB_TICK,
  labHourToPx,
} from "@/components/design-frise/frise-lab-metrics";

const LABEL_ROW_PX = 18;
export const FRISE_LAB_TICK_BASELINE_PX = LABEL_ROW_PX;

type TickKind = "edge" | "midnight" | "collect" | "minorStrong" | "minor";

function tickKind(h: number): TickKind {
  if (h === LAB_COLLECT.startH || h === LAB_COLLECT.endH) {
    return "edge";
  }
  if (h % 24 === 0) {
    return "midnight";
  }
  if (h > LAB_COLLECT.startH && h < LAB_COLLECT.endH) {
    return "collect";
  }
  return "minor";
}

function refineMinor(h: number, hierarchy: "flat" | "smart"): TickKind {
  const base = tickKind(h);
  if (base === "edge" || base === "midnight" || base === "collect") {
    return base;
  }
  if (hierarchy === "flat") {
    return "minor";
  }
  const r = h % 24;
  if (r === 6 || r === 12 || r === 18) {
    return "minorStrong";
  }
  return "minor";
}

type FriseLabHourTicksProps = {
  showHourLabels?: boolean;
  labelStepH?: number;
  tickFadeTop?: boolean;
  collectTone?: "accent" | "range";
  tickHierarchy?: "flat" | "smart";
};

export function FriseLabHourTicks({
  showHourLabels = false,
  labelStepH = 6,
  tickFadeTop = false,
  collectTone = "accent",
  tickHierarchy = "flat",
}: FriseLabHourTicksProps): ReactElement {
  const hours = useMemo(() => {
    const a: number[] = [];
    for (let h = 0; h <= LAB_LAST_H; h += 1) {
      a.push(h);
    }
    return a;
  }, []);

  const ticks = hours.map((h) => {
    const k = refineMinor(h, tickHierarchy);
    const left = labHourToPx(h);
    const bottom = LABEL_ROW_PX;

    if (k === "edge") {
      return (
        <div
          key={h}
          className="absolute bg-foreground"
          style={{
            left,
            bottom,
            width: LAB_TICK.wEdge,
            height: LAB_TICK.hEdge,
            transform: "translateX(-50%)",
          }}
          aria-hidden
        />
      );
    }
    if (k === "midnight") {
      return (
        <div
          key={h}
          className="absolute bg-foreground/85"
          style={{
            left,
            bottom,
            width: LAB_TICK.wMidnight,
            height: LAB_TICK.hMidnight,
            transform: "translateX(-50%)",
          }}
          aria-hidden
        />
      );
    }
    if (k === "collect") {
      const rangeCls =
        collectTone === "range"
          ? "absolute bg-[color-mix(in_srgb,var(--color-accent)_38%,var(--color-foreground)_4%)]"
          : "absolute bg-[var(--color-accent)]";
      return (
        <div
          key={h}
          className={rangeCls}
          style={{
            left,
            bottom,
            width: LAB_TICK.wCollect,
            height: LAB_TICK.hCollect,
            transform: "translateX(-50%)",
            opacity: collectTone === "range" ? 0.88 : 0.82,
          }}
          aria-hidden
        />
      );
    }
    if (k === "minorStrong") {
      return (
        <div
          key={h}
          className="absolute bg-foreground/30"
          style={{
            left,
            bottom,
            width: 1,
            height: 24,
            transform: "translateX(-50%)",
          }}
          aria-hidden
        />
      );
    }
    return (
      <div
        key={h}
        className="absolute bg-border"
        style={{
          left,
          bottom,
          width: 1,
          height: 7,
          transform: "translateX(-50%)",
        }}
        aria-hidden
      />
    );
  });

  const labels: ReactNode =
    showHourLabels === true
      ? hours
          .filter((h) => h % labelStepH === 0)
          .map((h) => (
            <span
              key={`lbl-${h}`}
              className="absolute font-mono text-[9px] tabular-nums leading-none text-muted-foreground"
              style={{
                left: labHourToPx(h),
                bottom: 2,
                transform: "translateX(-50%)",
              }}
            >
              {(h % 24).toString().padStart(2, "0")}
            </span>
          ))
      : null;

  const core = (
    <>
      {ticks}
      {labels}
    </>
  );

  if (!tickFadeTop) {
    return <>{core}</>;
  }

  return (
    <div className="pointer-events-none absolute inset-0 [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,black_22%)] [mask-image:linear-gradient(to_bottom,transparent_0%,black_22%)]">
      {core}
    </div>
  );
}

type FriseLabCollectBandProps = {
  emphasis?: "subtle" | "strong";
};

export function FriseLabCollectBand({ emphasis = "subtle" }: FriseLabCollectBandProps): ReactElement {
  const w = (LAB_COLLECT.endH - LAB_COLLECT.startH) * LAB_PX_PER_HOUR;
  const bandCls =
    emphasis === "strong"
      ? "pointer-events-none absolute rounded-sm bg-[color-mix(in_srgb,var(--color-accent)_9%,transparent)] ring-1 ring-border"
      : "pointer-events-none absolute rounded-sm bg-[color-mix(in_srgb,var(--color-accent)_5%,transparent)] ring-1 ring-border/60";

  return (
    <div
      className={bandCls}
      style={{
        left: labHourToPx(LAB_COLLECT.startH),
        width: w,
        bottom: LABEL_ROW_PX,
        height: LAB_TICK.hCollect + 4,
      }}
      aria-hidden
    />
  );
}

export function FriseLabEditionPin({ anchorHour }: { anchorHour: number }): ReactElement {
  const left = labHourToPx(anchorHour);
  return (
    <div
      className="pointer-events-none absolute z-10 flex flex-col items-center"
      style={{
        left,
        bottom: LABEL_ROW_PX + LAB_TICK.hMidnight + 2,
        transform: "translateX(-50%)",
      }}
      aria-hidden
    >
      <span className="mb-0.5 size-1 rounded-full bg-[var(--color-accent)] ring-1 ring-background" />
      <span className="h-3 w-px bg-[var(--color-accent)]" />
    </div>
  );
}

const MIDNIGHT_LABELS: readonly { h: number; text: string }[] = [
  { h: 0, text: "4 avr." },
  { h: 24, text: "5 avr." },
  { h: 48, text: "6 avr." },
  { h: 72, text: "7 avr." },
  { h: 96, text: "8 avr." },
  { h: 120, text: "9 avr." },
];

type FriseLabDayMoonsProps = {
  interactive?: boolean;
  onPickHour?: (hourIndex: number) => void;
};

export function FriseLabDayMoons({ interactive = false, onPickHour }: FriseLabDayMoonsProps): ReactElement {
  const base =
    "absolute min-w-[2.75rem] -translate-x-1/2 font-mono text-[9px] tabular-nums tracking-tight transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/25 focus-visible:ring-offset-1";

  return (
    <>
      {MIDNIGHT_LABELS.map(({ h, text }) =>
        interactive === true ? (
          <button
            key={h}
            type="button"
            className={`${base} bottom-0 cursor-pointer border-0 bg-transparent text-muted-foreground hover:text-foreground`}
            style={{ left: labHourToPx(h) }}
            onClick={(ev) => {
              ev.stopPropagation();
              onPickHour?.(h);
            }}
          >
            {text}
          </button>
        ) : (
          <span
            key={h}
            className={`${base} bottom-0 text-muted-foreground`}
            style={{ left: labHourToPx(h) }}
          >
            {text}
          </span>
        ),
      )}
    </>
  );
}

export function labFormatHourIndex(h: number): string {
  const clamped = Math.max(0, Math.min(LAB_LAST_H, Math.round(h)));
  const d = Math.floor(clamped / 24);
  const hr = clamped % 24;
  const days = ["sam.", "dim.", "lun.", "mar.", "mer.", "jeu."] as const;
  const day = days[d] ?? "—";
  return `${day} · ${hr.toString().padStart(2, "0")}:00`;
}
