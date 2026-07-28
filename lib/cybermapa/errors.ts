export type CybermapaErrorCode =
  | "not_configured"
  | "invalid_configuration"
  | "request_failed"
  | "timeout"
  | "invalid_response";

export class CybermapaError extends Error {
  readonly code: CybermapaErrorCode;
  readonly status?: number;

  constructor(
    code: CybermapaErrorCode,
    message: string,
    options?: {
      cause?: unknown;
      status?: number;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = "CybermapaError";
    this.code = code;
    this.status = options?.status;
  }
}
