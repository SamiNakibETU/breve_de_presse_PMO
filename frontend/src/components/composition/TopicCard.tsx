import Link from "next/link";
import type { EditionTopic } from "@/lib/types";

export function TopicCard({
  topic,
  date,
}: {
  topic: EditionTopic;
  date: string;
}) {
  return (
    <li className="border-b border-border-light py-3">
      <Link
        href={`/edition/${date}/topic/${topic.id}`}
        className="group block border-l-2 border-transparent pl-3 transition-colors hover:border-accent/25"
      >
        <span className="font-[family-name:var(--font-serif)] text-[17px] leading-snug text-foreground group-hover:underline">
          {topic.title_final ?? topic.title_proposed}
        </span>
        {topic.dominant_angle && (
          <p className="mt-2 text-[13px] leading-relaxed text-foreground-body line-clamp-3">
            {topic.dominant_angle}
          </p>
        )}
      </Link>
    </li>
  );
}
