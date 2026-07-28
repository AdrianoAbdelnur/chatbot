import {
  getCybermapaConfig,
  type CybermapaConfig,
} from "./config.ts";
import { CybermapaError } from "./errors.ts";

export type CybermapaReadAction = "GETVEHICULOS" | "DATOSACTUALES";

type CybermapaRequestParameters = Record<string, unknown>;

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type CybermapaClient = {
  request(
    action: CybermapaReadAction,
    parameters?: CybermapaRequestParameters,
  ): Promise<unknown>;
};

export function createCybermapaClient(
  config: CybermapaConfig,
  fetchImplementation: FetchImplementation = fetch,
): CybermapaClient {
  return {
    async request(action, parameters = {}) {
      let response: Response;

      try {
        response = await fetchImplementation(config.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...parameters,
            action,
            user: config.user,
            pwd: config.password,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (error) {
        const timedOut =
          error instanceof DOMException && error.name === "TimeoutError";

        throw new CybermapaError(
          timedOut ? "timeout" : "request_failed",
          timedOut
            ? "Cybermapa did not respond in time."
            : "Cybermapa could not be reached.",
          { cause: error },
        );
      }

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new CybermapaError(
          "request_failed",
          "Cybermapa rejected the request.",
          { status: response.status },
        );
      }

      if (payload === null) {
        throw new CybermapaError(
          "invalid_response",
          "Cybermapa returned an invalid JSON response.",
        );
      }

      return payload;
    },
  };
}

export function getCybermapaClient() {
  return createCybermapaClient(getCybermapaConfig());
}
