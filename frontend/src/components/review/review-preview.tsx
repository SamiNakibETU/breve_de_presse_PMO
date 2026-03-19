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
    <div>
      <div className="mb-10 flex items-baseline gap-6 border-b border-border-light/60 pb-4">
        <button
          onClick={copyToClipboard}
          className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {copied ? "Copié" : "Copier"}
        </button>
        <button
          onClick={download}
          className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Télécharger .txt
        </button>
      </div>

      <article
        className="mx-auto max-w-[var(--max-width-reading)] font-serif"
        style={{ fontFamily: "var(--font-editorial, Georgia), serif" }}
      >
        <div className="whitespace-pre-wrap text-[16px] leading-[1.85] tracking-tight text-foreground">
          {text}
        </div>
      </article>
    </div>
  );
}
