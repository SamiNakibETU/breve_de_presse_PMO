import Link from "next/link";
import type { EditionTopic } from "@/lib/types";

export function TopicCard({
  topic,
  date,
}: {
  topic: EditionTopic;
  date: string;
}) {
  const previews = topic.article_previews ?? [];
  const count =
    topic.article_count != null && topic.article_count > 0
      ? topic.article_count
      : previews.length;

  return (
    <li className="border-b border-border-light py-3">
      <div className="border-l-2 border-transparent pl-3 transition-colors hover:border-accent/25">
        <Link
          href={`/edition/${date}/topic/${topic.id}`}
          className="group block"
        >
          <span className="font-[family-name:var(--font-serif)] text-[17px] leading-snug text-foreground group-hover:underline">
            {topic.title_final ?? topic.title_proposed}
          </span>
          {(topic.angle_summary?.trim() || topic.dominant_angle) && (
            <p className="mt-2 text-[13px] leading-relaxed text-foreground-body line-clamp-3">
              {topic.angle_summary?.trim() || topic.dominant_angle}
            </p>
          )}
        </Link>

        {count > 0 && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            {count} article{count > 1 ? "s" : ""}
            {topic.article_count != null &&
              previews.length > 0 &&
              topic.article_count > previews.length && (
                <span> (aperçu : {previews.length})</span>
              )}
          </p>
        )}

        {previews.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {previews.map((p) => (
              <li key={p.id} className="text-[13px] leading-snug">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline-offset-2 hover:underline"
                >
                  {p.title_fr || p.title_original}
                </a>
                <span className="text-[12px] text-muted-foreground">
                  {" "}
                  · {p.media_name}
                </span>
              </li>
            ))}
          </ul>
        )}

        <Link
          href={`/edition/${date}/topic/${topic.id}`}
          className="mt-3 inline-block text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Voir le sujet
        </Link>
      </div>
    </li>
  );
}
