import { normalizeMonitoringCompanyName } from "./normalizers.ts";
import type {
  CompanyContact,
  OfflineIncidentForNotification,
  OfflineNotificationPreview,
} from "./types.ts";

export const MAX_VEHICLES_PER_OFFLINE_NOTIFICATION = 10;

function maskWhatsAppPhone(phone: string) {
  const visibleDigits = phone.slice(-4);
  return `${"*".repeat(Math.max(0, phone.length - 4))}${visibleDigits}`;
}

function formatArgentinaDate(isoDate: string) {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    throw new Error("An offline incident has an invalid last report date.");
  }

  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.day}/${values.month}/${values.year} ${values.hour}:${values.minute}`;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let startIndex = 0; startIndex < items.length; startIndex += size) {
    chunks.push(items.slice(startIndex, startIndex + size));
  }

  return chunks;
}

export function createOfflineNotificationPreviews(
  incidents: OfflineIncidentForNotification[],
  contacts: CompanyContact[],
) {
  const contactsByCompany = new Map(
    contacts.map((contact) => [
      `${contact.system}:${contact.companyKey}`,
      contact,
    ]),
  );
  const incidentsByContact = new Map<
    string,
    {
      contact: CompanyContact;
      incidents: OfflineIncidentForNotification[];
    }
  >();
  let skippedWithoutContact = 0;

  for (const incident of incidents) {
    const companyKey = normalizeMonitoringCompanyName(incident.companyName);
    const contactKey = `${incident.system}:${companyKey}`;
    const contact = contactsByCompany.get(contactKey);

    if (!contact) {
      skippedWithoutContact += 1;
      continue;
    }

    const existingGroup = incidentsByContact.get(contact.id);

    if (existingGroup) {
      existingGroup.incidents.push(incident);
    } else {
      incidentsByContact.set(contact.id, {
        contact,
        incidents: [incident],
      });
    }
  }

  const previews: OfflineNotificationPreview[] = [];

  for (const { contact, incidents: companyIncidents } of [
    ...incidentsByContact.values(),
  ].sort((left, right) =>
    left.contact.companyName.localeCompare(right.contact.companyName, "es"),
  )) {
    companyIncidents.sort((left, right) => left.plate.localeCompare(right.plate));

    for (const incidentBatch of chunk(
      companyIncidents,
      MAX_VEHICLES_PER_OFFLINE_NOTIFICATION,
    )) {
      const vehicleList = incidentBatch
        .map(
          (incident) =>
            `${incident.plate} (${formatArgentinaDate(incident.lastReportedAt)})`,
        )
        .join(" • ");
      const vehicleCount = incidentBatch.length;

      previews.push({
        system: contact.system,
        companyName: contact.companyName,
        contactName: contact.contactName,
        whatsappPhone: contact.whatsappPhone,
        maskedWhatsappPhone: maskWhatsAppPhone(contact.whatsappPhone),
        incidentIds: incidentBatch.map((incident) => incident.id),
        vehicleCount,
        vehicleList,
        renderedText:
          `Hola ${contact.contactName}. Detectamos ${vehicleCount} vehículos ` +
          "que superaron el límite de tiempo sin conexión:\n\n" +
          `${vehicleList}\n\n` +
          "Por favor, indicanos el motivo de cada vehículo. Si alguno debería " +
          "estar reportando, avisanos para derivarlo a revisión técnica.",
      });
    }
  }

  return { previews, skippedWithoutContact };
}
