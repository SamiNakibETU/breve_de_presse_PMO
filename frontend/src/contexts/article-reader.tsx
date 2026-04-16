"use client";

/**
 * ArticleReader — Lecteur modal avec flux éditorial continu.
 *
 * Design : Ryo Lu — flux unique scrollable, pas d'onglets.
 * Les journalistes ne veulent pas cliquer pour trouver l'information.
 *
 * Ordre du contenu :
 *   Header (media · pays · date)
 *   Titre (serif semibold)
 *   ── séparateur ──
 *   THÈSE           → italic serif
 *   POINTS CLÉS     → puces avec filet accent
 *   CONTEXTE FACTUEL→ factual_context_fr
 *   RÉSUMÉ          → paragraphes avec lettrine
 *   CITATIONS       → italic serif fond muted
 *   ── séparateur ──
 *   Métadonnées techniques (tonalité, cadrage, angle)
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
  type ReactNode,
} from "react";
import {
  articleTypeLabelFr,
  sourceLanguageLabelFr,
} from "@/lib/article-labels-fr";
import {
  formatAuthorDisplay,
  relevanceBandLabelFr,
} from "@/lib/article-relevance-display";
import { api } from "@/lib/api";
import { useSelectionStore } from "@/stores/selection-store";
import { formatPublishedAtFr } from "@/lib/dates-display-fr";
import type { Article, EditionSelectionsResponse } from "@/lib/types";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import {
  decodeHtmlEntities,
  formatQuoteForDisplay,
} from "@/lib/text-utils";
import { normalizeBulletLine } from "@/lib/analysis-text-normalize";
import {
  bodyParagraphs,
  editorialBodySections,
  sanitizeTranslatedBodyForDisplay,
} from "@/lib/editorial-body";
import { SectionLabel } from "@/components/ui/editorial-primitives";
import { cn } from "@/lib/utils";

const ARTICLE_QUERY_STALE_MS = 60_000;

export const articleDetailQueryKey = (articleId: string) =>
  ["article", articleId] as const;

const MAX_OPEN_ARTICLES = 5;
const PANEL_MIN_W = 320;
const PANEL_MAX_W = 900;
const PANEL_DEFAULT_W = 480;
/** Seuil en-dessous duquel le lecteur est un bottom-sheet (vs panneau latéral). */
const MOBILE_BREAKPOINT_PX = 768;
const MOBILE_SHEET_DEFAULT_H = 78; // % de dvh
const MOBILE_SHEET_MIN_H    = 30;
const MOBILE_SHEET_MAX_H    = 96;
const DOCK_STORAGE_KEY = "olj-article-reader-dock";

/** Largeur maximale autorisée selon le viewport (laisse 45 % min pour le contenu). */
function viewportCapW(requestedW: number): number {
  if (typeof window === "undefined") return requestedW;
  const cap = Math.max(PANEL_MIN_W, Math.floor(window.innerWidth * 0.52));
  return Math.min(requestedW, cap);
}

/** Largeur initiale du panneau adaptée au viewport courant. */
function getInitialPanelWidth(): number {
  if (typeof window === "undefined") return PANEL_DEFAULT_W;
  const vw = window.innerWidth;
  if (vw < MOBILE_BREAKPOINT_PX) return PANEL_DEFAULT_W; // bottom-sheet: ignored
  return Math.min(PANEL_DEFAULT_W, Math.max(PANEL_MIN_W, Math.floor(vw * 0.4)));
}

type ReaderDock = "left" | "right";

function readInitialDock(): ReaderDock {
  if (typeof window === "undefined") return "right";
  try {
    const v = window.localStorage.getItem(DOCK_STORAGE_KEY);
    return v === "left" ? "left" : "right";
  } catch {
    return "right";
  }
}

type ArticleReaderContextValue = {
  openArticle: (articleId: string) => void;
  prefetchArticle: (articleId: string) => void;
};

const ArticleReaderContext = createContext<ArticleReaderContextValue | null>(null);

