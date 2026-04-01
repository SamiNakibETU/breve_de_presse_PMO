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
}: {
  id: string;
  label: string;
  meta?: string;
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
};

/**
 * Ordre des articles dans un sujet (persisté via PATCH …/selection avec liste ordonnée).
 */
export function ArticleReorderInTopic({
  items,
  onOrderChange,
  disabled = false,
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
      <ul className="space-y-2 border-l-2 border-accent/25 pl-3">
        {items.map((i) => (
          <li key={i.id} className="text-[12px] leading-relaxed">
            <span className="font-medium text-foreground">{i.label}</span>
            {i.meta ? (
              <span className="block text-[11px] text-muted-foreground">{i.meta}</span>
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
        <div className="space-y-2 border-l-2 border-accent/25 pl-1">
          {items.map((i) => (
            <SortableArticleRow
              key={i.id}
              id={i.id}
              label={i.label}
              meta={i.meta}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
