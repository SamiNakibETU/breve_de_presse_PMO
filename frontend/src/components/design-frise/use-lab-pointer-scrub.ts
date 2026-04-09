"use client";

import { useCallback, useRef, type PointerEvent, type RefObject } from "react";
import { labHourToPx } from "@/components/design-frise/frise-lab-metrics";
import {
  labFloatHourFromRailPointer,
  labHourFromRailPointer,
} from "@/components/design-frise/frise-lab-snap";

const TAP_MAX_PX = 10;

/**
 * Comportement proche de {@link EditionPeriodFrise} : glisser = défilement 1:1 (sans smooth).
 * Tap : soit recentrage sur une heure fixe (mode « édition du jour »), soit saut vers l’heure sous le doigt.
 */
export function useLabPointerScrub(
  scrollRef: RefObject<HTMLDivElement | null>,
  padPx: number,
  dragLockRef: RefObject<boolean>,
  /** Si fourni, le tap léger utilise `scrollToHour` (supprime le snap concurrent pendant l’animation). */
  scrollToHour?: (hour: number, behavior?: ScrollBehavior) => void,
  /** Si défini avec `scrollToHour`, le tap recentre toujours ce repère — pas de « choix » d’une autre heure. */
  lockTapToAnchorHour?: number,
  /** Si défini (sans `lockTapToAnchorHour`), le tap aligne sur `scrollToHour(resolveTapHour(floatH))`. */
  resolveTapHour?: (floatH: number) => number,
): {
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLDivElement>) => void;
} {
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    moved: boolean;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) {
        return;
      }
      const el = scrollRef.current;
      if (!el || padPx <= 0) {
        return;
      }
      if ((e.target as HTMLElement).closest("button,a")) {
        return;
      }
      el.setPointerCapture(e.pointerId);
      dragLockRef.current = false;
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startScroll: el.scrollLeft,
        moved: false,
      };
    },
    [scrollRef, padPx, dragLockRef],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      const el = scrollRef.current;
      if (!d || e.pointerId !== d.pointerId || !el) {
        return;
      }
      const dx = e.clientX - d.startX;
      if (!d.moved) {
        if (Math.abs(dx) <= TAP_MAX_PX) {
          return;
        }
        d.moved = true;
        dragLockRef.current = true;
      }
      el.scrollLeft = d.startScroll - dx;
    },
    [scrollRef, dragLockRef],
  );

  const finish = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      const el = scrollRef.current;
      if (!d || e.pointerId !== d.pointerId || !el) {
        return;
      }
      const dx = e.clientX - d.startX;
      if (!d.moved && Math.abs(dx) <= TAP_MAX_PX) {
        const t = (e.target as HTMLElement | null)?.closest("a[href]");
        if (!t) {
          if (scrollToHour != null && lockTapToAnchorHour != null) {
            scrollToHour(lockTapToAnchorHour, "smooth");
          } else {
            const h =
              scrollToHour != null && resolveTapHour != null
                ? resolveTapHour(labFloatHourFromRailPointer(e.clientX, el, padPx))
                : labHourFromRailPointer(e.clientX, el, padPx);
            if (scrollToHour != null) {
              scrollToHour(h, "smooth");
            } else {
              const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
              const target = labHourToPx(h) - el.clientWidth / 2 + padPx;
              el.scrollTo({
                left: Math.max(0, Math.min(target, maxLeft)),
                behavior: "smooth",
              });
            }
          }
        }
      }
      dragRef.current = null;
      dragLockRef.current = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [scrollRef, padPx, scrollToHour, lockTapToAnchorHour, resolveTapHour, dragLockRef],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      finish(e);
    },
    [finish],
  );

  const onPointerCancel = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      finish(e);
    },
    [finish],
  );

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
