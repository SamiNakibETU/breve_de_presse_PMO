export default function RegieLogsPage() {
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-foreground-body">
      <h1 className="font-[family-name:var(--font-serif)] text-[20px] font-semibold text-foreground">
        Logs
      </h1>
      <p>
        Flux structuré filtrable (INFO / WARN / ERROR) : à connecter au service
        de logging backend (spec §7.3).
      </p>
    </div>
  );
}
