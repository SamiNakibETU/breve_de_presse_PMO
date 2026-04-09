"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import {
  LAB_DAY_ANCHORS,
  LAB_DEFAULT_DAY_ID,
  labCollectWindowForAnchor,
  labDayById,
  labNearestEditionAnchorHour,
  labTrackWidthPx,
} from "@/components/design-frise/frise-lab-metrics";
import { labCenterFloatFromScroll } from "@/components/design-frise/frise-lab-snap";
import { useFriseLabScrollSnap } from "@/components/design-frise/use-frise-lab-scroll-snap";
import { useLabPointerScrub } from "@/components/design-frise/use-lab-pointer-scrub";
import { useSymmetricRailScroll } from "@/components/design-frise/use-symmetric-rail-scroll";

const defaultEditionAnchor =
  labDayById(LAB_DEFAULT_DAY_ID)?.anchorHour ?? LAB_DAY_ANCHORS[3]!.anchorHour;

export type EditionFriseLabController = {
  scrollRef: RefObject<HTMLDivElement | null>;
  padPx: number;
  readViewportAnchor: () => void;
  scrollToHour: (hour: number, behavior?: ScrollBehavior) => void;
  suppressSnapUntilRef: RefObject<number>;
  viewportAnchorHour: number;
  day: (typeof LAB_DAY_ANCHORS)[number];
  startH: number;
  endH: number;
  idx: number;
  onPrev: () => void;
  onNext: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLDivElement>) => void;
  w: number;
};

export function useEditionFriseLab(): EditionFriseLabController {
  const [viewportAnchorHour, setViewportAnchorHour] = useState(defaultEditionAnchor);

  const { scrollRef, padPx, scrollToHour, suppressSnapUntilRef } = useSymmetricRailScroll(
    defaultEditionAnchor,
    { reactToAnchorHourChanges: false },
  );

  const dragLockRef = useRef(false);

  const readViewportAnchor = useCallback(() => {
    const el = scrollRef.current;
    if (!el || padPx <= 0) {
      return;
    }
    const f = labCenterFloatFromScroll(el, padPx);
    const h = labNearestEditionAnchorHour(f);
    setViewportAnchorHour((prev) => (prev === h ? prev : h));
  }, [scrollRef, padPx]);

  useLayoutEffect(() => {
    readViewportAnchor();
  }, [padPx, readViewportAnchor]);

  const day = useMemo(
    () => LAB_DAY_ANCHORS.find((d) => d.anchorHour === viewportAnchorHour) ?? LAB_DAY_ANCHORS[3]!,
    [viewportAnchorHour],
  );

  useFriseLabScrollSnap(
    scrollRef,
    padPx,
    labNearestEditionAnchorHour,
    scrollToHour,
    suppressSnapUntilRef,
    true,
    dragLockRef,
  );

  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } = useLabPointerScrub(
    scrollRef,
    padPx,
    dragLockRef,
    scrollToHour,
    undefined,
    labNearestEditionAnchorHour,
  );

  const { startH, endH } = labCollectWindowForAnchor(viewportAnchorHour);

  const idx = LAB_DAY_ANCHORS.findIndex((d) => d.anchorHour === viewportAnchorHour);
  const onPrev = useCallback(() => {
    if (idx <= 0) {
      return;
    }
    scrollToHour(LAB_DAY_ANCHORS[idx - 1]!.anchorHour, "smooth");
  }, [idx, scrollToHour]);

  const onNext = useCallback(() => {
    if (idx < 0 || idx >= LAB_DAY_ANCHORS.length - 1) {
      return;
    }
    scrollToHour(LAB_DAY_ANCHORS[idx + 1]!.anchorHour, "smooth");
  }, [idx, scrollToHour]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrev();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onNext();
      }
    },
    [onPrev, onNext],
  );

  return {
    scrollRef,
    padPx,
    readViewportAnchor,
    scrollToHour,
    suppressSnapUntilRef,
    viewportAnchorHour,
    day,
    startH,
    endH,
    idx,
    onPrev,
    onNext,
    onKeyDown,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    w: labTrackWidthPx(),
  };
}
