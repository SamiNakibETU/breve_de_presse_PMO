/** Consignes structurées pour la génération (sérialisées dans `compose_instructions_fr`). */

export type ComposeTone = "sober" | "analytical" | "engaged";

export interface ComposeInstructionsPayload {
  v: 1;
  tone: ComposeTone;
  focus_country_codes: string[];
  contrast: boolean;
  length_words_per_topic: number;
  free_text: string;
}

export const DEFAULT_COMPOSE_INSTRUCTIONS: ComposeInstructionsPayload = {
  v: 1,
  tone: "sober",
  focus_country_codes: [],
  contrast: true,
  length_words_per_topic: 250,
  free_text: "",
};

export function parseComposeInstructions(
  raw: string | null | undefined,
): ComposeInstructionsPayload {
  if (!raw?.trim()) {
    return { ...DEFAULT_COMPOSE_INSTRUCTIONS };
  }
  try {
    const j = JSON.parse(raw) as Partial<ComposeInstructionsPayload>;
    if (j && typeof j === "object" && j.v === 1) {
      return {
        ...DEFAULT_COMPOSE_INSTRUCTIONS,
        ...j,
        focus_country_codes: Array.isArray(j.focus_country_codes)
          ? j.focus_country_codes.map((c) => String(c).trim().toUpperCase())
          : [],
      };
    }
  } catch {
    /* texte libre hérité */
  }
  return {
    ...DEFAULT_COMPOSE_INSTRUCTIONS,
    free_text: raw.trim(),
  };
}

export function stringifyComposeInstructions(
  p: ComposeInstructionsPayload,
): string {
  return JSON.stringify(p);
}

const TONE_LABELS: Record<ComposeTone, string> = {
  sober: "Sobre et factuel",
  analytical: "Analytique approfondi",
  engaged: "Éditorial engagé",
};

/** Texte lisible par le modèle (suffixe consignes). */
export function buildInstructionSuffixForLlm(
  p: ComposeInstructionsPayload,
): string {
  const lines: string[] = [];
  lines.push(`Ton souhaité : ${TONE_LABELS[p.tone]}.`);
  if (p.focus_country_codes.length > 0) {
    lines.push(
      `Mettre en avant les pays : ${p.focus_country_codes.join(", ")}.`,
    );
  }
  lines.push(
    p.contrast
      ? "Insister sur les contrastes entre les perspectives."
      : "Ne pas surcharger les contrastes entre perspectives.",
  );
  lines.push(
    `Longueur indicative par sujet : environ ${p.length_words_per_topic} mots.`,
  );
  if (p.free_text.trim()) {
    lines.push(`Précisions additionnelles : ${p.free_text.trim()}`);
  }
  return lines.join("\n");
}
