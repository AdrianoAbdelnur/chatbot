import type {
  OfflineCheckExecutionSummary,
  OfflineCheckOutcome,
  OfflineCheckOutcomeKind,
  OfflineCheckVehicleTarget,
} from "./types.ts";

export const outcomeKinds: OfflineCheckOutcomeKind[] = [
  "reporting",
  "delayed",
  "missing",
  "invalid",
  "failure",
];

const supportedObservations = new Set<OfflineCheckOutcomeKind>(["reporting", "delayed"]);

export function normalizeRequestedVehicles(
  vehicles: OfflineCheckVehicleTarget[],
): OfflineCheckVehicleTarget[] {
  const seen = new Set<string>();
  return vehicles.filter((vehicle) => {
    if (seen.has(vehicle.vehicleId)) return false;
    seen.add(vehicle.vehicleId);
    return true;
  });
}

function validateOutcome(outcome: OfflineCheckOutcome) {
  if (!outcomeKinds.includes(outcome.outcome)) {
    throw new Error(`unsupported outcome: ${outcome.outcome}`);
  }
  if (!supportedObservations.has(outcome.outcome) && outcome.observation) {
    throw new Error(`unsupported observation for ${outcome.outcome}`);
  }
  if (supportedObservations.has(outcome.outcome) && !outcome.observation) {
    throw new Error(`missing observation for ${outcome.outcome}`);
  }
}

export function createFailureOutcomes(
  vehicles: OfflineCheckVehicleTarget[],
  error = "source failure",
): OfflineCheckOutcome[] {
  return normalizeRequestedVehicles(vehicles).map(({ vehicleId }) => ({
    vehicleId,
    outcome: "failure",
    error,
  }));
}

export function calculateExecutionSummary(
  requestedVehicles: OfflineCheckVehicleTarget[],
  outcomes: OfflineCheckOutcome[],
): OfflineCheckExecutionSummary {
  const requested = normalizeRequestedVehicles(requestedVehicles);
  const requestedIds = new Set(requested.map(({ vehicleId }) => vehicleId));
  const unique = new Map<string, OfflineCheckOutcome>();

  for (const outcome of outcomes) {
    validateOutcome(outcome);
    if (!requestedIds.has(outcome.vehicleId)) {
      throw new Error(`outcome is outside requested scope: ${outcome.vehicleId}`);
    }
    if (unique.has(outcome.vehicleId)) continue;
    unique.set(outcome.vehicleId, outcome);
  }

  const counts = Object.fromEntries(outcomeKinds.map((kind) => [kind, 0])) as Record<OfflineCheckOutcomeKind, number>;
  for (const outcome of unique.values()) counts[outcome.outcome] += 1;
  const outcomeCount = unique.size;
  const status = requested.length === 0
    ? "completed"
    : outcomeCount < requested.length
    ? "partial"
    : counts.failure === requested.length
      ? "failed"
      : counts.failure > 0
        ? "partial"
        : "completed";

  return { requestedCount: requested.length, outcomeCount, counts, status };
}
