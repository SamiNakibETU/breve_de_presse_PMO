"use client";

import { useMemo, type ReactElement } from "react";
import { labHourLabel } from "@/components/design-frise/frise-lab-datetime";
import { LAB_LAST_H, labHourToPx, labTrackWidthPx } from "@/components/design-frise/frise-lab-metrics";

type FriseLabRichTicksProps = {
  startH: number;
  endH: number;
  railH?: number;
  showHourLabels?: boolean;
};

const LABEL_H_PX = 14;

/**
 * Ticks hiérarchisés avec transitions CSS fluides sur changement de fenêtre collecte :
 * - Minuit  : 60–72 % hauteur
 * - 6 h / 12 h / 18 h : 32–46 %
 * - Autres  : 4–24 %
 * Hors fenêtre → gris/border ; dans la fenêtre → accent avec opacité graduée.
 * Bornes (startH / endH) : pleine hauteur, 2 px, foreground.
 */
export function FriseLabRichTicks({
  startH,
  endH,
  railH = 88,
  showHourLabels = true,
}: FriseLabRichTicksProps): ReactElement {
  const tickAreaH = showHourLabels ? railH - LABEL_H_PX : railH;

  const hours = useMemo(() => {
    const a: number[] = [];
    for (let h = 0; h <= LAB_LAST_H; h++) a.push(h);
    return a;
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 top-0"
      style={{ width: labTrackWidthPx() }}
      aria-hidden
    >
      {hours.map((h) => {
        const left = labHourToPx(h);
        const rem24 = h % 24;
        const isMidnight = rem24 === 0;
        const isQuarterDay = rem24 === 6 || rem24 === 12 || rem24 === 18;
        const isEdge = h === startH || h === endH;
        const inWindow = h > startH && h < endH;
        const showLabel = showHourLabels && h % 6 === 0;

        let height: number;
        let width: number;
        let colorClass: string;
        let opacity = 1;

        if (isEdge) {
          height = tickAreaH;
          width = 2;
          colorClass = "bg-foreground";
        } else if (inWindow) {
          if (isMidnight) {
            height = Math.round(tickAreaH * 0.72);
            width = 1;
            colorClass = "bg-foreground";
            opacity = 0.38;
          } else if (isQuarterDay) {
            height = Math.round(tickAreaH * 0.46);
            width = 1;
            colorClass = "bg-[var(--color-accent)]";
            opacity = 0.78;
          } else {
            height = Math.round(tickAreaH * 0.22);
            width = 1;
            colorClass = "bg-[var(--color-accent)]";
            opacity = 0.48;
          }
        } else {
          if (isMidnight) {
            height = Math.round(tickAreaH * 0.6);
            width = 1;
            colorClass = "bg-foreground";
            opacity = 0.14;
          } else if (isQuarterDay) {
            height = Math.round(tickAreaH * 0.32);
            width = 1;
            colorClass = "bg-foreground";
            opacity = 0.14;
          } else {
            height = 4;
            width = 1;
            colorClass = "bg-foreground";
            opacity = 0.08;
          }
        }

        return (
          <div key={h}>
            <div
              className={`absolute ${colorClass} transition-[height,opacity] duration-500 ease-out`}
              style={{
                left,
                bottom: showHourLabels ? LABEL_H_PX : 0,
                width,
                height,
                opacity,
                transform: "translateX(-50%)",
              }}
            />
            {showLabel ? (
              <div
                className="absolute bottom-0 flex w-0 justify-center"
                style={{ left }}
              >
                <span
                  className={`whitespace-nowrap font-mono text-[8px] tabular-nums leading-none transition-opacity duration-500 ${
                    isEdge || inWindow ? "text-foreground/55" : "text-foreground/28"
                  }`}
                >
                  {labHourLabel(h)}
                </span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
