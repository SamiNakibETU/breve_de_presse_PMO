"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { labCenterFloatFromScroll } from "@/components/design-frise/frise-lab-snap";
import {
  LAB_LAST_H,
  LAB_PX_PER_HOUR,
  labHourToPx,
} from "@/components/design-frise/frise-lab-metrics";

const SNAP_SUPPRESS_MS = 420;

export type UseSymmetricRailScrollOptions = {
  /**
   * Par défaut `true` : tout changement d’`anchorHour` recentre la piste.
   * `false` : alignement initial seulement (au premier `padPx` > 0), puis la position vient du scroll / `scrollToHour`.
   */
  reactToAnchorHourChanges?: boolean;
};

/**
 * Padding gauche/droite = moitié du viewport : le centre du viewport correspond à l’heure H lorsque
 * scrollLeft = labHourToPx(H) (piste de largeur W, gouttières symétriques, enfant en box-content).
 */
export function useSymmetricRailScroll(
  anchorHour: number,
  options?: UseSymmetricRailScrollOptions,
): {
  scrollRef: RefObject<HTMLDivElement | null>;
  padPx: number;
  scrollToHour: (hour: number, behavior?: ScrollBehavior) => void;
  centerHourFromScroll: () => number;
  centerHourFloatFromScroll: () => number;
  /** À lire dans le hook snap : ne pas réaligner tant que Date.now() < valeur. */
  suppressSnapUntilRef: RefObject<number>;
} {
  const scrollRef = useRef<HTMLDivElement>(null);
  const suppressSnapUntilRef = useRef(0);
  const [padPx, setPadPx] = useState(0);
  const reactToAnchorHourChanges = options?.reactToAnchorHourChanges !== false;
  const initialAlignedRef = useRef(false);

  const bumpSuppress = useCallback(() => {
    suppressSnapUntilRef.current = Date.now() + SNAP_SUPPRESS_MS;
  }, []);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    setPadPx(Math.max(0, Math.floor(el.clientWidth / 2)));
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(() => {
      measure();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || padPx === 0) {
      return;
    }
    if (reactToAnchorHourChanges) {
      bumpSuppress();
      el.scrollLeft = labHourToPx(anchorHour);
      return;
    }
    if (!initialAlignedRef.current) {
      initialAlignedRef.current = true;
      bumpSuppress();
      el.scrollLeft = labHourToPx(anchorHour);
    }
  }, [padPx, anchorHour, bumpSuppress, reactToAnchorHourChanges]);

  const scrollToHour = useCallback(
    (hour: number, behavior: ScrollBehavior = "smooth") => {
      const el = scrollRef.current;
      if (!el) {
        return;
      }
      bumpSuppress();
      const clamped = Math.max(0, Math.min(LAB_LAST_H, hour));
      el.scrollTo({ left: labHourToPx(clamped), behavior });
    },
    [bumpSuppress],
  );

  const centerHourFromScroll = useCallback((): number => {
    if (padPx <= 0) {
      return Math.max(0, Math.min(LAB_LAST_H, Math.round(anchorHour)));
    }
    const el = scrollRef.current;
    if (!el) {
      return Math.max(0, Math.min(LAB_LAST_H, Math.round(anchorHour)));
    }
    const midPx = el.scrollLeft + el.clientWidth / 2 - padPx;
    const h = midPx / LAB_PX_PER_HOUR;
    return Math.max(0, Math.min(LAB_LAST_H, Math.round(h)));
  }, [padPx, anchorHour]);

  const centerHourFloatFromScroll = useCallback((): number => {
    if (padPx <= 0) {
      return Math.max(0, Math.min(LAB_LAST_H, anchorHour));
    }
    const el = scrollRef.current;
    if (!el) {
      return Math.max(0, Math.min(LAB_LAST_H, anchorHour));
    }
    return labCenterFloatFromScroll(el, padPx);
  }, [padPx, anchorHour]);

  return {
    scrollRef,
    padPx,
    scrollToHour,
    centerHourFromScroll,
    centerHourFloatFromScroll,
    suppressSnapUntilRef,
  };
}
