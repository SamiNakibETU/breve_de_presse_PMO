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
import { cn } from "@/lib/utils";

function SortableArticleRow({
  id,
  label,
  meta,
  onRemove,
  removeDisabled,
}: {
  id: string;
  label: string;
  meta?: string;
  onRemove?: (id: string) => void;
  removeDisabled?: boolean;
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
        "flex items-start gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-[12px]",
        isDragging && "z-10 opacity-90 shadow-md",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none pt-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={`Réordonner : ${label}`}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <div className="min-w-0 flex-1">
        <span className="font-medium text-foreground">{label}</span>
        {meta ? (
          <span className="block text-[11px] text-muted-foreground">{meta}</span>
        ) : null}
      </div>
      {onRemove ? (
        <button
          type="button"
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-destructive"
          disabled={removeDisabled}
          aria-label={`Retirer ${label}`}
          onClick={() => onRemove(id)}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export type ArticleReorderItem = {
  id: string;
  label: string;
  meta?: string;
};

type Props = {
  items: ArticleReorderItem[];
  onOrderChange: (orderedIds: string[]) => void;
  disabled?: boolean;
  /** Retire la coche côté édition (PATCH sélection). */
  onRemoveArticle?: (articleId: string) => void;
};

/**
 * Ordre des articles dans un sujet (persisté via PATCH …/selection avec liste ordonnée).
 */
export function ArticleReorderInTopic({
  items,
  onOrderChange,
  disabled = false,
  onRemoveArticle,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const ids = items.map((i) => i.id);

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
    const next = arrayMove(items, oldIndex, newIndex);
    onOrderChange(next.map((i) => i.id));
  };

  if (items.length <= 1) {
    return (
      <ul className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
        {items.map((i) => (
          <li
            key={i.id}
            className="flex items-start justify-between gap-2 text-[12px] leading-relaxed"
          >
            <div className="min-w-0">
              <span className="font-medium text-foreground">{i.label}</span>
              {i.meta ? (
                <span className="block text-[11px] text-muted-foreground">{i.meta}</span>
              ) : null}
            </div>
            {onRemoveArticle ? (
              <button
                type="button"
                className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
                disabled={disabled}
                aria-label={`Retirer ${i.label}`}
                onClick={() => onRemoveArticle(i.id)}
              >
                ×
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      autoScroll={!disabled}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-2">
          {items.map((i) => (
            <SortableArticleRow
              key={i.id}
              id={i.id}
              label={i.label}
              meta={i.meta}
              onRemove={onRemoveArticle}
              removeDisabled={disabled}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
