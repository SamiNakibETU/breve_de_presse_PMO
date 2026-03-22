"use client";

import { useEffect, useState } from "react";

interface ReviewPreviewProps {
  text: string;
}

export function ReviewPreview({ text }: ReviewPreviewProps) {
  const [edited, setEdited] = useState(text);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEdited(text);
  }, [text]);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(edited);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = edited;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const blob = new Blob([edited], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revue_presse_olj_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <button onClick={copyToClipboard} className="bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground hover:opacity-90">
          {copied ? "Copié ✓" : "Copier le texte"}
        </button>
        <button
          onClick={download}
          className="border border-border bg-card px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted"
        >
          Télécharger .txt
        </button>
      </div>

      <article className="mx-auto max-w-2xl border-t border-border pt-6">
        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Ajustements avant copie
        </label>
        <textarea
          value={edited}
          onChange={(e) => setEdited(e.target.value)}
          spellCheck
          className="min-h-[280px] w-full resize-y border border-border-light bg-muted/40 px-3 py-3 font-[family-name:var(--font-serif)] text-[15px] leading-[1.8] text-foreground focus:border-border focus:outline-none"
        />
      </article>
    </div>
  );
}
