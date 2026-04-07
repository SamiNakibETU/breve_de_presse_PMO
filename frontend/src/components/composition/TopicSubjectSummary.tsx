import Link from "next/link";
import type { EditionTopic } from "@/lib/types";
import { formatEditionDayHeadingFr } from "@/lib/dates-display-fr";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";

type TopicSubjectSummaryProps = {
  topic: EditionTopic;
  /** Libellés pays depuis GET /api/config/coverage-targets */
  countryLabelsFr?: Record<string, string> | null;
  /** Date d’édition affichée discrètement (AAAA-MM-JJ) */
  publishDate?: string;
  articleCount?: number;
  /**
   * Codes pays ISO dérivés des articles réels (prioritaires sur `topic.countries` du LLM).
   * Si défini (y compris tableau vide), remplace la liste pays du sujet pour l’affichage.
   */
  countryCodesForDisplay?: string[] | null;
};

function countriesReadable(
  countryCodes: string[],
  countryLabelsFr: Record<string, string> | null | undefined,
): string {
  return countryCodes
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
  countryCodesForDisplay,
}: TopicSubjectSummaryProps) {
  const title = topic.title_final ?? topic.title_proposed;

  const effectiveCodes =
    countryCodesForDisplay !== undefined && countryCodesForDisplay !== null
      ? countryCodesForDisplay
      : (topic.countries ?? []);

  const showCountries =
    topic.is_multi_perspective !== false && effectiveCodes.length > 0;
  const countriesLine = showCountries
    ? countriesReadable(effectiveCodes, countryLabelsFr ?? undefined)
    : "";

  const multiFromData = effectiveCodes.length >= 2;

  const coverageEntries = topic.country_coverage
    ? [...Object.entries(topic.country_coverage)].sort((a, b) => b[1] - a[1])
    : [];
  const coverageMax =
    coverageEntries.length > 0
      ? Math.max(...coverageEntries.map(([, n]) => n))
      : 0;

  return (
    <header className="space-y-4 border-b border-border-light pb-6">
      {publishDate && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-muted-foreground tabular-nums">
            Édition du {formatEditionDayHeadingFr(publishDate)}
            {articleCount != null && articleCount > 0
              ? ` · ${articleCount} texte${articleCount > 1 ? "s" : ""} lié${articleCount > 1 ? "s" : ""}`
              : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/edition/${publishDate}`}
              className="olj-btn-secondary px-2.5 py-1 text-[11px] sm:text-[12px]"
            >
              Sommaire
            </Link>
            <Link
              href={`/edition/${publishDate}/compose`}
              className="olj-btn-primary px-2.5 py-1 text-[11px] sm:text-[12px]"
            >
              Rédaction
            </Link>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-border bg-muted/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-body">
          {topic.status}
        </span>
        {topic.article_count != null ? (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {topic.article_count} article{topic.article_count > 1 ? "s" : ""} (sujet)
          </span>
        ) : null}
      </div>
      <h1 className="font-[family-name:var(--font-serif)] text-[24px] font-semibold leading-tight tracking-tight text-foreground sm:text-[26px]">
        {title}
      </h1>

      {coverageEntries.length > 0 && coverageMax > 0 ? (
        <div className="max-w-2xl space-y-2">
          <p className="olj-rubric">Répartition par pays (corpus sujet)</p>
          <ul className="space-y-1.5">
            {coverageEntries.slice(0, 12).map(([code, n]) => {
              const cc = code.trim().toUpperCase();
              const label = countryLabelsFr?.[cc] ?? code;
              const flag = REGION_FLAG_EMOJI[cc];
              const pct = Math.round((n / coverageMax) * 100);
              return (
                <li
                  key={code}
                  className="grid grid-cols-[minmax(5rem,7rem)_minmax(0,1fr)_2rem] items-center gap-2 text-[11px]"
                >
                  <span className="truncate text-foreground-body">
                    {flag ? <span aria-hidden>{flag} </span> : null}
                    {label}
                  </span>
                  <span
                    className="h-1.5 min-w-0 overflow-hidden rounded-full bg-border"
                    title={`${label} : ${n}`}
                  >
                    <span
                      className="block h-full rounded-full bg-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-border))]"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="shrink-0 text-right tabular-nums text-muted-foreground">
                    {n}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

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
          <span className="inline-flex rounded-md bg-muted/25 px-2 py-0.5 text-foreground-body">
            Point de vue national
          </span>
        )}
        {countriesLine ? (
          <p className="max-w-3xl text-[12px] leading-relaxed text-foreground-body">
            {countriesLine}
          </p>
        ) : null}
        {(topic.is_multi_perspective === true ||
          (multiFromData && topic.is_multi_perspective !== false)) && (
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
