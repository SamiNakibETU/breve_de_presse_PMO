"use client";

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";

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
    a.download = `revue_presse_${date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={copyToClipboard}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" /> Copié
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" /> Copier dans le presse-papiers
            </>
          )}
        </button>
        <button
          onClick={download}
          className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <Download className="h-4 w-4" /> Télécharger .txt
        </button>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-muted p-5">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
          {text}
        </pre>
      </div>
    </div>
  );
}
