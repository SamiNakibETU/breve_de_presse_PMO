import type { EditionTopic } from "@/lib/types";
import { TopicCard } from "./TopicCard";
import Link from "next/link";

export function EditionSummary({
  topics,
  date,
  loading,
}: {
  topics: EditionTopic[];
  date: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <p className="text-[13px] text-foreground-muted">
        Préparation du sommaire…
      </p>
    );
  }
  if (topics.length === 0) {
    return (
      <p className="text-[13px] text-foreground-body">
        Aucun sujet pour cette édition pour le moment.
      </p>
    );
  }
  return (
    <div>
      <nav className="mb-3 border-b border-border pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Link href={`/edition/${date}/compose`} className="text-foreground">
          Composition
        </Link>
      </nav>
      <ol className="list-none">
        {topics.map((t) => (
          <TopicCard key={t.id} topic={t} date={date} />
        ))}
      </ol>
    </div>
  );
}
