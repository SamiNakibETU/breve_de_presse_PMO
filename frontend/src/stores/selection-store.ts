import { create } from "zustand";
import type { EditionSelectionsResponse } from "@/lib/types";

/** Ligne retirée depuis la barre de sélection ou la page Rédaction. */
export type SelectionRemoveRow = {
  id: string;
  topicId: string | null;
  isExtra: boolean;
};

/** Copie des sélections après retrait optimiste d’un article (UI instantanée). */
export function nextSelectionsAfterRemove(
  data: EditionSelectionsResponse,
  row: SelectionRemoveRow,
): EditionSelectionsResponse {
  if (row.isExtra) {
    return {
      ...data,
      extra_article_ids: data.extra_article_ids.filter((x) => x !== row.id),
      extra_articles: (data.extra_articles ?? []).filter((p) => p.id !== row.id),
    };
  }
  if (!row.topicId) {
    return data;
  }
  const cur = data.topics[row.topicId] ?? [];
  return {
    ...data,
    topics: {
      ...data.topics,
      [row.topicId]: cur.filter((x) => x !== row.id),
    },
  };
}

/**
 * Sélections rédaction par édition (sommaire + fiche sujet).
 * Hydratation depuis GET …/selections ; les PATCH restent déclenchés par les écrans.
 */
type EditionBundle = {
  topics: Record<string, string[]>;
  extra_article_ids: string[];
};

type SelectionStore = {
  byEditionId: Record<string, EditionBundle>;
  hydrateFromServer: (editionId: string, data: EditionSelectionsResponse) => void;
  setTopicArticles: (editionId: string, topicId: string, ids: string[]) => void;
  setExtraArticles: (editionId: string, ids: string[]) => void;
  getBundle: (editionId: string) => EditionBundle | undefined;
};

export const useSelectionStore = create<SelectionStore>((set, get) => ({
  byEditionId: {},

  hydrateFromServer: (editionId, data) => {
    set((s) => ({
      byEditionId: {
        ...s.byEditionId,
        [editionId]: {
          topics: Object.fromEntries(
            Object.entries(data.topics).map(([k, v]) => [k, [...v]]),
          ),
          extra_article_ids: [...data.extra_article_ids],
        },
      },
    }));
  },

  setTopicArticles: (editionId, topicId, ids) => {
    set((s) => {
      const prev = s.byEditionId[editionId] ?? {
        topics: {},
        extra_article_ids: [],
      };
      return {
        byEditionId: {
          ...s.byEditionId,
          [editionId]: {
            ...prev,
            topics: { ...prev.topics, [topicId]: ids },
          },
        },
      };
    });
  },

  setExtraArticles: (editionId, ids) => {
    set((s) => {
      const prev = s.byEditionId[editionId] ?? {
        topics: {},
        extra_article_ids: [],
      };
      return {
        byEditionId: {
          ...s.byEditionId,
          [editionId]: {
            ...prev,
            extra_article_ids: ids,
          },
        },
      };
    });
  },

  getBundle: (editionId) => get().byEditionId[editionId],
}));
