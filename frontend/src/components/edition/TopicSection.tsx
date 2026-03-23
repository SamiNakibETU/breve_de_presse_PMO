"use client";

import { useState } from "react";
import type { EditionTopic, TopicArticlePreview } from "@/lib/types";

/** Nombre d’articles visibles par défaut avant « + N autres regards ». */
export const VISIBLE_PER_TOPIC = 3;

const FLAG_EMOJI: Record<string, string> = {
  LB: "🇱🇧",
  IL: "🇮🇱",
  IR: "🇮🇷",
  SA: "🇸🇦",
  AE: "🇦🇪",
  TR: "🇹🇷",
  IQ: "🇮🇶",
  SY: "🇸🇾",
  QA: "🇶🇦",
  JO: "🇯🇴",
  KW: "🇰🇼",
  BH: "🇧🇭",
  OM: "🇴🇲",
  EG: "🇪🇬",
  US: "🇺🇸",
  GB: "🇬🇧",
  FR: "🇫🇷",
  DZ: "🇩🇿",
  YE: "🇾🇪",
};

function TopicArticleLine({
  preview,
  selected,
  onToggle,
}: {
  preview: TopicArticlePreview;
  selected: boolean;
  onToggle: (next: boolean) => void;
}) {
  const title = preview.title_fr || preview.title_original;
  return (
    <div className="border-b border-border-light py-3 text-[13px]">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="olj-focus mt-1.5 size-[15px] shrink-0 rounded-sm border-border"
          checked={selected}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Inclure ${title}`}
        />
        <div className="min-w-0 flex-1">
          <span className="font-medium leading-snug text-foreground">
            {title}
          </span>
          {preview.thesis_summary_fr && (
            <p className="mt-1.5 italic leading-relaxed text-foreground-body">
              {preview.thesis_summary_fr}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
            <span className="min-w-0">
              {preview.media_name}
              {preview.country ? ` · ${preview.country}` : ""}
              {preview.article_type ? ` · ${preview.article_type}` : ""}
              {preview.source_language ? ` · ${preview.source_language}` : ""}
            </span>
            {preview.editorial_angle && (
              <span className="text-[11px] text-foreground-subtle">
                · {preview.editorial_angle}
              </span>
            )}
            {preview.is_flagship ? (
              <span className="border-l-2 border-accent pl-2 text-[11px] font-semibold text-accent">
                Marquant
              </span>
            ) : null}
            {preview.editorial_relevance != null && (
              <span className="ml-auto shrink-0 tabular-nums text-[11px] font-medium text-foreground">
                {preview.editorial_relevance}
              </span>
            )}
          </div>
          {preview.url && (
            <a
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="olj-focus mt-2 inline-block text-[11px] text-muted-foreground underline decoration-border underline-offset-[3px] hover:text-foreground"
            >
              Source ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function TopicSection({
  topic,
  selectedIds,
  onToggleArticle,
}: {
  topic: EditionTopic;
  selectedIds: ReadonlySet<string>;
  onToggleArticle: (articleId: string, next: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const previews = topic.article_previews ?? [];
  const visible = expanded
    ? previews
    : previews.slice(0, VISIBLE_PER_TOPIC);
  const restCount = Math.max(0, previews.length - VISIBLE_PER_TOPIC);

  const flags =
    topic.countries?.map((c) => (
      <span key={c} title={c} className="text-lg leading-none">
        {FLAG_EMOJI[c.toUpperCase()] ?? c}
      </span>
    )) ?? [];

  return (
    <section className="border-b border-border pb-8 pt-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tabular-nums text-[12px] font-medium text-muted-foreground">
          {topic.rank}
        </span>
        <h2 className="max-w-3xl font-[family-name:var(--font-serif)] text-[20px] font-semibold leading-snug tracking-tight text-foreground sm:text-[21px]">
          {topic.title_final ?? topic.title_proposed}
        </h2>
      </div>
      {topic.description && (
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-foreground-body">
          {topic.description}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
        {topic.is_multi_perspective === false ? (
          <span className="border-l-2 border-border pl-2 text-foreground-body">
            Regard interne au pays
          </span>
        ) : flags.length > 0 ? (
          <span className="flex gap-1.5" aria-label="Pays concernés">
            {flags}
          </span>
        ) : null}
        {topic.article_count != null && (
          <span className="tabular-nums">
            {topic.article_count} texte{topic.article_count > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="mt-3">
        {visible.map((p) => (
          <TopicArticleLine
            key={p.id}
            preview={p}
            selected={selectedIds.has(p.id)}
            onToggle={(next) => onToggleArticle(p.id, next)}
          />
        ))}
      </div>
      {!expanded && restCount > 0 && (
        <button
          type="button"
          className="olj-link-action mt-4"
          onClick={() => setExpanded(true)}
        >
          Afficher {restCount} autre{restCount > 1 ? "s" : ""} regard
          {restCount > 1 ? "s" : ""} sur ce développement
        </button>
      )}
    </section>
  );
}
