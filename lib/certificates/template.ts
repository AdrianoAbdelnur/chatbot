import { readFile } from "node:fs/promises";
import { join } from "node:path";

const TEMPLATE_RELATIVE_PATH = "templates/certificate-base.pdf";

let templatePromise: Promise<Uint8Array> | null = null;

/**
 * Reads the letterhead once per running instance. A failed read is not cached
 * so a transient filesystem error does not disable certificates permanently.
 */
export function getCertificateTemplateBytes() {
  if (!templatePromise) {
    templatePromise = readFile(
      join(process.cwd(), TEMPLATE_RELATIVE_PATH),
    ).catch((error: unknown) => {
      templatePromise = null;
      throw error instanceof Error
        ? new Error(
            `The certificate template could not be read: ${error.message}`,
          )
        : new Error("The certificate template could not be read.");
    });
  }

  return templatePromise;
}