export function ArticleReaderProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [panelWidth, setPanelWidth] = useState(getInitialPanelWidth);
  const [sheetHeightPct, setSheetHeightPct] = useState(MOBILE_SHEET_DEFAULT_H);
  const [dock, setDock] = useState<ReaderDock>("right");

  useEffect(() => {
    setDock(readInitialDock());
  }, []);

  /* Met à jour les variables CSS sur :root selon l'état du panneau.
   * La sauvegarde/restauration de scrollY évite le saut de page causé
   * par le reflow du padding lors de l'ouverture ou du resize. */
  useEffect(() => {
    const scrollY = window.scrollY;

    const hasArticles = openIds.length > 0;
    const isMobile = window.innerWidth < MOBILE_BREAKPOINT_PX;
    const isExpandedDesktop = hasArticles && !collapsed && !isMobile;
    const isCollapsedDesktopStrip = hasArticles && collapsed && !isMobile;
    const mainEl = document.querySelector("main[data-reader-layout]");

    if (mainEl) {
      if (isExpandedDesktop || isCollapsedDesktopStrip) {
        mainEl.setAttribute("data-reader-dock", dock);
      } else {
        mainEl.removeAttribute("data-reader-dock");
      }
    }

    if (hasArticles) {
      if (isMobile) {
        document.documentElement.style.setProperty("--reader-panel-w", "0px");
        document.documentElement.style.setProperty(
          "--reader-panel-bh",
          collapsed ? "0px" : `${sheetHeightPct}dvh`,
        );
        document.documentElement.style.setProperty(
          "--reader-draw-h",
          collapsed ? "48px" : `${sheetHeightPct}dvh`,
        );
      } else if (collapsed) {
        document.documentElement.style.setProperty("--reader-panel-w", "48px");
        document.documentElement.style.setProperty("--reader-panel-bh", "0px");
        document.documentElement.style.setProperty("--reader-draw-w", "48px");
      } else {
        const effectiveW = viewportCapW(panelWidth);
        document.documentElement.style.setProperty("--reader-panel-w", `${effectiveW}px`);
        document.documentElement.style.setProperty("--reader-panel-bh", "0px");
        document.documentElement.style.setProperty("--reader-draw-w", `${effectiveW}px`);
      }
    } else {
      document.documentElement.style.setProperty("--reader-panel-w", "0px");
      document.documentElement.style.setProperty("--reader-panel-bh", "0px");
    }

    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, behavior: "instant" });
    });
  }, [openIds.length, collapsed, panelWidth, sheetHeightPct, dock]);

  const setDockPersist = useCallback((next: ReaderDock) => {
    setDock(next);
    try {
      window.localStorage.setItem(DOCK_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const openArticle = useCallback((id: string) => {
    setOpenIds((prev) => {
      if (prev.includes(id)) {
        setActiveId(id);
        setCollapsed(false);
        return prev;
      }
      const next = [...prev, id];
      if (next.length > MAX_OPEN_ARTICLES) next.shift();
      setActiveId(id);
      setCollapsed(false);
      return next;
    });
  }, []);

  const closeArticle = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = prev.filter((x) => x !== id);
      setActiveId((cur) => {
        if (cur === id) return next[next.length - 1] ?? null;
        return cur;
      });
      return next;
    });
  }, []);

  const closeAll = useCallback(() => {
    setOpenIds([]);
    setActiveId(null);
  }, []);

  const prefetchArticle = useCallback(
    (id: string) => {
      if (!id.trim()) return;
      void queryClient.prefetchQuery({
        queryKey: articleDetailQueryKey(id),
        queryFn: () => api.articleById(id),
        staleTime: ARTICLE_QUERY_STALE_MS,
      });
    },
    [queryClient],
  );

  return (
    <ArticleReaderContext.Provider value={{ openArticle, prefetchArticle }}>
      {children}
      {openIds.length > 0 && activeId ? (
        <ArticleDrawer
          openIds={openIds}
          activeId={activeId}
          collapsed={collapsed}
          dock={dock}
          panelWidth={panelWidth}
          sheetHeightPct={sheetHeightPct}
          onSelectTab={setActiveId}
          onCloseTab={closeArticle}
          onCloseAll={closeAll}
          onToggleCollapse={() => setCollapsed((v) => !v)}
          onResizeWidth={setPanelWidth}
          onResizeHeight={setSheetHeightPct}
          onToggleDock={() => setDockPersist(dock === "right" ? "left" : "right")}
        />
      ) : null}
    </ArticleReaderContext.Provider>
  );
}

export function useArticleReader(): ArticleReaderContextValue {
  const ctx = useContext(ArticleReaderContext);
  return {
    openArticle: ctx?.openArticle ?? (() => {}),
    prefetchArticle: ctx?.prefetchArticle ?? (() => {}),
  };
}

