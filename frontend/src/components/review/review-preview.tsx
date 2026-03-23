"use client";

import { useEffect, useState } from "react";

interface ReviewPreviewProps {
  text: string;
  /** Barre d’actions fixée en tête du panneau (scroll du texte en dessous). */
  stickyToolbar?: boolean;
}

export function ReviewPreview({ text, stickyToolbar }: ReviewPreviewProps) {
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

  const toolbar = (
    <div
      className={
        stickyToolbar
          ? "sticky top-0 z-10 -mx-1 mb-4 flex flex-wrap gap-2 border-b border-border bg-background px-1 py-3"
          : "flex flex-wrap gap-2"
      }
    >
      <button
        type="button"
        onClick={copyToClipboard}
        className="olj-btn-primary"
      >
        {copied ? "Copié ✓" : "Copier le texte"}
      </button>
      <button type="button" onClick={download} className="olj-btn-secondary">
        Télécharger .txt
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {toolbar}

      <article className="mx-auto max-w-2xl">
        <label className="olj-rubric mb-2 block">
          Ajustements avant copie
        </label>
        <textarea
          value={edited}
          onChange={(e) => setEdited(e.target.value)}
          spellCheck
          className="min-h-[280px] w-full resize-y border-b border-border bg-surface/30 px-0 py-3 font-[family-name:var(--font-serif)] text-[15px] leading-[1.75] text-foreground transition-colors focus:border-accent focus:outline-none"
        />
      </article>
    </div>
  );
}
