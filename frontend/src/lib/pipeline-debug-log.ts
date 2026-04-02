export type PipelineStatusKind = "ok" | "error" | "skip" | "neutral";

export function inferPipelineStatus(
  payload: Record<string, unknown>,
  step: string,
): PipelineStatusKind {
  const stepL = step.toLowerCase();
  if (
    payload.error != null ||
    payload.failed === true ||
    payload.status === "error"
  ) {
    return "error";
  }
  if (payload.skipped === true || stepL.includes("skip")) {
    return "skip";
  }
  const reason = String(payload.reason ?? "");
  if (
    reason.includes("no_candidates") ||
    reason.includes("disabled") ||
    reason.includes("_off")
  ) {
    return "skip";
  }
  if (
    payload.ok === true ||
    payload.status === "ok" ||
    payload.status === "success"
  ) {
    return "ok";
  }
  if (typeof payload.done === "number" && payload.done > 0) {
    return "ok";
  }
  if (typeof payload.candidates === "number" && payload.candidates > 0) {
    return "ok";
  }
  if (
    typeof payload.candidates === "number" &&
    payload.candidates === 0 &&
    typeof payload.done === "number" &&
    payload.done === 0
  ) {
    return "skip";
  }
  return "neutral";
}

export function durationFromPayload(
  payload: Record<string, unknown>,
): string | null {
  const raw = payload.duration_ms ?? payload.ms ?? payload.latency_ms;
  if (typeof raw === "number" && raw >= 0) {
    return `${raw} ms`;
  }
  return null;
}

export function formatPayloadPretty(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}
