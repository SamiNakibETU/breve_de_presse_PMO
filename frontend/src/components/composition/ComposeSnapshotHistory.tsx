"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteComposeSnapshot,
  loadComposeSnapshots,
  type ComposeSnapshot,
} from "@/lib/compose-snapshots";
import { formatLogTimestampFr } from "@/lib/dates-display-fr";

interface Props {
  editionId: string | undefined;
}

export function ComposeSnapshotHistory({ editionId }: Props) {
  const [items, setItems] = useState<ComposeSnapshot[]>([]);
  const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    if (!editionId) {
      setItems([]);
      return;
    }
    setItems(loadComposeSnapshots(editionId));
  }, [editionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "olj.composeSnapshots.v1") refresh();
    };
    const onLocal: EventListener = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("olj-compose-snapshots-changed", onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("olj-compose-snapshots-changed", onLocal);
    };
  }, [refresh]);

  const copyBlock = useCallback(
    async (snapId: string, topicId: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text.trim());
        const key = `${snapId}:${topicId}`;
        setCopiedIds((prev) => new Set(prev).add(key));
        window.setTimeout(() => {
          setCopiedIds((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }, 2000);
      } catch {
        /* clipboard non disponible */
      }
    },
    [],
  );

  if (!editionId) return null;

  if (items.length === 0) {
    return (
      <section
        className="rounded-2xl border border-dashed border-border/40 bg-muted/5 px-4 py-4 sm:px-5"
        aria-label="Historique des générations"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Historique
        </p>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          Les instantanés apparaîtront ici après la première génération (données locales au navigateur).
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-border/50 bg-muted/10 px-4 py-4 sm:px-5"
      aria-labelledby="compose-snapshots-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="compose-snapshots-heading"
          className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
        >
          Historique ({items.length} génération{items.length > 1 ? "s" : ""})
        </h2>
        <span className="text-[10px] text-muted-foreground">Données locales au navigateur</span>
      </div>

      <ul className="mt-3 space-y-3">
        {items.map((snap) => (
          <li
            key={snap.id}
            className="rounded-xl border border-border/40 bg-background/80 px-3 py-3 sm:px-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-[11px] font-medium text-foreground">
                {formatLogTimestampFr(snap.savedAt)}
                <span className="ml-2 tabular-nums text-muted-foreground">
                  · {snap.topics.length} bloc{snap.topics.length > 1 ? "s" : ""}
                </span>
              </p>
              <button
                type="button"
                className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-destructive"
                onClick={() => {
                  deleteComposeSnapshot(snap.editionId, snap.id);
                  refresh();
                }}
              >
                Supprimer
              </button>
            </div>
            <ul className="mt-2 space-y-3 border-t border-border/30 pt-2">
              {snap.topics.map((t) => {
                const copyKey = `${snap.id}:${t.topicId}`;
                const isCopied = copiedIds.has(copyKey);
                return (
                  <li key={t.topicId} className="text-[12px] leading-snug">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium text-foreground">{t.title}</p>
                      <button
                        type="button"
                        className="shrink-0 rounded-md border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
                        onClick={() => void copyBlock(snap.id, t.topicId, t.generatedText)}
                      >
                        {isCopied ? "Copié ✓" : "Copier"}
                      </button>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {t.articleIds.length} article{t.articleIds.length > 1 ? "s" : ""} retenu
                      {t.articleIds.length > 1 ? "s" : ""}
                    </p>
                    <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/20 p-2 text-[11px] text-foreground-body">
                      {t.generatedText.trim()}
                    </p>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
