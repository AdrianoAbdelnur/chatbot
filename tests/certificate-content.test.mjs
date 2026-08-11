import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { PDFDocument } from "pdf-lib";

import {
  buildCertificateBullets,
  buildCertificateParagraphs,
  formatCertificateDate,
} from "../lib/certificates/content.ts";
import { renderCoverageCertificate } from "../lib/certificates/renderer.ts";
import { VEHICLE_SERVICE_FEATURE_KEYS } from "../lib/certificates/types.ts";

function buildFeatures(enabledKeys = []) {
  const features = {};

  for (const key of VEHICLE_SERVICE_FEATURE_KEYS) {
    features[key] = enabledKeys.includes(key);
  }

  return features;
}

test("the issue date is rendered in Argentina local time", () => {
  assert.equal(
    formatCertificateDate(new Date("2026-07-06T12:00:00.000Z")),
    "06 de Julio de 2026",
  );
  // 01:30 UTC is still the previous day in Argentina.
  assert.equal(
    formatCertificateDate(new Date("2026-08-01T01:30:00.000Z")),
    "31 de Julio de 2026",
  );
});

test("a vehicle without extras still lists the four base services", () => {
  assert.deepEqual(buildCertificateBullets(buildFeatures()), [
    "Ubicación en mapa de vehículos.",
    "Seguimiento y posición en tiempo real.",
    "Reporte histórico de posiciones, velocidad y eventos.",
    "Monitoreo las 24 hs. los 365 días del año.",
  ]);
});

test("optional services are inserted between the base ones", () => {
  const bullets = buildCertificateBullets(
    buildFeatures(["powerCut", "panicAlarm"]),
  );

  assert.deepEqual(bullets, [
    "Ubicación en mapa de vehículos.",
    "Seguimiento y posición en tiempo real.",
    "Activación remota de corte de corriente.",
    "Activación de alarma de pánico.",
    "Reporte histórico de posiciones, velocidad y eventos.",
    "Monitoreo las 24 hs. los 365 días del año.",
  ]);
});

test("a disabled service never reaches the certificate", () => {
  const bullets = buildCertificateBullets(
    buildFeatures(["canbusReading"]),
  );

  assert.ok(bullets.includes("Lectura de datos CAN bus del vehículo."));
  assert.ok(!bullets.some((bullet) => bullet.includes("WiFi")));
  assert.ok(!bullets.some((bullet) => bullet.includes("pánico")));
});

test("every optional service has a printable label", () => {
  const bullets = buildCertificateBullets(
    buildFeatures([...VEHICLE_SERVICE_FEATURE_KEYS]),
  );

  assert.equal(bullets.length, VEHICLE_SERVICE_FEATURE_KEYS.length + 4);
  assert.ok(bullets.every((bullet) => bullet.trim().length > 0));
});

test("the plate is emphasized inside the certifying paragraph", () => {
  const [certifyingParagraph, servicesParagraph] =
    buildCertificateParagraphs("JIO573");
  const boldRun = certifyingParagraph.find((run) => run.bold);

  assert.equal(boldRun.text, "JIO573");
  assert.ok(
    certifyingParagraph[0].text.startsWith(
      "Por medio de la presente, TRAILINGSAT S.A. certifica",
    ),
  );
  assert.ok(
    servicesParagraph[0].text.endsWith("las siguientes prestaciones:"),
  );
});

test("the rendered certificate is a single-page PDF built on the template", async () => {
  const templateBytes = readFileSync("templates/certificate-base.pdf");
  const pdfBytes = await renderCoverageCertificate({
    plate: "JIO573",
    features: buildFeatures(["powerCut", "panicAlarm"]),
    issuedAt: new Date("2026-07-06T12:00:00.000Z"),
    templateBytes,
  });
  const pdf = await PDFDocument.load(pdfBytes);
  const template = await PDFDocument.load(templateBytes);

  assert.equal(pdf.getPageCount(), 1);
  assert.deepEqual(
    pdf.getPage(0).getSize(),
    template.getPage(0).getSize(),
  );
  assert.ok(pdfBytes.length > 1_000);
});
