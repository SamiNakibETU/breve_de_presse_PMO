import { create } from "zustand";
import type { EditionSelectionsResponse } from "@/lib/types";

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
