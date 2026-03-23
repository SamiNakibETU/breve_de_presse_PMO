"use client";

import { useState } from "react";
import {
  FLAGSHIP_BADGE_LABEL,
  formatArticleMetaLine,
} from "@/lib/article-labels-fr";
import type { Article } from "@/lib/types";

export function ArticleRow({
  article,
  selected,
  onSelectedChange,
}: {
  article: Article;
  selected: boolean;
  onSelectedChange: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border-light py-3 text-[13px]">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="olj-focus mt-1.5 size-[15px] shrink-0 rounded-sm border-border"
          checked={selected}
          onChange={(e) => onSelectedChange(e.target.checked)}
          aria-label={`Inclure ${article.title_fr || article.title_original}`}
        />
        <button
          type="button"
          className="olj-focus min-w-0 flex-1 rounded-sm text-left focus:outline-none"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <span className="font-medium leading-snug text-foreground">
            {article.title_fr || article.title_original}
          </span>
          {article.thesis_summary_fr && (
            <p className="mt-1.5 italic leading-relaxed text-foreground-body">
              {article.thesis_summary_fr}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
            <span>
              {formatArticleMetaLine({
                mediaName: article.media_name,
                country: article.country,
                articleType: article.article_type,
                sourceLanguage: article.source_language,
              })}
            </span>
            {article.editorial_angle && (
              <span className="block w-full text-[11px] leading-snug text-foreground-subtle">
                {article.editorial_angle}
              </span>
            )}
            {article.is_flagship ? (
              <span className="border-l-2 border-accent pl-2 text-[11px] font-semibold text-accent">
                {FLAGSHIP_BADGE_LABEL}
              </span>
            ) : null}
          </div>
        </button>
        {article.url && (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="olj-focus mt-1 shrink-0 text-[11px] text-muted-foreground underline decoration-border underline-offset-[3px] hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            Source ↗
          </a>
        )}
      </div>
      {open && article.summary_fr && (
        <p className="mt-3 max-w-2xl border-l border-border-light pl-4 text-[13px] leading-relaxed text-foreground-body">
          {article.summary_fr}
        </p>
      )}
    </div>
  );
}