function buildSynthesisPlainText(a: Article): string {
  const parts: string[] = [];
  if (a.thesis_summary_fr?.trim()) {
    parts.push(`Thèse : ${a.thesis_summary_fr.trim()}`);
  }
  if (a.summary_fr?.trim()) {
    parts.push(`Résumé : ${a.summary_fr.trim()}`);
  }
  if (a.key_quotes_fr?.length) {
    parts.push(
      "Citations :\n" +
        a.key_quotes_fr
          .map((q) => `« ${formatQuoteForDisplay(q)} »`)
          .join("\n"),
    );
  }
  return parts.join("\n\n");
}

/* ────────────────────────────────────────────────────────
 * ArticleDrawer — panneau latéral droit, multi-onglets
 * ──────────────────────────────────────────────────────── */

function ArticleDrawer({
  openIds,
  activeId,
  collapsed,
  dock,
  panelWidth,
  sheetHeightPct,
  onSelectTab,
  onCloseTab,
  onCloseAll,
  onToggleCollapse,
  onResizeWidth,
  onResizeHeight,
  onToggleDock,
}: {
  openIds: string[];
  activeId: string;
  collapsed: boolean;
  dock: ReaderDock;
  panelWidth: number;
  sheetHeightPct: number;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCloseAll: () => void;
  onToggleCollapse: () => void;
  onResizeWidth: (w: number) => void;
  onResizeHeight: (h: number) => void;
  onToggleDock: () => void;
}) {
  const isResizingW = useRef(false);
  const isResizingH = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startW = useRef(0);
  const startH = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCloseAll]);

  /* ── Desktop: resize depuis le bord intérieur (gauche si dock droit, droite si dock gauche) ── */
  const onResizeWStart = useCallback(
    (e: React.MouseEvent) => {
      isResizingW.current = true;
      startX.current = e.clientX;
      startW.current = panelWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: MouseEvent) => {
        if (!isResizingW.current) return;
        const delta =
          dock === "right" ? startX.current - ev.clientX : ev.clientX - startX.current;
        onResizeWidth(Math.min(PANEL_MAX_W, Math.max(PANEL_MIN_W, startW.current + delta)));
      };
      const onUp = () => {
        isResizingW.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [dock, panelWidth, onResizeWidth],
  );

  /* ── Mobile: resize depuis la poignée supérieure ── */
  const onResizeHStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    isResizingH.current = true;
    const clientY = "touches" in e ? e.touches[0]!.clientY : e.clientY;
    startY.current = clientY;
    startH.current = sheetHeightPct;
    document.body.style.userSelect = "none";
    const onMove = (ev: TouchEvent | MouseEvent) => {
      if (!isResizingH.current) return;
      const y = "touches" in ev ? ev.touches[0]!.clientY : ev.clientY;
      const deltaPx = startY.current - y;
      const deltaPct = (deltaPx / window.innerHeight) * 100;
      onResizeHeight(Math.min(MOBILE_SHEET_MAX_H, Math.max(MOBILE_SHEET_MIN_H, startH.current + deltaPct)));
    };
    const onUp = () => {
      isResizingH.current = false;
      document.body.style.userSelect = "";
      window.removeEventListener("touchmove", onMove as EventListener);
      window.removeEventListener("touchend", onUp);
      window.removeEventListener("mousemove", onMove as EventListener);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("touchmove", onMove as EventListener, { passive: true });
    window.addEventListener("touchend", onUp);
    window.addEventListener("mousemove", onMove as EventListener);
    window.addEventListener("mouseup", onUp);
  }, [sheetHeightPct, onResizeHeight]);

  return (
    <div
      className={cn(
        "reader-drawer fixed z-[80] flex flex-col bg-background",
        /* Desktop (≥768px) — dock droit (défaut) */
        dock === "right" &&
          "md:inset-y-0 md:right-0 md:left-auto md:border-l md:border-r-0 md:border-border md:shadow-high",
        /* Desktop (≥768px) — dock gauche */
        dock === "left" &&
          "md:inset-y-0 md:left-0 md:right-auto md:border-r md:border-l-0 md:border-border md:shadow-[4px_0_24px_rgba(0,0,0,0.08)]",
        /* Mobile (< 768px): bottom sheet */
        "max-md:inset-x-0 max-md:bottom-0 max-md:border-t max-md:border-border max-md:shadow-[0_-4px_32px_rgba(0,0,0,0.12)]",
        collapsed && "reader-drawer--collapsed",
      )}
      style={{
        /* Desktop width dynamique */
        ["--reader-draw-w" as string]: `${panelWidth}px`,
        width: collapsed ? 48 : undefined,
      }}
      role="complementary"
      aria-label="Lecteur d'articles"
    >
      {/* ── Poignée mobile (swipe up/down) ── */}
      <div
        className="md:hidden flex h-8 shrink-0 cursor-ns-resize items-center justify-center touch-none"
        onMouseDown={onResizeHStart}
        onTouchStart={onResizeHStart}
        aria-hidden
      >
        <div className="h-1 w-10 rounded-full bg-border" />
      </div>

      {/* ── Poignée desktop (redimensionnement largeur) ── */}
      {!collapsed && (
        <div
          className={cn(
            "max-md:hidden absolute top-0 z-10 flex h-full w-3 cursor-col-resize items-center justify-center touch-none",
            "bg-gradient-to-r from-transparent via-border/50 to-transparent hover:via-accent/35",
            dock === "right" ? "left-0" : "right-0 bg-gradient-to-l",
          )}
          onMouseDown={onResizeWStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionner le panneau de lecture"
          title="Glisser pour ajuster la largeur du lecteur"
        >
          <span
            className="pointer-events-none h-14 w-0.5 rounded-full bg-border shadow-sm ring-1 ring-border/60"
            aria-hidden
          />
        </div>
      )}

      {/* ── Barre d'onglets ── */}
      <div className="flex h-10 shrink-0 items-stretch border-b border-border bg-muted/10">
        {/* Mobile: bouton fermer à gauche */}
        <button
          type="button"
          onClick={onCloseAll}
          className="md:hidden flex w-10 shrink-0 items-center justify-center text-[11px] text-muted-foreground transition-colors hover:bg-accent/8 hover:text-accent"
          aria-label="Fermer"
        >
          ✕
        </button>
        {/* Desktop: toggle collapse à gauche */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="max-md:hidden flex w-10 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          aria-label={collapsed ? "Développer le lecteur" : "Réduire le lecteur en bandeau"}
        >
          {collapsed
            ? dock === "left"
              ? "▷"
              : "◁"
            : dock === "left"
              ? "◁"
              : "▷"}
        </button>
        {/* Desktop: bascule dock gauche / droite */}
        <button
          type="button"
          onClick={onToggleDock}
          className="max-md:hidden flex w-10 shrink-0 items-center justify-center text-[12px] text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          title={
            dock === "right"
              ? "Placer le lecteur à gauche de l’écran"
              : "Placer le lecteur à droite de l’écran"
          }
          aria-label={
            dock === "right"
              ? "Dock lecteur à gauche"
              : "Dock lecteur à droite"
          }
        >
          {dock === "right" ? "⇤" : "⇥"}
        </button>

        {!collapsed && (
          <>
            <div className="flex min-w-0 flex-1 items-stretch gap-0 overflow-x-auto">
              {openIds.map((id) => (
                <ArticleTab
                  key={id}
                  articleId={id}
                  isActive={id === activeId}
                  onSelect={() => onSelectTab(id)}
                  onClose={() => onCloseTab(id)}
                />
              ))}
            </div>
            {/* Desktop: fermer tout à droite */}
            <button
              type="button"
              onClick={onCloseAll}
              className="max-md:hidden flex w-10 shrink-0 items-center justify-center text-[11px] text-muted-foreground transition-colors hover:bg-accent/8 hover:text-accent"
              aria-label="Tout fermer"
            >
              ✕
            </button>
          </>
        )}
      </div>

      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ArticlePane articleId={activeId} onClose={() => onCloseTab(activeId)} />
        </div>
      )}
    </div>
  );
}


