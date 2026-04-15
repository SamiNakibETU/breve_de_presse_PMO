/**
 * Instantanés locaux après génération (sélection + texte) — navigateur uniquement.
 */

const STORAGE_KEY = "olj.composeSnapshots.v1";
const MAX_PER_EDITION = 25;

export type ComposeSnapshotTopicEntry = {
  topicId: string;
  title: string;
  articleIds: string[];
  generatedText: string;
};

export type ComposeSnapshot = {
  id: string;
  savedAt: string;
  editionId: string;
  editionDate: string;
  topics: ComposeSnapshotTopicEntry[];
};

type Store = {
  byEditionId: Record<string, ComposeSnapshot[]>;
};

function readStore(): Store {
  if (typeof window === "undefined") return { byEditionId: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { byEditionId: {} };
    const p = JSON.parse(raw) as Store;
    if (!p || typeof p.byEditionId !== "object") return { byEditionId: {} };
    return p;
  } catch {
    return { byEditionId: {} };
  }
}

function writeStore(s: Store): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota / privé */
  }
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadComposeSnapshots(editionId: string): ComposeSnapshot[] {
  const s = readStore();
  return [...(s.byEditionId[editionId] ?? [])].sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}

export function appendComposeSnapshot(snapshot: Omit<ComposeSnapshot, "id" | "savedAt">): void {
  if (typeof window === "undefined") return;
  if (snapshot.topics.length === 0) return;
  const s = readStore();
  const list = s.byEditionId[snapshot.editionId] ?? [];
  const next: ComposeSnapshot = {
    ...snapshot,
    id: newId(),
    savedAt: new Date().toISOString(),
  };
  const merged = [next, ...list].slice(0, MAX_PER_EDITION);
  s.byEditionId[snapshot.editionId] = merged;
  writeStore(s);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("olj-compose-snapshots-changed"));
  }
}

export function deleteComposeSnapshot(editionId: string, snapshotId: string): void {
  const s = readStore();
  const list = s.byEditionId[editionId];
  if (!list) return;
  s.byEditionId[editionId] = list.filter((x) => x.id !== snapshotId);
  writeStore(s);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("olj-compose-snapshots-changed"));
  }
}
