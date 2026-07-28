const DEFAULT_OFFLINE_THRESHOLD_HOURS = 48;
const MAX_OFFLINE_THRESHOLD_HOURS = 8_760;

export function getOfflineThresholdHours(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const rawValue = environment.CYBERMAPA_OFFLINE_THRESHOLD_HOURS;

  if (!rawValue) {
    return DEFAULT_OFFLINE_THRESHOLD_HOURS;
  }

  const thresholdHours = Number(rawValue);

  if (
    !Number.isInteger(thresholdHours) ||
    thresholdHours < 1 ||
    thresholdHours > MAX_OFFLINE_THRESHOLD_HOURS
  ) {
    throw new Error(
      "CYBERMAPA_OFFLINE_THRESHOLD_HOURS must be an integer between 1 and 8760.",
    );
  }

  return thresholdHours;
}