function ArticleTab({
  articleId,
  isActive,
  onSelect,
  onClose,
}: {
  articleId: string;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: articleDetailQueryKey(articleId),
    queryFn: () => api.articleById(articleId),
    enabled: Boolean(articleId),
    staleTime: ARTICLE_QUERY_STALE_MS,
  });
  const a = q.data;
  const label = a
    ? decodeHtmlEntities(a.title_fr?.trim() || a.title_original || "Article").slice(0, 40)
    : "...";

  return (
    <div
      className={cn(
        "group relative flex max-w-[180px] shrink-0 cursor-pointer items-center gap-1 border-r border-border/40 px-2.5 text-[11px] transition-colors",
        isActive
          ? "bg-background text-foreground shadow-[inset_0_-2px_0_var(--color-accent)]"
          : "bg-muted/5 text-muted-foreground hover:bg-muted/20 hover:text-foreground",
      )}
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] text-muted-foreground opacity-0 transition-opacity hover:bg-accent/10 hover:text-accent group-hover:opacity-100"
        aria-label={`Fermer ${label}`}
      >
        ✕
      </button>
    </div>
  );
}

function parseEditionDateFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = /^\/edition\/(\d{4}-\d{2}-\d{2})(?:\/|$)/.exec(pathname);
  if (!m?.[1]) return null;
  if (pathname.includes("/compose")) return null;
  return m[1];
}

