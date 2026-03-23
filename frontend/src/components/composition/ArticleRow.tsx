"use client";

import { useState } from "react";
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
    <div className="border-b border-border-light py-2 text-[13px]">
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={selected}
          onChange={(e) => onSelectedChange(e.target.checked)}
          aria-label={`Inclure ${article.title_fr || article.title_original}`}
        />
        <button
          type="button"
          className="flex-1 text-left"
          onClick={() => setOpen(!open)}
        >
          <span className="font-medium text-foreground">
            {article.title_fr || article.title_original}
          </span>
          <span className="ml-2 text-[13px] text-muted-foreground">
            {article.media_name}
            {article.is_syndicated ? " · syndiqué" : ""}
          </span>
        </button>
        {article.url && (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 shrink-0 text-[11px] text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            Article original ↗
          </a>
        )}
      </div>
      {open && article.summary_fr && (
        <p className="mt-2 pl-6 text-[13px] leading-relaxed text-foreground-body">
          {article.summary_fr}
        </p>
      )}
    </div>
  );
}
