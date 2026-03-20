"use client";

import { useCallback, useEffect, useState } from "react";
import {
  loadReviewArticleIds,
  saveReviewArticleIds,
} from "@/lib/review-selection-storage";

/**
 * Sélection persistante (sessionStorage) pour accumuler des articles
 * depuis plusieurs clusters (ou la liste articles) avant la revue.
 */
export function useReviewArticleSelection(syncKey?: string) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSelectedIds(loadReviewArticleIds());
    setReady(true);
  }, [syncKey]);

  const toggleArticle = useCallback((articleId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      saveReviewArticleIds(next);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    const empty = new Set<string>();
    setSelectedIds(empty);
    saveReviewArticleIds(empty);
  }, []);

  return {
    selectedIds,
    toggleArticle,
    clearSelection,
    /** false jusqu’au premier chargement depuis sessionStorage (évite flash) */
    ready,
  };
}
