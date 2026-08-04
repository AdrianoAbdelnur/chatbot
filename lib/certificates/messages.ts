import type { CertificateRequestResult } from "./certificate-service.ts";

const NEEDS_ASSISTANT_REASONS = new Set([
  "no_service_data",
  "vehicle_not_authorized",
  "delivery_failed",
]);

export function formatPlateList(plates: string[]) {
  if (plates.length <= 1) {
    return plates[0] ?? "";
  }

  return `${plates.slice(0, -1).join(", ")} y ${plates[plates.length - 1]}`;
}

function unitPhrase(plates: string[]) {
  return plates.length === 1
    ? `la unidad ${plates[0]}`
    : `las unidades ${formatPlateList(plates)}`;
}

function platesByReason(
  failures: Array<{ plate: string; reason: string }>,
  matches: (reason: string) => boolean,
) {
  return failures
    .filter((failure) => matches(failure.reason))
    .map((failure) => failure.plate);
}

function buildNotReportingBlocks(plates: string[]) {
  const isSingle = plates.length === 1;

  return [
    `${isSingle ? "El equipo de" : "Los equipos de"} ${unitPhrase(plates)} no ${isSingle ? "registra" : "registran"} reportes en la última hora, así que no podemos confirmar que ${isSingle ? "esté operativo y transmitiendo" : "estén operativos y transmitiendo"} a nuestra plataforma.`,
    `Si ${isSingle ? "está apagada" : "están apagadas"}, bajo techo o sin señal, por favor ${isSingle ? "encendela y ubicala" : "encendelas y ubicalas"} a cielo abierto para que el GPS pueda obtener posición.`,
  ];
}

function buildAssistantBlock(plates: string[]) {
  return `Por ${unitPhrase(plates)} necesito que te asista una persona del equipo. Decime por favor si querés que derive la conversación.`;
}

function join(blocks: string[]) {
  return blocks.filter(Boolean).join("\n\n");
}

/**
 * Turns a certificate outcome into the exact text the customer receives.
 * The wording lives here, never in the model, so a refusal is always phrased
 * the same way and never promises something the evidence does not support.
 */
export function buildCertificateReply(
  result: CertificateRequestResult,
): string {
  if (result.status === "invalid_request") {
    return "Para emitir un certificado necesito la patente exacta del vehículo. Podés pedirme hasta cinco por vez.";
  }

  if (result.status === "service_unavailable") {
    return "No puedo emitir certificados en este momento. Por favor, intentá de nuevo en unos minutos.";
  }

  if (result.status === "not_authorized") {
    return "Este número no está habilitado para emitir certificados de cobertura. Decime por favor si querés que derive la conversación a un asistente para revisarlo.";
  }

  if (result.status === "issued") {
    const issuedPlates = result.issued.map((entry) => entry.plate);
    const notReporting = platesByReason(
      result.failed,
      (reason) => reason === "no_recent_report",
    );
    const needAssistant = platesByReason(result.failed, (reason) =>
      NEEDS_ASSISTANT_REASONS.has(reason),
    );

    return join([
      issuedPlates.length === 1
        ? `Te envío el certificado de cobertura de ${issuedPlates[0]}.`
        : `Te envío los certificados de cobertura de ${formatPlateList(issuedPlates)}.`,
      ...(notReporting.length > 0
        ? [
            ...buildNotReportingBlocks(notReporting),
            "Avisame por favor cuando esté lista y vuelvo a verificar.",
          ]
        : []),
      ...(needAssistant.length > 0
        ? [buildAssistantBlock(needAssistant)]
        : []),
    ]);
  }

  if (result.status === "confirmation_required") {
    const notReporting = platesByReason(
      result.ineligible,
      (reason) => reason === "no_recent_report",
    );
    const needAssistant = platesByReason(result.ineligible, (reason) =>
      NEEDS_ASSISTANT_REASONS.has(reason),
    );

    return join([
      `Puedo confirmar actividad reciente en ${formatPlateList(result.eligible)}.`,
      ...(notReporting.length > 0
        ? buildNotReportingBlocks(notReporting)
        : []),
      ...(needAssistant.length > 0
        ? [buildAssistantBlock(needAssistant)]
        : []),
      notReporting.length > 0
        ? `Avisame por favor cuando quieras que verifique de nuevo. Si preferís no esperar, puedo emitir el certificado por ${result.eligible.length === 1 ? "la unidad confirmada" : "las unidades confirmadas"} y dejar el resto pendiente.`
        : `Si querés, emito el certificado por ${result.eligible.length === 1 ? "la unidad confirmada" : "las unidades confirmadas"} y dejamos el resto pendiente.`,
    ]);
  }

  const invalidPlates = platesByReason(
    result.ineligible,
    (reason) => reason === "invalid_plate",
  );
  const notReporting = platesByReason(
    result.ineligible,
    (reason) => reason === "no_recent_report",
  );
  const needAssistant = platesByReason(result.ineligible, (reason) =>
    NEEDS_ASSISTANT_REASONS.has(reason),
  );

  if (notReporting.length === 0 && needAssistant.length === 0) {
    return invalidPlates.length > 0
      ? "No pude reconocer la patente. Por favor, escribila completa y sin espacios, por ejemplo JIO573."
      : "No puedo emitir el certificado con los datos recibidos. Decime por favor si querés que derive la conversación a un asistente.";
  }

  return join([
    ...(notReporting.length > 0
      ? [
          "No puedo emitir el certificado todavía.",
          ...buildNotReportingBlocks(notReporting),
          "Avisame por favor cuando esté lista y vuelvo a verificar.",
        ]
      : []),
    ...(needAssistant.length > 0 ? [buildAssistantBlock(needAssistant)] : []),
  ]);
}
