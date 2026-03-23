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

export function TopicSubjectSummary({
  topic,
  countryLabelsFr,
  publishDate,
  articleCount,
}: TopicSubjectSummaryProps) {
  const title = topic.title_final ?? topic.title_proposed;

  const countries = topic.countries ?? [];
  const showFlags =
    topic.is_multi_perspective !== false && countries.length > 0;

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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-muted-foreground">
        {topic.is_multi_perspective === false && (
          <span className="border-l-2 border-border pl-2 text-foreground-body">
            Point de vue national
          </span>
        )}
        {showFlags && (
          <span className="flex flex-wrap gap-1.5" aria-label="Périmètre géographique">
            {countries.map((c) => {
              const code = c.trim().toUpperCase();
              const label = countryLabelsFr?.[code] ?? code;
              return (
                <span
                  key={c}
                  title={label}
                  className="inline-flex items-center gap-1 rounded-sm border border-border-light bg-white px-1.5 py-0.5 text-[11px] text-foreground-body"
                >
                  <span className="text-base leading-none" aria-hidden>
                    {REGION_FLAG_EMOJI[code] ?? code}
                  </span>
                  <span className="max-w-[10rem] truncate">{label}</span>
                </span>
              );
            })}
          </span>
        )}
        {(topic.is_multi_perspective === true ||
          (countries.length >= 2 && topic.is_multi_perspective !== false)) && (
          <span className="rounded-sm border border-border-light bg-muted/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-foreground-body">
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
