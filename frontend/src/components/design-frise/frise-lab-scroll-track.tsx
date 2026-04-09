"use client";

import type {
  ReactElement,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { labTrackWidthPx } from "@/components/design-frise/frise-lab-metrics";

/**
 * `minimal` — aligné cartes édition / Articles : fond blanc, filet `border`.
 * `soft` — léger fond muted, sans dégradé ni vignette.
 */
export type FriseLabScrollTrackVariant = "minimal" | "soft" | "bare";

type FriseLabScrollTrackProps = {
  scrollRef: RefObject<HTMLDivElement | null>;
  padPx: number;
  railHeightPx: number;
  variant?: FriseLabScrollTrackVariant;
  /** Libellé vocal selon le comportement de snap du prototype. */
  railAriaLabel?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  onScroll?: () => void;
  /** Clic simple (sans scrub) — laisser vide si vous utilisez uniquement le scrub pointeur. */
  onRailClick?: (e: MouseEvent<HTMLDivElement>) => void;
  /** Glisser-déposer 1:1 comme sur la frise édition (pointer capture). */
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (e: PointerEvent<HTMLDivElement>) => void;
  /** Curseur main + défilement horizontal tactile explicite. */
  scrubCursor?: boolean;
  /** Pas de scroll ni clic : position fixée par le parent (ex. édition du jour en lab). */
  readOnly?: boolean;
  /** Classes additionnelles sur la coque scroll (bordures, rayon). */
  shellClassName?: string;
  children: ReactNode;
};

const SURFACE: Record<FriseLabScrollTrackVariant, string> = {
  minimal: "rounded-md border border-border bg-background",
  soft: "rounded-md border border-border/80 bg-[color-mix(in_srgb,var(--color-muted)_22%,var(--color-background))]",
  bare: "rounded-none border-0 border-b border-border/35 bg-transparent shadow-none",
};

export function FriseLabScrollTrack({
  scrollRef,
  padPx,
  railHeightPx,
  variant = "minimal",
  railAriaLabel = "Frise horaire — défilement horizontal",
  onKeyDown,
  onScroll,
  onRailClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  scrubCursor = false,
  readOnly = false,
  shellClassName = "",
  children,
}: FriseLabScrollTrackProps): ReactElement {
  const w = labTrackWidthPx();
  const shell = `${SURFACE[variant]} ${shellClassName}`.trim();
  const grab =
    scrubCursor === true && readOnly === false
      ? "cursor-grab touch-pan-x active:cursor-grabbing [scrollbar-gutter:stable]"
      : "";
  const ro =
    readOnly === true
      ? "pointer-events-none overflow-x-hidden select-none"
      : "overflow-x-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <div className="relative w-full">
      <div
        ref={scrollRef}
        tabIndex={readOnly === true ? -1 : 0}
        onKeyDown={readOnly === true ? undefined : onKeyDown}
        onScroll={readOnly === true ? undefined : onScroll}
        onClick={readOnly === true ? undefined : onRailClick}
        onPointerDown={readOnly === true ? undefined : onPointerDown}
        onPointerMove={readOnly === true ? undefined : onPointerMove}
        onPointerUp={readOnly === true ? undefined : onPointerUp}
        onPointerCancel={readOnly === true ? undefined : onPointerCancel}
        aria-label={railAriaLabel}
        role={readOnly === true ? "img" : undefined}
        style={scrubCursor === true && readOnly === false ? { scrollBehavior: "auto" } : undefined}
        className={`olj-scrollbar-none relative w-full outline-none ${ro} ${shell} ${grab}`.trim()}
      >
        <div
          className="box-content max-w-none"
          style={{
            paddingLeft: padPx,
            paddingRight: padPx,
            width: w,
          }}
        >
          <div className="relative" style={{ width: w, height: railHeightPx }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
