"use client";

import type { Article } from "@/lib/types";
import { ConfidenceBadge } from "@/components/articles/confidence-badge";

interface SelectedArticlesProps {
  articles: Article[];
  onRemove: (id: string) => void;
}

export function SelectedArticles({ articles, onRemove }: SelectedArticlesProps) {
  if (articles.length === 0) {
    return <p className="border-t border-[#dddcda] py-10 text-center text-[13px] text-[#888]">Aucun article sélectionné.</p>;
  }

  return (
    <ol className="border-t border-[#dddcda]">
      {articles.map((a, idx) => (
        <li key={a.id} className="flex items-baseline gap-3 border-b border-[#eeede9] py-2">
          <span className="w-4 flex-shrink-0 text-right tabular-nums text-[12px] font-semibold text-[#888]">{idx + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">{a.title_fr || a.title_original}</p>
            <p className="text-[11px] text-[#888]">{a.media_name} · {a.country}</p>
          </div>
          <ConfidenceBadge score={a.translation_confidence} />
          <button onClick={() => onRemove(a.id)} className="text-[11px] text-[#888] hover:text-[#c8102e]" aria-label="Retirer">✕</button>
        </li>
      ))}
    </ol>
  );
}
