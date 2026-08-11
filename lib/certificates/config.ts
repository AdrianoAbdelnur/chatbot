const DEFAULT_REPORT_WINDOW_MINUTES = 60;
const MAX_REPORT_WINDOW_MINUTES = 1_440;

/**
 * How recently a vehicle must have reported for a coverage certificate to be
 * issued. The certificate states that the equipment is transmitting, so the
 * evidence backing it has to be recent.
 */
export function getCertificateReportWindowMinutes(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const rawValue = environment.CERTIFICATE_REPORT_WINDOW_MINUTES;

  if (!rawValue) {
    return DEFAULT_REPORT_WINDOW_MINUTES;
  }

  const windowMinutes = Number(rawValue);

  if (
    !Number.isInteger(windowMinutes) ||
    windowMinutes < 1 ||
    windowMinutes > MAX_REPORT_WINDOW_MINUTES
  ) {
    throw new Error(
      "CERTIFICATE_REPORT_WINDOW_MINUTES must be an integer between 1 and 1440.",
    );
  }

  return windowMinutes;
}
