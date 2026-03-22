"use client";

import { useCallback, useState } from "react";

export function CopyExportButtons({
  text,
  filename,
}: {
  text: string;
  filename: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [text]);

  const download = useCallback(() => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [filename, text]);

  return (
    <div className="flex flex-wrap gap-3 text-[13px]">
      <button
        type="button"
        onClick={copy}
        className="border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-surface"
      >
        {copied ? "Copié" : "Copier"}
      </button>
      <button
        type="button"
        onClick={download}
        className="border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-surface"
      >
        Télécharger .txt
      </button>
    </div>
  );
}
