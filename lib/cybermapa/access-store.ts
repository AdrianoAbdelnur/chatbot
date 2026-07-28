import { getMongoDatabase } from "@/lib/mongodb";

import { normalizeVehiclePlate } from "./normalizers.ts";

type CybermapaAuthorizationDocument = {
  _id: string;
  enabled: boolean;
  allowAllVehicles: boolean;
  allowedVehicles: string[];
  createdAt: string;
  updatedAt: string;
};

export type CybermapaAuthorization = {
  whatsappPhone: string;
  allowAllVehicles: boolean;
  allowedVehicles: string[];
};

const COLLECTION_NAME = "cybermapa_authorizations";

export function normalizeWhatsAppPhone(value: string) {
  const normalizedPhone = value.replace(/\D/g, "");

  if (
    normalizedPhone.length < 8 ||
    normalizedPhone.length > 15
  ) {
    throw new Error("The WhatsApp phone number is invalid.");
  }

  return normalizedPhone;
}

export async function getCybermapaAuthorization(
  whatsappPhone: string,
): Promise<CybermapaAuthorization | null> {
  const normalizedPhone = normalizeWhatsAppPhone(whatsappPhone);
  const database = await getMongoDatabase();
  const document = await database
    .collection<CybermapaAuthorizationDocument>(COLLECTION_NAME)
    .findOne({
      _id: normalizedPhone,
      enabled: true,
    });

  if (!document) {
    return null;
  }

  return {
    whatsappPhone: normalizedPhone,
    allowAllVehicles: document.allowAllVehicles === true,
    allowedVehicles: [
      ...new Set(
        (Array.isArray(document.allowedVehicles)
          ? document.allowedVehicles
          : [])
          .filter(
            (plate): plate is string =>
              typeof plate === "string",
          )
          .map(normalizeVehiclePlate)
          .filter(Boolean),
      ),
    ],
  };
}

export function authorizationAllowsVehicle(
  authorization: CybermapaAuthorization,
  plate: string,
) {
  const normalizedPlate = normalizeVehiclePlate(plate);

  return (
    authorization.allowAllVehicles ||
    authorization.allowedVehicles.includes(normalizedPlate)
  );
}
