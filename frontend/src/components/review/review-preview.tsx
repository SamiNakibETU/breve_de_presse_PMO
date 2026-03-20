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
        <button onClick={copyToClipboard} className="bg-[#c8102e] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#a50d25]">
          {copied ? "Copié ✓" : "Copier le texte"}
        </button>
        <button onClick={download} className="border border-[#dddcda] bg-white px-4 py-2 text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f7f7f5]">
          Télécharger .txt
        </button>
      </div>

      <article className="mx-auto max-w-2xl border-t border-[#dddcda] pt-6">
        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#888]">
          Ajustements avant copie
        </label>
        <textarea
          value={edited}
          onChange={(e) => setEdited(e.target.value)}
          spellCheck
          className="min-h-[280px] w-full resize-y border border-[#eeede9] bg-[#fafaf8] px-3 py-3 font-[family-name:var(--font-serif)] text-[15px] leading-[1.8] text-[#1a1a1a] focus:border-[#ccc] focus:outline-none"
        />
      </article>
    </div>
  );
}
