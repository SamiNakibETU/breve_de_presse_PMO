/** Erreur HTTP API avec contexte pour le débogage (UI + logs). */
export class ApiRequestError extends Error {
  readonly path: string;
  readonly method: string;
  readonly status: number;
  readonly responseBody: string;

  constructor(
    message: string,
    init: { path: string; method: string; status: number; responseBody: string },
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.path = init.path;
    this.method = init.method;
    this.status = init.status;
    this.responseBody = init.responseBody;
  }

  toDetailLines(): string[] {
    const body =
      this.responseBody.length > 2000
        ? `${this.responseBody.slice(0, 2000)}…`
        : this.responseBody;
    return [
      `${this.method} ${this.path} → HTTP ${this.status}`,
      body ? `Corps : ${body}` : "Corps vide",
    ];
  }
}

export function isApiRequestError(e: unknown): e is ApiRequestError {
  return e instanceof ApiRequestError;
}

export function formatErrorForDiagnostics(e: unknown): string {
  if (isApiRequestError(e)) {
    return `${e.method} ${e.path} HTTP ${e.status} — ${e.message}`;
  }
  if (e instanceof Error) {
    return `${e.name}: ${e.message}`;
  }
  return String(e);
}
