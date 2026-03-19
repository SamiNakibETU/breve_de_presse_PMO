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
        <div className="whitespace-pre-wrap font-[family-name:var(--font-serif)] text-[15px] leading-[1.8] text-[#1a1a1a]">
          {text}
        </div>
      </article>
    </div>
  );
}
