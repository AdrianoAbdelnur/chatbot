export const OFFLINE_OPERATIONAL_STATUSES = [
  "workshop",
  "technical_review",
  "consulted_pending_answer",
  "reporting_again",
  "customer_debt",
] as const;

export type OfflineOperationalStatus =
  (typeof OFFLINE_OPERATIONAL_STATUSES)[number];

export function isOfflineOperationalStatus(
  value: unknown,
): value is OfflineOperationalStatus {
  return (
    typeof value === "string" &&
    (OFFLINE_OPERATIONAL_STATUSES as readonly string[]).includes(value)
  );
}