/** Sommaire ou liste Articles avec `edition_id` : inclure / retirer l’article des sélections. */
function ArticlePaneSommaireSelection({
  articleId,
}: {
  articleId: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const editionDate = parseEditionDateFromPathname(pathname);
  const editionIdFromQuery =
    searchParams.get("edition_id")?.trim().replace(/^"|"$/g, "") || null;
  const qc = useQueryClient();

  const editionByDateQ = useQuery({
    queryKey: ["edition", editionDate ?? ""] as const,
    queryFn: () => api.editionByDate(editionDate!),
    enabled: Boolean(editionDate && !editionIdFromQuery),
    staleTime: 60_000,
  });

  const editionId = editionIdFromQuery ?? editionByDateQ.data?.id;

  const topicsQ = useQuery({
    queryKey: ["editionTopics", editionId, "readerSel", 200] as const,
    queryFn: () =>
      api.editionTopics(editionId!, {
        includeArticlePreviews: true,
        maxArticlePreviewsPerTopic: 200,
      }),
    enabled: Boolean(editionId),
    staleTime: 15_000,
  });

  const selectionsQ = useQuery({
    queryKey: ["editionSelections", editionId] as const,
    queryFn: () => api.editionSelections(editionId!),
    enabled: Boolean(editionId),
    staleTime: 15_000,
  });

  const topicIdForArticle = useMemo(() => {
    for (const t of topicsQ.data ?? []) {
      if ((t.article_previews ?? []).some((p) => p.id === articleId)) return t.id;
    }
    return null;
  }, [topicsQ.data, articleId]);

  const bundle = useSelectionStore((s) => (editionId ? s.byEditionId[editionId] : undefined));
  const inTopic =
    topicIdForArticle != null &&
    (bundle?.topics[topicIdForArticle] ?? selectionsQ.data?.topics[topicIdForArticle] ?? []).includes(
      articleId,
    );
  const inExtra =
    (bundle?.extra_article_ids ?? selectionsQ.data?.extra_article_ids ?? []).includes(articleId);
  const selectedSommaire = inTopic || inExtra;

  const toggleMutation = useMutation({
    mutationFn: async () => {
      if (!editionId) throw new Error("Édition indisponible");
      const server = await api.editionSelections(editionId);
      if (topicIdForArticle) {
        const cur = server.topics[topicIdForArticle] ?? [];
        const next = cur.includes(articleId)
          ? cur.filter((x) => x !== articleId)
          : [...cur, articleId];
        await api.editionTopicSelection(editionId, topicIdForArticle, next);
        return;
      }
      const cur = server.extra_article_ids ?? [];
      const next = cur.includes(articleId)
        ? cur.filter((x) => x !== articleId)
        : [...cur, articleId];
      await api.editionComposePreferences(editionId, { extra_selected_article_ids: next });
    },
    onMutate: async () => {
      if (!editionId) return undefined;
      await qc.cancelQueries({ queryKey: ["editionSelections", editionId] });
      const previous = qc.getQueryData<EditionSelectionsResponse>([
        "editionSelections",
        editionId,
      ]);
      if (!previous) return undefined;
      const server = previous;
      let next: EditionSelectionsResponse;
      if (topicIdForArticle) {
        const cur = server.topics[topicIdForArticle] ?? [];
        const ids = cur.includes(articleId)
          ? cur.filter((x) => x !== articleId)
          : [...cur, articleId];
        next = {
          ...server,
          topics: { ...server.topics, [topicIdForArticle]: ids },
        };
      } else {
        const cur = server.extra_article_ids ?? [];
        const ids = cur.includes(articleId)
          ? cur.filter((x) => x !== articleId)
          : [...cur, articleId];
        next = {
          ...server,
          extra_article_ids: ids,
        };
      }
      qc.setQueryData(["editionSelections", editionId], next);
      useSelectionStore.getState().hydrateFromServer(editionId, next);
      return { previous } as const;
    },
    onError: (_e, _v, ctx) => {
      if (!editionId || !ctx?.previous) return;
      qc.setQueryData(["editionSelections", editionId], ctx.previous);
      useSelectionStore.getState().hydrateFromServer(editionId, ctx.previous);
    },
    onSuccess: async () => {
      if (!editionId) return;
      const data = await qc.fetchQuery({
        queryKey: ["editionSelections", editionId],
        queryFn: () => api.editionSelections(editionId),
      });
      useSelectionStore.getState().hydrateFromServer(editionId, data);
    },
  });

  const hasEditionContext = Boolean(editionIdFromQuery || editionDate);
  if (!hasEditionContext) return null;
  if (!editionIdFromQuery && editionDate && editionByDateQ.isPending) {
    return (
      <button
        type="button"
        disabled
        className="olj-btn-secondary px-2.5 py-1 text-[11px] opacity-50"
      >
        Édition…
      </button>
    );
  }
  if (!editionIdFromQuery && editionDate && editionByDateQ.isError) return null;
  if (!editionId) return null;

  if (topicsQ.isPending || selectionsQ.isPending) {
    return (
      <button
        type="button"
        disabled
        className="olj-btn-secondary px-2.5 py-1 text-[11px] opacity-50"
      >
        Sommaire…
      </button>
    );
  }

  return (
    <button
      type="button"
      className="olj-btn-secondary px-2.5 py-1 text-[11px] disabled:opacity-45"
      disabled={toggleMutation.isPending}
      title={
        topicIdForArticle
          ? "Coche ou décoche cet article pour le sujet correspondant dans le sommaire."
          : "Ajoute ou retire cet article des textes hors sujet (sélection rédaction)."
      }
      onClick={() => toggleMutation.mutate()}
    >
      {toggleMutation.isPending
        ? "…"
        : selectedSommaire
          ? "Retirer du sommaire"
          : "Inclure au sommaire"}
    </button>
  );
}

function ArticlePane({
  articleId,
  onClose,
}: {
  articleId: string;
  onClose: () => void;
}) {
  const [copiedSynth, setCopiedSynth] = useState(false);

  const q = useQuery({
    queryKey: articleDetailQueryKey(articleId),
    queryFn: () => api.articleById(articleId),
    enabled: Boolean(articleId),
    staleTime: ARTICLE_QUERY_STALE_MS,
  });

  useEffect(() => {
    setCopiedSynth(false);
  }, [articleId]);

  const a: Article | undefined = q.data;
  const title = a
    ? decodeHtmlEntities((a.title_fr?.trim() || a.title_original || "Article").trim())
    : "Article";
  const typeFr = articleTypeLabelFr(a?.article_type);
  const langFr = sourceLanguageLabelFr(a?.source_language);
  const hasBodyFr = Boolean(a?.content_translated_fr?.trim());
  const summaryOnly = Boolean(a?.en_translation_summary_only) && !hasBodyFr;
  const hasOriginalBody = Boolean(a?.content_original?.trim());
  const cc = (a?.country_code ?? "").trim().toUpperCase();
  const flag = cc ? REGION_FLAG_EMOJI[cc] : null;
  const authorLine = a ? formatAuthorDisplay(a.author) : null;
  const relevanceLbl =
    a != null ? relevanceBandLabelFr(a.relevance_band, a.editorial_relevance) : null;

  const hasBullets = Boolean(a?.analysis_bullets_fr?.length);
  const hasThesis = Boolean(a?.author_thesis_explicit_fr?.trim());
  const hasContext = Boolean(a?.factual_context_fr?.trim());
  const hasAnalysis = hasBullets || hasThesis || hasContext;

  return (
    <div className="px-5 py-5 sm:px-6 sm:py-6">
      {q.isPending ? (
        <div className="space-y-3" role="status" aria-label="Chargement">
          <div className="h-5 w-1/3 animate-pulse rounded bg-muted/60" />
          <div className="h-7 w-3/4 animate-pulse rounded bg-muted/50" />
          <div className="h-4 w-full animate-pulse rounded bg-muted/40" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted/40" />
          <div className="h-24 w-full animate-pulse rounded bg-muted/30" />
        </div>
      ) : q.isError ? (
        <p className="olj-alert-destructive px-3 py-2" role="alert">
          {q.error instanceof Error
            ? q.error.message
            : "Impossible de charger l\u2019article."}
        </p>
      ) : a ? (
        <article className="space-y-5">
          {/* ── HEADER ──────────────────────────────────────── */}
          <header className="space-y-2">
            <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
              {flag && (
                <span className="text-[16px] leading-none" aria-hidden>
                  {flag}
                </span>
              )}
              {(a.country?.trim() || cc) && (
                <span>{a.country?.trim() || cc}</span>
              )}
              <span className="text-border" aria-hidden>&middot;</span>
              <span className="font-semibold text-foreground">{a.media_name}</span>
              {authorLine && (
                <>
                  <span className="text-border" aria-hidden>&middot;</span>
                  <span className="font-medium text-foreground-body">{authorLine}</span>
                </>
              )}
              {a.published_at && (
                <>
                  <span className="text-border" aria-hidden>&middot;</span>
                  <time dateTime={a.published_at} className="tabular-nums">
                    {formatPublishedAtFr(a.published_at, "short")}
                  </time>
                </>
              )}
              {langFr && (
                <>
                  <span className="text-border" aria-hidden>&middot;</span>
                  <span>{langFr}</span>
                </>
              )}
              {typeFr && (
                <>
                  <span className="text-border" aria-hidden>&middot;</span>
                  <span className="font-medium">{typeFr}</span>
                </>
              )}
            </p>

            <h2
              id="article-read-title"
              className="font-[family-name:var(--font-serif)] text-[20px] font-semibold leading-snug text-foreground"
            >
              {title}
            </h2>

            {a.title_fr && a.title_original && a.title_fr !== a.title_original && (
              <p className="text-[11px] text-muted-foreground">
                Titre d&apos;origine : {decodeHtmlEntities(a.title_original)}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {relevanceLbl && (
                <span className="inline-flex rounded border border-border bg-muted/20 px-2 py-0.5 text-[10px] font-medium text-foreground-body">
                  Pertinence : {relevanceLbl}
                </span>
              )}
              <button
                type="button"
                className="olj-btn-secondary px-2.5 py-1 text-[11px] disabled:opacity-40"
                disabled={!buildSynthesisPlainText(a).trim()}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(buildSynthesisPlainText(a));
                    setCopiedSynth(true);
                    window.setTimeout(() => setCopiedSynth(false), 2000);
                  } catch {
                    setCopiedSynth(false);
                  }
                }}
              >
                {copiedSynth ? "Copié" : "Copier la synthèse"}
              </button>
              {a.url && (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="olj-btn-secondary px-2.5 py-1 text-[11px]"
                >
                  Source ↗
                </a>
              )}
              <Link
                href={`/articles/${articleId}`}
                className="olj-btn-secondary px-2.5 py-1 text-[11px]"
                onClick={onClose}
              >
                Pleine page
              </Link>
              <Suspense fallback={null}>
                <ArticlePaneSommaireSelection articleId={articleId} />
              </Suspense>
            </div>
          </header>

          <hr className="border-t border-border" />

          {a.analysis_display_hint_fr &&
          a.analysis_display_state &&
          a.analysis_display_state !== "complete" ? (
            <p
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-[11px] leading-snug",
                a.analysis_display_state.startsWith("skipped")
                  ? "border-border-light bg-muted/25 text-muted-foreground"
                  : "border-accent/20 bg-accent/5 text-foreground-body",
              )}
            >
              {a.analysis_display_hint_fr}
            </p>
          ) : null}

          {(a.author_thesis_explicit_fr?.trim() || a.thesis_summary_fr?.trim()) && (
            <section className="space-y-2">
              <SectionLabel>Thèse</SectionLabel>
              <p className="font-[family-name:var(--font-serif)] text-[15px] italic leading-relaxed text-foreground-body">
                {(a.author_thesis_explicit_fr?.trim() || a.thesis_summary_fr?.trim())}
              </p>
            </section>
          )}

          {hasBullets && (
            <section className="space-y-2.5">
              <SectionLabel>Points clés</SectionLabel>
              <ol className="space-y-2.5">
                {a.analysis_bullets_fr!.map((b, i) => {
                  const line = normalizeBulletLine(b);
                  if (!line) return null;
                  return (
                    <li
                      key={i}
                      className="flex gap-2.5 text-[13px] leading-[1.55] text-foreground-body"
                    >
                      <span className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent/8 text-[10px] font-semibold tabular-nums text-accent">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">{line}</span>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {hasContext && (
            <section className="space-y-2">
              <SectionLabel>Contexte factuel</SectionLabel>
              <p className="text-[13px] leading-relaxed text-foreground-body">
                {a.factual_context_fr!.trim()}
              </p>
            </section>
          )}

          {!hasAnalysis && !a.thesis_summary_fr?.trim() && (
            <p className="text-[13px] italic text-muted-foreground">
              L&apos;analyse structurée sera disponible après le prochain passage pipeline.
            </p>
          )}

          {a.summary_fr?.trim() && (
            <section className="space-y-2">
              <SectionLabel>Résumé</SectionLabel>
              <div className="space-y-3 rounded-md border border-border-light bg-surface-warm/20 px-4 py-3.5 font-[family-name:var(--font-serif)] text-[14px] leading-[1.8] text-foreground-body">
                {bodyParagraphs(a.summary_fr.trim()).map((para, i) => (
                  <p
                    key={i}
                    className={
                      i === 0
                        ? "[&:first-letter]:float-left [&:first-letter]:mr-2 [&:first-letter]:font-[family-name:var(--font-serif)] [&:first-letter]:text-[3rem] [&:first-letter]:leading-[0.85] [&:first-letter]:text-accent"
                        : ""
                    }
                  >
                    {para}
                  </p>
                ))}
              </div>
            </section>
          )}

          {a.key_quotes_fr && a.key_quotes_fr.length > 0 && (
            <section className="space-y-2">
              <SectionLabel>Citations</SectionLabel>
              <ul className="space-y-2.5 rounded-md border border-border-light bg-muted/10 px-4 py-3">
                {a.key_quotes_fr.map((quote, i) => (
                  <li
                    key={i}
                    className="font-[family-name:var(--font-serif)] text-[13px] italic leading-relaxed text-foreground-subtle"
                  >
                    «&nbsp;{formatQuoteForDisplay(quote)}&nbsp;»
                  </li>
                ))}
              </ul>
            </section>
          )}

          {hasBodyFr && (
            <section className="space-y-2">
              <SectionLabel>Traduction intégrale</SectionLabel>
              <div className="space-y-4 rounded-md border border-border-light bg-surface-warm/20 px-4 py-4 font-[family-name:var(--font-serif)] text-[14px] leading-[1.85] text-foreground-body">
                {editorialBodySections(
                  sanitizeTranslatedBodyForDisplay(a.content_translated_fr!.trim()),
                ).map((sec, si) => (
                  <div
                    key={si}
                    className={si > 0 ? "mt-6 border-t border-border-light pt-6" : ""}
                  >
                    {sec.heading ? (
                      <p className="mb-3 font-semibold text-foreground">
                        {sec.heading}
                      </p>
                    ) : null}
                    {sec.paragraphs.map((para, i) => (
                      <p
                        key={i}
                        className={cn(
                          "mb-[1.1em] last:mb-0",
                          i === 0 && si === 0
                            ? "[&:first-letter]:float-left [&:first-letter]:mr-2 [&:first-letter]:text-[3.25rem] [&:first-letter]:leading-[0.85] [&:first-letter]:text-accent"
                            : "",
                        )}
                      >
                        {para}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}

          {summaryOnly && !hasBodyFr && (
            <p className="text-[12px] text-muted-foreground">
              Corps traduit non persisté (résumé seulement). Voir la source originale.
            </p>
          )}

          {!hasBodyFr && !summaryOnly && hasOriginalBody && (
            <section className="space-y-2">
              <SectionLabel>Texte source (langue d&apos;origine)</SectionLabel>
              <div className="space-y-3 rounded-md border border-border-light bg-muted/20 px-4 py-3 font-[family-name:var(--font-serif)] text-[13px] leading-[1.75] text-foreground-body">
                {bodyParagraphs(a.content_original!.trim()).map((para, i) => (
                  <p key={i}>
                    {para}
                  </p>
                ))}
              </div>
            </section>
          )}

          <hr className="border-t border-border" />

          <footer className="space-y-1 text-[11px] text-muted-foreground">
            {a.analysis_tone && (
              <p><span className="font-medium text-foreground-body">Tonalité : </span>{a.analysis_tone}</p>
            )}
            {a.fact_opinion_quality && (
              <p><span className="font-medium text-foreground-body">Fait / opinion : </span>{a.fact_opinion_quality}</p>
            )}
            {a.framing_actor && (
              <p><span className="font-medium text-foreground-body">Angle : </span>{a.framing_actor}</p>
            )}
            {a.framing_tone && (
              <p><span className="font-medium text-foreground-body">Registre : </span>{a.framing_tone}</p>
            )}
            {a.framing_prescription && (
              <p><span className="font-medium text-foreground-body">Proposition : </span>{a.framing_prescription}</p>
            )}
            {a.editorial_angle?.trim() && (
              <p><span className="font-medium text-foreground-body">Angle éditorial : </span>{a.editorial_angle.trim()}</p>
            )}
          </footer>
        </article>
      ) : null}
    </div>
  );
}
