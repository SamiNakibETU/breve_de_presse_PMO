export default function RegieCuratorPage() {
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-[#555]">
      <h1 className="font-[family-name:var(--font-serif)] text-[20px] font-semibold text-[#1a1a1a]">
        Curateur
      </h1>
      <p>
        Journal des appels LLM : entrée JSON, sortie brute, invariants, diffs
        proposé / validé — via{" "}
        <code className="text-[12px]">llm_call_logs</code> (spec §5.6).
      </p>
    </div>
  );
}
