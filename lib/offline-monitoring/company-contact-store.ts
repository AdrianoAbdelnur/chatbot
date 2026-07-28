import { getMongoDatabase } from "../mongodb.ts";
import {
  normalizeVehiclePlate,
  validateVehiclePlate,
} from "../cybermapa/normalizers.ts";

import { normalizeMonitoringCompanyName } from "./normalizers.ts";
import type {
  CompanyContact,
  MonitoringSystem,
} from "./types.ts";

export const COMPANY_CONTACT_COLLECTION_NAME = "gps_company_contacts";

type CompanyContactDocument = {
  _id: string;
  system: MonitoringSystem;
  companyName: string;
  companyKey: string;
  contactName: string;
  whatsappPhone: string;
  enabled: boolean;
  vehicleSource?: "manual" | "platform";
  vehiclePlates?: string[];
  createdAt: string;
  updatedAt: string;
};

function normalizeWhatsAppPhone(value: string) {
  const phone = value.replace(/\D/g, "");

  if (phone.length < 8 || phone.length > 15) {
    throw new Error("The WhatsApp phone number is invalid.");
  }

  return phone;
}

function buildContactId(system: MonitoringSystem, companyKey: string) {
  return `${system}:${companyKey}`;
}

function toCompanyContact(
  document: CompanyContactDocument,
): CompanyContact {
  return {
    id: document._id,
    system: document.system,
    companyName: document.companyName,
    companyKey: document.companyKey,
    contactName: document.contactName,
    whatsappPhone: document.whatsappPhone,
    enabled: document.enabled,
    vehicleSource:
      document.vehicleSource === "manual" ? "manual" : "platform",
    vehiclePlates: [
      ...new Set(
        (document.vehiclePlates ?? [])
          .map(normalizeVehiclePlate)
          .filter(Boolean),
      ),
    ],
  };
}

export async function listEnabledCompanyContacts(
  system: MonitoringSystem,
) {
  const database = await getMongoDatabase();
  const documents = await database
    .collection<CompanyContactDocument>(COMPANY_CONTACT_COLLECTION_NAME)
    .find({ system, enabled: true })
    .toArray();

  return documents.map(toCompanyContact);
}

export async function upsertCompanyContact(input: {
  system: MonitoringSystem;
  companyName: string;
  contactName: string;
  whatsappPhone: string;
  enabled?: boolean;
  vehiclePlates?: string[];
}) {
  const companyName = input.companyName.trim().replace(/\s+/g, " ");
  const companyKey = normalizeMonitoringCompanyName(companyName);
  const contactName = input.contactName.trim().replace(/\s+/g, " ");
  const whatsappPhone = normalizeWhatsAppPhone(input.whatsappPhone);
  const vehiclePlates = input.vehiclePlates?.map((plate) => {
    const validatedPlate = validateVehiclePlate(plate);

    if (!validatedPlate) {
      throw new Error(`The vehicle plate ${plate} is invalid.`);
    }

    return validatedPlate;
  });

  if (!companyKey) {
    throw new Error("The company name is required.");
  }

  if (!contactName) {
    throw new Error("The contact name is required.");
  }

  const now = new Date().toISOString();
  const documentId = buildContactId(input.system, companyKey);
  const database = await getMongoDatabase();

  const contactUpdate = {
    system: input.system,
    companyName,
    companyKey,
    contactName,
    whatsappPhone,
    enabled: input.enabled ?? true,
    updatedAt: now,
    ...(vehiclePlates
      ? {
          vehicleSource: "manual" as const,
          vehiclePlates: [...new Set(vehiclePlates)],
        }
      : {}),
  };
  const contactInsert = {
    createdAt: now,
    ...(vehiclePlates
      ? {}
      : {
          vehicleSource: "platform" as const,
          vehiclePlates: [] as string[],
        }),
  };

  await database
    .collection<CompanyContactDocument>(COMPANY_CONTACT_COLLECTION_NAME)
    .updateOne(
      { _id: documentId },
      {
        $set: {
          ...contactUpdate,
        },
        $setOnInsert: {
          ...contactInsert,
        },
      },
      { upsert: true },
    );

  return documentId;
}
