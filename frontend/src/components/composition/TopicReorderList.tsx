"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EditionTopic } from "@/lib/types";
import { cn } from "@/lib/utils";

function SortableTopicRow({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children?: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-[13px]",
        isDragging && "z-10 opacity-90 shadow-md",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={`Réordonner : ${title}`}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <span className="min-w-0 flex-1 font-medium text-foreground">{title}</span>
      {children}
    </div>
  );
}

type Props = {
  topics: EditionTopic[];
  onOrderChange: (orderedIds: string[]) => void;
  disabled?: boolean;
  /** Si vrai : bloc repliable (fermé par défaut). */
  collapsible?: boolean;
};

/**
 * Réordonnancement des grands sujets (persisté via `user_rank` côté API).
 */
export function TopicReorderList({
  topics,
  onOrderChange,
  disabled = false,
  collapsible = false,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const ids = topics.map((t) => t.id);

  const onDragEnd = (event: DragEndEvent) => {
    if (disabled) {
      return;
    }
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    const next = arrayMove(topics, oldIndex, newIndex);
    onOrderChange(next.map((t) => t.id));
  };

  if (topics.length === 0) {
    return null;
  }

  const body = (
    <>
      {!collapsible ? (
        <h2
          id="topic-reorder-heading"
          className="olj-rubric mb-3 border-b border-border-light pb-2"
        >
          Ordre des sujets dans la revue
        </h2>
      ) : null}
      <p className="mb-4 text-[12px] leading-relaxed text-muted-foreground">
        Glissez le bloc pour changer l’ordre des paragraphes (génération « toute
        la revue » et copie globale).
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        autoScroll={!disabled}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {topics.map((t) => (
              <SortableTopicRow
                key={t.id}
                id={t.id}
                title={t.title_final ?? t.title_proposed}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {disabled
          ? "Enregistrement de l’ordre…"
          : "Enregistrement automatique après déplacement."}
      </p>
    </>
  );

  if (collapsible) {
    return (
      <details className="rounded-lg border border-border bg-card shadow-sm sm:p-0">
        <summary className="cursor-pointer list-none px-5 py-4 text-[13px] font-semibold text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
          Ordre des sujets dans la revue{" "}
          <span className="font-normal text-muted-foreground">— déplier pour modifier</span>
        </summary>
        <div
          className="border-t border-border-light px-5 pb-5 pt-2"
          aria-labelledby="topic-reorder-heading"
        >
          <h2 id="topic-reorder-heading" className="sr-only">
            Ordre des sujets dans la revue
          </h2>
          {body}
        </div>
      </details>
    );
  }

  return (
    <section
      aria-labelledby="topic-reorder-heading"
      className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      {body}
    </section>
  );
}
