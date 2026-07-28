import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeCybermapaText,
  findCybermapaVehicleStatusByIdentifier,
  findCybermapaVehicleStatusByPlate,
  normalizeVehiclePlate,
  parseCybermapaVehicles,
  parseCybermapaVehicleReports,
  parseCybermapaVehicleStatuses,
  validateVehicleIdentifier,
  validateVehiclePlate,
} from "../lib/cybermapa/normalizers.ts";
import { CybermapaError } from "../lib/cybermapa/errors.ts";

test("vehicle plates are normalized consistently", () => {
  assert.equal(normalizeVehiclePlate(" aa 123-bb "), "AA123BB");
  assert.equal(validateVehiclePlate("ABC 123"), "ABC123");
  assert.equal(validateVehiclePlate("A1"), null);
});

test("Cybermapa exact identifiers are validated by supported tipoID", () => {
  assert.deepEqual(
    validateVehicleIdentifier(" OAX 911 ", "patente"),
    { type: "patente", value: "OAX911" },
  );
  assert.deepEqual(
    validateVehicleIdentifier(" INT 47 Evelia SA ", "alias"),
    { type: "alias", value: "INT 47 Evelia SA" },
  );
  assert.deepEqual(
    validateVehicleIdentifier("865468050112807", "gps"),
    { type: "gps", value: "865468050112807" },
  );
  assert.equal(
    validateVehicleIdentifier("INT 47", "nombre"),
    null,
  );
  assert.equal(validateVehicleIdentifier("not-a-gps", "gps"), null);
});

test("Cybermapa percent-encoded names and aliases are decoded", () => {
  assert.equal(
    decodeCybermapaText("INT%2047%20Evelia%20SA"),
    "INT 47 Evelia SA",
  );
});

test("GETVEHICULOS responses are normalized", () => {
  assert.deepEqual(
    parseCybermapaVehicles([
      {
        nombre_empresa: "Trailingsat",
        patente: "AA 123 BB",
        descripcion: "Camión",
        id_gps: "123456",
        alias: "Unidad 1",
        nombre: "Móvil 1",
      },
    ]),
    [
      {
        companyName: "Trailingsat",
        make: "",
        model: "",
        color: "",
        year: "",
        plate: "AA 123 BB",
        description: "Camión",
        gpsId: "123456",
        moduleName: "",
        alias: "Unidad 1",
        name: "Móvil 1",
      },
    ],
  );
});

test("DATOSACTUALES responses convert numeric strings", () => {
  assert.deepEqual(
    parseCybermapaVehicleStatuses([
      {
        nombre: "Unidad 1",
        alias: "Móvil 1",
        patente: "ABC123",
        gps: "123456",
        latitud: "-34.55568800",
        longitud: "-58.46693600",
        fecha: "21/09/2016 11:48:32",
        sentido: "217",
        velocidad: "0",
        evento: "8",
      },
    ]),
    [
      {
        name: "Unidad 1",
        alias: "Móvil 1",
        plate: "ABC123",
        gpsId: "123456",
        latitude: -34.555688,
        longitude: -58.466936,
        reportedAt: "21/09/2016 11:48:32",
        directionDegrees: 217,
        speedKph: 0,
        eventCode: "8",
      },
    ],
  );
});

test("offline monitoring reports do not require coordinates", () => {
  assert.deepEqual(
    parseCybermapaVehicleReports([
      {
        patente: "OAX911",
        fecha: "2026-06-11%2010:19:23.123",
      },
    ]),
    [
      {
        plate: "OAX911",
        reportedAt: "2026-06-11 10:19:23.123",
      },
    ],
  );
});

test("invalid Cybermapa coordinates fail closed", () => {
  assert.throws(
    () =>
      parseCybermapaVehicleStatuses([
        {
          patente: "ABC123",
          latitud: "999",
          longitud: "-58.46",
          fecha: "21/09/2016 11:48:32",
        },
      ]),
    (error) =>
      error instanceof CybermapaError &&
      error.code === "invalid_response",
  );
});

test("a status for another plate is never used as a fallback", () => {
  const statuses = parseCybermapaVehicleStatuses([
    {
      patente: "ZZZ999",
      latitud: "-34.55",
      longitud: "-58.46",
      fecha: "21/09/2016 11:48:32",
    },
  ]);

  assert.equal(
    findCybermapaVehicleStatusByPlate(statuses, "ABC123"),
    null,
  );
});

test("status matching uses the exact supported identifier", () => {
  const statuses = parseCybermapaVehicleStatuses([
    {
      nombre: "INT%2047",
      alias: "INT%2047%20Evelia%20SA",
      patente: "OAX911",
      gps: "865468050112807",
      latitud: "-24.19",
      longitud: "-65.26",
      fecha: "11/06/2026 10:19:00",
    },
  ]);

  assert.equal(statuses[0].name, "INT 47");
  assert.equal(statuses[0].alias, "INT 47 Evelia SA");
  assert.equal(
    findCybermapaVehicleStatusByIdentifier(
      statuses,
      "INT 47 Evelia SA",
      "alias",
    )?.plate,
    "OAX911",
  );
  assert.equal(
    findCybermapaVehicleStatusByIdentifier(
      statuses,
      "865468050112807",
      "gps",
    )?.plate,
    "OAX911",
  );
  assert.equal(
    findCybermapaVehicleStatusByIdentifier(
      statuses,
      "INT 47",
      "alias",
    ),
    null,
  );
});
