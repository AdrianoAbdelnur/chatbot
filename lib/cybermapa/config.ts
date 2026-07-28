import { CybermapaError } from "./errors.ts";

export type CybermapaConfig = {
  apiUrl: string;
  user: string;
  password: string;
  timeoutMs: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 30_000;

function getTimeoutMs() {
  const rawValue = process.env.CYBERMAPA_TIMEOUT_MS;

  if (!rawValue) {
    return DEFAULT_TIMEOUT_MS;
  }

  const timeoutMs = Number(rawValue);

  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < MIN_TIMEOUT_MS ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new CybermapaError(
      "invalid_configuration",
      "CYBERMAPA_TIMEOUT_MS must be an integer between 1000 and 30000.",
    );
  }

  return timeoutMs;
}

export function getCybermapaConfig(): CybermapaConfig {
  const apiUrl = process.env.CYBERMAPA_API_URL;
  const user = process.env.CYBERMAPA_USER;
  const password = process.env.CYBERMAPA_PASSWORD;

  if (!apiUrl || !user || !password) {
    throw new CybermapaError(
      "not_configured",
      "Cybermapa is not configured.",
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(apiUrl);
  } catch (error) {
    throw new CybermapaError(
      "invalid_configuration",
      "CYBERMAPA_API_URL is invalid.",
      { cause: error },
    );
  }

  if (parsedUrl.protocol !== "https:") {
    throw new CybermapaError(
      "invalid_configuration",
      "CYBERMAPA_API_URL must use HTTPS.",
    );
  }

  return {
    apiUrl: parsedUrl.toString(),
    user,
    password,
    timeoutMs: getTimeoutMs(),
  };
}
