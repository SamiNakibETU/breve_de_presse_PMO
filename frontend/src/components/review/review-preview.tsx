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
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    <div className="space-y-5">
      <div className="flex gap-2">
        <button
          onClick={copyToClipboard}
          className="bg-accent px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white hover:bg-accent/90"
        >
          {copied ? "Copié ✓" : "Copier"}
        </button>
        <button
          onClick={download}
          className="border border-border px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-foreground hover:bg-muted"
        >
          Télécharger
        </button>
      </div>

      <article className="mx-auto max-w-xl border-t border-b border-border py-6">
        <div className="whitespace-pre-wrap font-[family-name:var(--font-serif)] text-[15px] leading-[1.8] text-foreground">
          {text}
        </div>
      </article>
    </div>
  );
}
