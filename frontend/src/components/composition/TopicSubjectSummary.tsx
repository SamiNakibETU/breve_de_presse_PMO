import type { EditionTopic } from "@/lib/types";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";

type TopicSubjectSummaryProps = {
  topic: EditionTopic;
  /** Libellés pays depuis GET /api/config/coverage-targets */
  countryLabelsFr?: Record<string, string> | null;
  /** Date d’édition affichée discrètement (AAAA-MM-JJ) */
  publishDate?: string;
  articleCount?: number;
};

function countriesReadable(
  countries: string[],
  countryLabelsFr: Record<string, string> | null | undefined,
): string {
  return countries
    .map((c) => {
      const code = c.trim().toUpperCase();
      const label = countryLabelsFr?.[code] ?? code;
      const flag = REGION_FLAG_EMOJI[code];
      return flag ? `${flag} ${label}` : label;
    })
    .join(", ");
}

export function TopicSubjectSummary({
  topic,
  countryLabelsFr,
  publishDate,
  articleCount,
}: TopicSubjectSummaryProps) {
  const title = topic.title_final ?? topic.title_proposed;

  const countries = topic.countries ?? [];
  const showCountries =
    topic.is_multi_perspective !== false && countries.length > 0;
  const countriesLine = showCountries
    ? countriesReadable(countries, countryLabelsFr ?? undefined)
    : "";

  return (
    <header className="space-y-4 border-b border-border-light pb-6">
      {publishDate && (
        <p className="text-[12px] text-muted-foreground tabular-nums">
          Édition du {publishDate}
          {articleCount != null && articleCount > 0
            ? ` · ${articleCount} texte${articleCount > 1 ? "s" : ""} lié${articleCount > 1 ? "s" : ""}`
            : ""}
        </p>
      )}
      <h1 className="font-[family-name:var(--font-serif)] text-[24px] font-semibold leading-tight tracking-tight text-foreground sm:text-[26px]">
        {title}
      </h1>

      {(topic.angle_summary?.trim() || topic.description?.trim()) && (
        <div className="max-w-3xl space-y-3 text-[15px] leading-relaxed text-foreground-body">
          {topic.angle_summary?.trim() && (
            <p className="font-[family-name:var(--font-serif)] text-[16px] leading-snug text-foreground">
              {topic.angle_summary.trim()}
            </p>
          )}
          {topic.description?.trim() &&
            topic.description.trim() !== topic.angle_summary?.trim() && (
              <p>{topic.description.trim()}</p>
            )}
        </div>
      )}

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 text-[12px] text-muted-foreground">
        {topic.is_multi_perspective === false && (
          <span className="border-l border-border pl-2 text-foreground-body">
            Point de vue national
          </span>
        )}
        {countriesLine ? (
          <p className="max-w-3xl text-[12px] leading-relaxed text-foreground-body">
            {countriesLine}
          </p>
        ) : null}
        {(topic.is_multi_perspective === true ||
          (countries.length >= 2 && topic.is_multi_perspective !== false)) && (
          <span className="text-[11px] font-medium uppercase tracking-wide text-foreground-body">
            Plusieurs regards
          </span>
        )}
      </div>

      {(topic.dominant_angle?.trim() || topic.counter_angle?.trim()) && (
        <div className="grid gap-4 border-t border-border-light pt-4 sm:grid-cols-2 sm:gap-6">
          {topic.dominant_angle?.trim() && (
            <div>
              <p className="olj-rubric mb-2">Tendance dominante</p>
              <p className="text-[13px] leading-relaxed text-foreground-body">
                {topic.dominant_angle.trim()}
              </p>
            </div>
          )}
          {topic.counter_angle?.trim() && (
            <div>
              <p className="olj-rubric mb-2">Contrepoint</p>
              <p className="text-[13px] leading-relaxed text-foreground-body">
                {topic.counter_angle.trim()}
              </p>
            </div>
          )}
        </div>
      )}

      {topic.editorial_note?.trim() && (
        <div className="border-t border-border-light pt-4">
          <p className="olj-rubric mb-2">Note de rédaction</p>
          <p className="text-[13px] leading-relaxed text-foreground-body">
            {topic.editorial_note.trim()}
          </p>
        </div>
      )}
    </header>
  );
}
