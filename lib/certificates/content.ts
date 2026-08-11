import {
  VEHICLE_SERVICE_FEATURE_KEYS,
  type VehicleServiceFeatureKey,
  type VehicleServiceFeatures,
} from "./types.ts";

const ARGENTINA_UTC_OFFSET_MS = 3 * 60 * 60 * 1_000;

const SPANISH_MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export const CERTIFICATE_CITY = "San Miguel de Tucumán";

/** Printed above the optional services, exactly as in the reference letter. */
const OPENING_BULLETS = [
  "Ubicación en mapa de vehículos.",
  "Seguimiento y posición en tiempo real.",
];

const CLOSING_BULLETS = [
  "Reporte histórico de posiciones, velocidad y eventos.",
  "Monitoreo las 24 hs. los 365 días del año.",
];

const OPTIONAL_BULLETS: Record<VehicleServiceFeatureKey, string> = {
  powerCut: "Activación remota de corte de corriente.",
  panicAlarm: "Activación de alarma de pánico.",
  driverDoorSensor: "Sensor de apertura de puerta de chofer.",
  passengerDoorSensor: "Sensor de apertura de puerta de acompañante.",
  sideDoorSensor: "Sensor de apertura de puerta lateral.",
  rearDoorSensor: "Sensor de apertura de puerta trasera.",
  hitchSensor: "Sensor de enganche y desenganche.",
  canbusReading: "Lectura de datos CAN bus del vehículo.",
  wifiConnectivity: "Conectividad WiFi.",
};

export type CertificateTextRun = {
  text: string;
  bold?: boolean;
};

export const CERTIFICATE_CLOSING: CertificateTextRun[] = [
  {
    text: "Se extiende el presente certificado a solicitud del interesado, para ser presentado ante quien corresponda.",
  },
];

export function formatCertificateDate(date: Date) {
  const localDate = new Date(date.getTime() - ARGENTINA_UTC_OFFSET_MS);
  const day = String(localDate.getUTCDate()).padStart(2, "0");

  return `${day} de ${SPANISH_MONTHS[localDate.getUTCMonth()]} de ${localDate.getUTCFullYear()}`;
}

/**
 * Only services confirmed by the source spreadsheet are listed. A certificate
 * must never claim capabilities the vehicle does not have.
 */
export function buildCertificateBullets(features: VehicleServiceFeatures) {
  return [
    ...OPENING_BULLETS,
    ...VEHICLE_SERVICE_FEATURE_KEYS.filter(
      (key) => features[key] === true,
    ).map((key) => OPTIONAL_BULLETS[key]),
    ...CLOSING_BULLETS,
  ];
}

export function buildCertificateParagraphs(
  plate: string,
): CertificateTextRun[][] {
  return [
    [
      {
        text: "Por medio de la presente, TRAILINGSAT S.A. certifica que la unidad identificada con dominio",
      },
      { text: plate, bold: true },
      {
        text: "cuenta con el servicio de seguimiento y monitoreo satelital de cargas provisto por nuestra empresa.",
      },
    ],
    [
      {
        text: "Este servicio, especialmente diseñado para unidades de transporte, incluye las siguientes prestaciones:",
      },
    ],
  ];
}
