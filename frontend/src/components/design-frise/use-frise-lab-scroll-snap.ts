"use client";

import { useEffect, useRef, type RefObject } from "react";
import { labCenterFloatFromScroll } from "@/components/design-frise/frise-lab-snap";
import { labHourToPx } from "@/components/design-frise/frise-lab-metrics";

/** Tolérance sous-pixel / navigateur pour considérer l’alignement atteint. */
const ALIGN_PX = 6;
const DEBOUNCE_MS = 140;
const SMALL_JUMP_PX = 14;

/**
 * Réaligne après fin de geste utilisateur uniquement (pas pendant les scrolls programmés).
 */
export function useFriseLabScrollSnap(
  scrollRef: RefObject<HTMLDivElement | null>,
  padPx: number,
  resolveSnapHour: (floatCenterH: number) => number,
  scrollToHour: (hour: number, behavior?: ScrollBehavior) => void,
  suppressSnapUntilRef: RefObject<number>,
  enabled: boolean = true,
  /** Pendant un glisser-déposer (pointer capture), pas de réalignement — évite la sensation « qui lutte ». */
  dragLockRef?: RefObject<boolean>,
): void {
  const resolveRef = useRef(resolveSnapHour);
  const scrollToHourRef = useRef(scrollToHour);
  const suppressRef = suppressSnapUntilRef;
  resolveRef.current = resolveSnapHour;
  scrollToHourRef.current = scrollToHour;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled || padPx <= 0) {
      return;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const alignIfNeeded = () => {
      if (dragLockRef?.current === true) {
        return;
      }
      if (Date.now() < suppressRef.current) {
        return;
      }
      const floatH = labCenterFloatFromScroll(el, padPx);
      const h = resolveRef.current(floatH);
      const target = labHourToPx(h);
      const delta = Math.abs(el.scrollLeft - target);
      if (delta <= ALIGN_PX) {
        return;
      }
      const behavior: ScrollBehavior = delta < SMALL_JUMP_PX ? "auto" : "smooth";
      scrollToHourRef.current(h, behavior);
    };

    const onScroll = () => {
      if (dragLockRef?.current === true) {
        if (debounceTimer != null) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        return;
      }
      if (Date.now() < suppressRef.current) {
        return;
      }
      if (debounceTimer != null) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        alignIfNeeded();
      }, DEBOUNCE_MS);
    };

    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (debounceTimer != null) {
        clearTimeout(debounceTimer);
      }
      el.removeEventListener("scroll", onScroll);
    };
  }, [scrollRef, padPx, enabled, suppressRef, dragLockRef]);
}
