"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "@/lib/api";
import type { ComposeInstructionsPayload } from "@/lib/compose-instructions";
import { cn } from "@/lib/utils";

type Props = {
  value: ComposeInstructionsPayload;
  onChange: (next: ComposeInstructionsPayload) => void;
  disabled?: boolean;
};

export function ComposeInstructions({
  value,
  onChange,
  disabled = false,
}: Props) {
  const coverageQ = useQuery({
    queryKey: ["coverageTargets"] as const,
    queryFn: () => api.coverageTargets(),
    staleTime: 5 * 60 * 1000,
  });
  const labelsFr = coverageQ.data?.labels_fr ?? {};
  const codes = coverageQ.data?.country_codes ?? [];

  const set = useCallback(
    (patch: Partial<ComposeInstructionsPayload>) => {
      onChange({ ...value, ...patch });
    },
    [onChange, value],
  );

  const toggleFocus = (code: string) => {
    const u = code.trim().toUpperCase();
    const setCodes = new Set(value.focus_country_codes);
    if (setCodes.has(u)) {
      setCodes.delete(u);
    } else {
      setCodes.add(u);
    }
    set({ focus_country_codes: [...setCodes] });
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border/50 bg-card p-5 shadow-[0_1px_0_rgba(0,0,0,0.03)] sm:p-6">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Consignes pour le modèle
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-[12px] font-semibold text-foreground">
          Ton
          <select
            className="olj-focus mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-[13px]"
            disabled={disabled}
            value={value.tone}
            onChange={(e) =>
              set({
                tone: e.target.value as ComposeInstructionsPayload["tone"],
              })
            }
          >
            <option value="sober">Sobre et factuel</option>
            <option value="analytical">Analytique approfondi</option>
            <option value="engaged">Éditorial engagé</option>
          </select>
        </label>
        <label className="block text-[12px] font-semibold text-foreground">
          Longueur cible (mots / sujet)
          <input
            type="range"
            min={150}
            max={400}
            step={10}
            className="mt-2 w-full accent-accent"
            disabled={disabled}
            value={value.length_words_per_topic}
            onChange={(e) =>
              set({ length_words_per_topic: Number(e.target.value) })
            }
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {value.length_words_per_topic} mots
          </span>
        </label>
      </div>
      <div>
        <p className="text-[12px] font-semibold text-foreground">
          Focus géographique (optionnel)
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Pays à mettre en avant dans les consignes envoyées au modèle.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {codes.map((code) => {
            const on = value.focus_country_codes.includes(code);
            const label = labelsFr[code]?.trim() || code;
            return (
              <button
                key={code}
                type="button"
                disabled={disabled}
                onClick={() => toggleFocus(code)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  on
                    ? "border-accent bg-accent/12 text-accent"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/40",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          className="olj-focus size-4 rounded border-border"
          disabled={disabled}
          checked={value.contrast}
          onChange={(e) => set({ contrast: e.target.checked })}
        />
        <span>Insister sur les contrastes entre perspectives</span>
      </label>
      <label className="block text-[12px] font-semibold text-foreground">
        Consignes libres
        <textarea
          className="olj-focus mt-1.5 min-h-[88px] w-full rounded-md border border-border bg-background px-3 py-2 text-[13px]"
          disabled={disabled}
          placeholder="Ex. éviter tel angle, citer tel acteur…"
          value={value.free_text}
          onChange={(e) => set({ free_text: e.target.value })}
        />
      </label>
    </div>
  );
}
