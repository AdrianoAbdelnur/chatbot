import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCertificateReply,
  formatPlateList,
} from "../lib/certificates/messages.ts";

test("plate lists read naturally in Spanish", () => {
  assert.equal(formatPlateList([]), "");
  assert.equal(formatPlateList(["JIO573"]), "JIO573");
  assert.equal(formatPlateList(["JIO573", "JIO574"]), "JIO573 y JIO574");
  assert.equal(
    formatPlateList(["JIO573", "JIO574", "GCG150"]),
    "JIO573, JIO574 y GCG150",
  );
});

test("a single issued certificate is announced in singular", () => {
  const text = buildCertificateReply({
    status: "issued",
    issued: [{ plate: "JIO573", reportedAt: "2026-07-31T13:50:00.000Z" }],
    failed: [],
  });

  assert.equal(
    text,
    "Te envío el certificado de cobertura de JIO573.",
  );
});

test("several issued certificates are announced in plural", () => {
  const text = buildCertificateReply({
    status: "issued",
    issued: [
      { plate: "JIO573", reportedAt: "2026-07-31T13:50:00.000Z" },
      { plate: "JIO574", reportedAt: "2026-07-31T13:55:00.000Z" },
    ],
    failed: [],
  });

  assert.ok(text.includes("los certificados de cobertura de JIO573 y JIO574"));
});

test("a vehicle that stopped reporting gets the power-on instructions", () => {
  const text = buildCertificateReply({
    status: "none_eligible",
    ineligible: [{ plate: "AA111BB", reason: "no_recent_report" }],
  });

  assert.ok(text.includes("no registra reportes en la última hora"));
  assert.ok(text.includes("por favor encendela y ubicala a cielo abierto"));
  assert.ok(text.includes("Avisame por favor"));
  assert.ok(!text.includes("undefined"));
});

test("several stale vehicles are addressed in plural", () => {
  const text = buildCertificateReply({
    status: "none_eligible",
    ineligible: [
      { plate: "AA111BB", reason: "no_recent_report" },
      { plate: "AA222CC", reason: "no_recent_report" },
    ],
  });

  assert.ok(text.includes("las unidades AA111BB y AA222CC"));
  assert.ok(text.includes("no registran reportes"));
  assert.ok(text.includes("encendelas y ubicalas"));
});

test("a mixed batch offers both waiting and partial issuing", () => {
  const text = buildCertificateReply({
    status: "confirmation_required",
    eligible: ["JIO573", "JIO574"],
    ineligible: [{ plate: "AA111BB", reason: "no_recent_report" }],
  });

  assert.ok(
    text.includes("Puedo confirmar actividad reciente en JIO573 y JIO574"),
  );
  assert.ok(text.includes("AA111BB"));
  assert.ok(text.includes("las unidades confirmadas"));
});

test("a vehicle outside the spreadsheet is escalated to a person", () => {
  const text = buildCertificateReply({
    status: "none_eligible",
    ineligible: [{ plate: "JIO579", reason: "no_service_data" }],
  });

  assert.ok(text.includes("necesito que te asista una persona del equipo"));
  assert.ok(text.includes("JIO579"));
  assert.ok(!text.includes("encendela"));
});

test("a plate belonging to someone else never leaks its status", () => {
  const text = buildCertificateReply({
    status: "none_eligible",
    ineligible: [{ plate: "AB290RG", reason: "vehicle_not_authorized" }],
  });

  assert.ok(text.includes("necesito que te asista una persona"));
  assert.ok(!text.includes("reportes"));
  assert.ok(!text.includes("apagada"));
});

test("an unreadable plate asks the customer to rewrite it", () => {
  const text = buildCertificateReply({
    status: "none_eligible",
    ineligible: [{ plate: "el rojo", reason: "invalid_plate" }],
  });

  assert.ok(text.includes("No pude reconocer la patente"));
});

test("an unauthorized sender is never told whether the vehicle exists", () => {
  const text = buildCertificateReply({ status: "not_authorized" });

  assert.ok(text.includes("no está habilitado"));
  assert.ok(!text.includes("reportes"));
});

test("a temporary failure invites retrying instead of blaming the customer", () => {
  const text = buildCertificateReply({ status: "service_unavailable" });

  assert.ok(text.includes("intentá de nuevo en unos minutos"));
});

test("issued certificates still report the vehicles left pending", () => {
  const text = buildCertificateReply({
    status: "issued",
    issued: [{ plate: "JIO573", reportedAt: "2026-07-31T13:50:00.000Z" }],
    failed: [
      { plate: "AA111BB", reason: "no_recent_report" },
      { plate: "JIO579", reason: "no_service_data" },
    ],
  });

  assert.ok(text.includes("Te envío el certificado de cobertura de JIO573."));
  assert.ok(text.includes("AA111BB"));
  assert.ok(text.includes("JIO579"));
  assert.ok(text.includes("asista una persona"));
});
