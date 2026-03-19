"use client";

import { useState } from "react";

interface ReviewPreviewProps {
  text: string;
}

export function ReviewPreview({ text }: ReviewPreviewProps) {
  const [copied, setCopied] = useState(false);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function download() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `revue_presse_olj_${date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <button
          onClick={copyToClipboard}
          className="border border-foreground bg-foreground px-4 py-2 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90"
        >
          {copied ? "Copié ✓" : "Copier le texte"}
        </button>
        <button
          onClick={download}
          className="border border-border px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          Télécharger .txt
        </button>
      </div>

      <article className="mx-auto max-w-[var(--max-width-reading)] font-serif">
        <div className="whitespace-pre-wrap text-[15px] leading-[1.75] text-foreground">
          {text}
        </div>
      </article>
    </div>
  );
}
