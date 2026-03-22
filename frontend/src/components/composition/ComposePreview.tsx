export function ComposePreview({ body }: { body: string }) {
  return (
    <pre className="whitespace-pre-wrap font-[family-name:var(--font-serif)] text-[15px] leading-relaxed text-foreground">
      {body}
    </pre>
  );
}
