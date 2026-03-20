"use client";

import { useState } from "react";
import type { Article } from "@/lib/types";

interface SelectedArticlesProps {
  articles: Article[];
  onRemove: (id: string) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

export function SelectedArticles({
  articles,
  onRemove,
  onReorder,
}: SelectedArticlesProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  if (articles.length === 0) {
    return (
      <p className="border-t border-[#dddcda] py-10 text-center text-[13px] text-[#888]">
        Aucun article sélectionné.
      </p>
    );
  }

  return (
    <ol className="border-t border-[#dddcda]">
      {articles.map((a, idx) => (
        <li
          key={a.id}
          draggable={Boolean(onReorder)}
          onDragStart={() => setDragIdx(idx)}
          onDragEnd={() => setDragIdx(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIdx != null && onReorder) {
              onReorder(dragIdx, idx);
            }
            setDragIdx(null);
          }}
          className={`flex items-baseline gap-3 border-b border-[#eeede9] py-2 ${
            dragIdx === idx ? "opacity-50" : ""
          }`}
        >
          {onReorder && (
            <span
              className="w-5 flex-shrink-0 cursor-grab text-[12px] text-[#ccc] active:cursor-grabbing"
              title="Glisser pour réordonner"
              aria-hidden
            >
              ⋮⋮
            </span>
          )}
          <span className="w-4 flex-shrink-0 text-right tabular-nums text-[12px] font-semibold text-[#888]">
            {idx + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">{a.title_fr || a.title_original}</p>
            <p className="text-[11px] text-[#888]">
              {a.media_name} · {a.country}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(a.id)}
            className="text-[11px] text-[#888] hover:text-[#c8102e]"
            aria-label="Retirer"
          >
            ✕
          </button>
        </li>
      ))}
    </ol>
  );
}
