import type { ContentfulStatusCode } from "hono/utils/http-status";

/** A domain error that carries an HTTP status + a stable machine code. Caught by app.onError(). */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
  ) {
    super(code);
    this.name = "HttpError";
  }
}

export function httpError(status: ContentfulStatusCode, code: string): HttpError {
  return new HttpError(status, code);
}
