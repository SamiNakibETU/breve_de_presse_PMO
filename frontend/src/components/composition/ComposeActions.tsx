"use client";

interface ComposeActionsProps {
  editionId: string | undefined;
  topicsCount: number;
  topicsWithTwoPlusSelections: number;
  isGeneratingAll: boolean;
  isError: boolean;
  isPartial: boolean;
  errorMessage: string;
  copiedAll: boolean;
  onGenerateAll: () => void;
  onCopyAll: () => void;
  onSaveInstructions: () => void;
}

export function ComposeActions({
  editionId,
  topicsCount,
  topicsWithTwoPlusSelections,
  isGeneratingAll,
  isError,
  isPartial,
  errorMessage,
  copiedAll,
  onGenerateAll,
  onCopyAll,
  onSaveInstructions,
}: ComposeActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="olj-btn-primary px-4 py-2 text-[13px] disabled:opacity-50"
        disabled={
          !editionId ||
          isGeneratingAll ||
          topicsCount === 0 ||
          topicsWithTwoPlusSelections === 0
        }
        onClick={onGenerateAll}
        title={
          topicsWithTwoPlusSelections === 0
            ? "Cochez au moins deux articles dans un ou plusieurs grands sujets au sommaire."
            : undefined
        }
      >
        {isGeneratingAll ? "Rédaction en cours…" : "Rédiger les articles sélectionnés"}
      </button>
      <button
        type="button"
        className="olj-btn-secondary px-4 py-2 text-[13px] disabled:opacity-50"
        disabled={topicsCount === 0}
        onClick={onCopyAll}
      >
        {copiedAll ? "Copié" : "Copier toute la revue"}
      </button>
      <button
        type="button"
        className="olj-btn-secondary px-4 py-2 text-[13px]"
        onClick={onSaveInstructions}
      >
        Enregistrer les consignes
      </button>
      {isError && (
        <span className="text-[12px] text-accent" role="alert" aria-live="polite">
          {errorMessage || "Échec"}
        </span>
      )}
      {isPartial && (
        <span className="text-[12px] text-warning">
          Partiel : certains sujets ont échoué.
        </span>
      )}
    </div>
  );
}
