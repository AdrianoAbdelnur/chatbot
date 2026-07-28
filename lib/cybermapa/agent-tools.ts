import { getMongoDatabase } from "@/lib/mongodb";

import {
  authorizationAllowsVehicle,
  getCybermapaAuthorization,
  normalizeWhatsAppPhone,
} from "./access-store.ts";
import { CybermapaError } from "./errors.ts";
import {
  normalizeVehiclePlate,
  validateVehicleIdentifier,
} from "./normalizers.ts";
import {
  getCurrentCybermapaVehicleStatus,
  getCybermapaVehicles,
} from "./services.ts";

type AgentToolOutcome =
  | "ok"
  | "not_authorized"
  | "vehicle_not_authorized"
  | "vehicle_not_found"
  | "vehicle_list_unavailable"
  | "invalid_request"
  | "service_unavailable";

type CybermapaAuditDocument = {
  senderPhone: string;
  tool: "get_authorized_vehicles" | "get_vehicle_status";
  requestedPlate?: string;
  outcome: AgentToolOutcome;
  createdAt: string;
};

const AUDIT_COLLECTION_NAME = "cybermapa_audit_events";
const MAX_VEHICLES_FOR_AGENT = 50;
let auditIndexesPromise: Promise<string[]> | null = null;

async function ensureAuditIndexes() {
  if (!auditIndexesPromise) {
    auditIndexesPromise = getMongoDatabase().then((database) => {
      const collection =
        database.collection<CybermapaAuditDocument>(
          AUDIT_COLLECTION_NAME,
        );

      return Promise.all([
        collection.createIndex({ senderPhone: 1, createdAt: -1 }),
        collection.createIndex({ tool: 1, createdAt: -1 }),
      ]);
    });
  }

  await auditIndexesPromise;
}

async function recordAuditEvent(
  document: CybermapaAuditDocument,
) {
  await ensureAuditIndexes();
  const database = await getMongoDatabase();

  await database
    .collection<CybermapaAuditDocument>(AUDIT_COLLECTION_NAME)
    .insertOne(document);
}

async function audit(
  senderPhone: string,
  tool: CybermapaAuditDocument["tool"],
  outcome: AgentToolOutcome,
  requestedPlate?: string,
) {
  try {
    await recordAuditEvent({
      senderPhone: normalizeWhatsAppPhone(senderPhone),
      tool,
      ...(requestedPlate ? { requestedPlate } : {}),
      outcome,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Auditing must not prevent the user from receiving a safe reply.
  }
}

function unavailableResult(error: unknown) {
  return {
    status: "service_unavailable" as const,
    message:
      error instanceof CybermapaError &&
      error.code === "not_configured"
        ? "Live tracking is not configured."
        : "Live tracking is temporarily unavailable.",
  };
}

export async function listAuthorizedVehiclesForAgent(
  senderPhone: string,
) {
  try {
    const authorization =
      await getCybermapaAuthorization(senderPhone);

    if (!authorization) {
      await audit(
        senderPhone,
        "get_authorized_vehicles",
        "not_authorized",
      );

      return {
        status: "not_authorized" as const,
        message:
          "This WhatsApp sender is not authorized to access tracking data.",
      };
    }

    const vehicles = (await getCybermapaVehicles()).filter(
      (vehicle) =>
        authorizationAllowsVehicle(
          authorization,
          vehicle.plate,
        ),
    );
    const limitedVehicles = vehicles.slice(
      0,
      MAX_VEHICLES_FOR_AGENT,
    );

    if (vehicles.length === 0) {
      await audit(
        senderPhone,
        "get_authorized_vehicles",
        "vehicle_list_unavailable",
      );

      return {
        status: "vehicle_list_unavailable" as const,
        message:
          "Cybermapa did not return a vehicle list. This does not mean the sender has no vehicle access.",
      };
    }

    await audit(
      senderPhone,
      "get_authorized_vehicles",
      "ok",
    );

    return {
      status: "ok" as const,
      vehicles: limitedVehicles.map((vehicle) => ({
        plate: vehicle.plate,
        alias: vehicle.alias,
        name: vehicle.name,
        description: vehicle.description,
      })),
      truncated: vehicles.length > limitedVehicles.length,
    };
  } catch (error) {
    await audit(
      senderPhone,
      "get_authorized_vehicles",
      "service_unavailable",
    );

    return unavailableResult(error);
  }
}

export async function getVehicleStatusForAgent(
  senderPhone: string,
  requestedIdentifier: unknown,
  requestedIdentifierType: unknown,
) {
  const identifier = validateVehicleIdentifier(
    requestedIdentifier,
    requestedIdentifierType,
  );

  if (!identifier) {
    await audit(
      senderPhone,
      "get_vehicle_status",
      "invalid_request",
    );

    return {
      status: "invalid_request" as const,
      message:
        "A valid exact plate, alias, or GPS identifier is required.",
    };
  }

  try {
    const authorization =
      await getCybermapaAuthorization(senderPhone);

    if (!authorization) {
      await audit(
        senderPhone,
        "get_vehicle_status",
        "not_authorized",
        identifier.type === "patente"
          ? identifier.value
          : undefined,
      );

      return {
        status: "not_authorized" as const,
        message:
          "This WhatsApp sender is not authorized to access tracking data.",
      };
    }

    if (
      identifier.type === "patente" &&
      !authorizationAllowsVehicle(
        authorization,
        identifier.value,
      )
    ) {
      await audit(
        senderPhone,
        "get_vehicle_status",
        "vehicle_not_authorized",
        identifier.value,
      );

      return {
        status: "vehicle_not_authorized" as const,
        message:
          "This WhatsApp sender is not authorized to access that vehicle.",
      };
    }

    const vehicleStatus =
      await getCurrentCybermapaVehicleStatus(
        identifier.value,
        identifier.type,
      );

    if (!vehicleStatus) {
      await audit(
        senderPhone,
        "get_vehicle_status",
        "vehicle_not_found",
        identifier.type === "patente"
          ? identifier.value
          : undefined,
      );

      return {
        status: "vehicle_not_found" as const,
        message:
          "Cybermapa did not return current data for that vehicle.",
      };
    }

    const resolvedPlate =
      normalizeVehiclePlate(vehicleStatus.plate);

    if (
      !resolvedPlate ||
      !authorizationAllowsVehicle(
        authorization,
        resolvedPlate,
      )
    ) {
      await audit(
        senderPhone,
        "get_vehicle_status",
        "vehicle_not_authorized",
        resolvedPlate || undefined,
      );

      return {
        status: "vehicle_not_authorized" as const,
        message:
          "This WhatsApp sender is not authorized to access that vehicle.",
      };
    }

    await audit(
      senderPhone,
      "get_vehicle_status",
      "ok",
      resolvedPlate,
    );

    return {
      status: "ok" as const,
      vehicle: {
        plate: resolvedPlate,
        alias: vehicleStatus.alias,
        name: vehicleStatus.name,
        latitude: vehicleStatus.latitude,
        longitude: vehicleStatus.longitude,
        reportedAt: vehicleStatus.reportedAt,
        speedKph: vehicleStatus.speedKph,
        directionDegrees: vehicleStatus.directionDegrees,
        eventCode: vehicleStatus.eventCode,
        mapUrl: `https://www.google.com/maps?q=${vehicleStatus.latitude},${vehicleStatus.longitude}`,
      },
    };
  } catch (error) {
    await audit(
      senderPhone,
      "get_vehicle_status",
      "service_unavailable",
      identifier.type === "patente"
        ? identifier.value
        : undefined,
    );

    return unavailableResult(error);
  }
}
