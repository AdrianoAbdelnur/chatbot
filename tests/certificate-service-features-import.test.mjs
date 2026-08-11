import assert from "node:assert/strict";
import test from "node:test";

import { parseVehicleServiceFeaturesCsv } from "../lib/certificates/service-features-import.ts";

const HEADER =
  "EMPRESA;PATENTE;CORTE;PANICO;SENSOR DE PUERTA DE CHOFER;SENSOR DE PUERTA DE ACOMPA¥ANTE;SENSOR DE PUERTA LATERAL;SENSOR DE PUERTA TRASERA;SENSOR DE ENGANCHE DESENGANCHE;LECTURA CANBUS;CONECTIVIDAD WIFI";

function buildCsv(...rows) {
  return [HEADER, ...rows].join("\r\n");
}

test("headers are matched despite the mangled code page", () => {
  const result = parseVehicleServiceFeaturesCsv(
    buildCsv("BUSEMA;BUA426;Si;Si;NO;Si;NO;NO;NO;NO;"),
  );

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].features.passengerDoorSensor, true);
  assert.equal(result.records[0].features.driverDoorSensor, false);
});

test("only an explicit affirmative enables a service", () => {
  const result = parseVehicleServiceFeaturesCsv(
    buildCsv("RUIZ BEJAR;AF115UK;Si;SÍ;-;;NO ;-;-;SI;"),
  );
  const [record] = result.records;

  assert.equal(record.features.powerCut, true);
  assert.equal(record.features.panicAlarm, true);
  assert.equal(record.features.driverDoorSensor, false);
  assert.equal(record.features.passengerDoorSensor, false);
  assert.equal(record.features.sideDoorSensor, false);
  assert.equal(record.features.canbusReading, true);
  assert.equal(record.features.wifiConnectivity, false);
  assert.equal(result.issues.length, 0);
});

test("plates and company names are normalized", () => {
  const result = parseVehicleServiceFeaturesCsv(
    buildCsv("EQUIPOS  La   Sevillanita;hkp219 ;Si;Si;NO;NO;NO;NO;NO;NO;"),
  );

  assert.equal(result.records[0].plate, "HKP219");
  assert.equal(result.records[0].companyName, "EQUIPOS La Sevillanita");
});

test("rows without a usable plate are discarded and reported", () => {
  const result = parseVehicleServiceFeaturesCsv(
    buildCsv(
      "SERVICIO Y EXPLOTACION MINERA; ;Si;Si;NO;NO;NO;NO;NO;-;-",
      "SUBIA TEO;FRS001;Si;Si;NO;NO;NO;NO;NO;NO;",
    ),
  );

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].plate, "FRS001");
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].reason, "invalid_plate");
  assert.equal(result.issues[0].line, 2);
});

test("an identical duplicate collapses into a single record", () => {
  const result = parseVehicleServiceFeaturesCsv(
    buildCsv(
      "BUSEMA;BUA426;Si;Si;NO;NO;NO;NO;NO;NO;",
      "BUSEMA;BUA426;Si;Si;NO;NO;NO;NO;NO;NO;",
    ),
  );

  assert.equal(result.records.length, 1);
  assert.equal(result.issues.length, 0);
});

test("a conflicting duplicate discards every copy", () => {
  const result = parseVehicleServiceFeaturesCsv(
    buildCsv(
      "BUSEMA;BUA426;Si;Si;NO;NO;NO;NO;NO;NO;",
      "BUSEMA;BUA426;Si;Si;Si;NO;NO;NO;NO;NO;",
      "SUBIA TEO;FRS001;Si;Si;NO;NO;NO;NO;NO;NO;",
    ),
  );

  assert.deepEqual(
    result.records.map((record) => record.plate),
    ["FRS001"],
  );
  assert.equal(result.issues[0].reason, "conflicting_duplicate_plate");
});

test("an unrecognized flag is reported and read as not installed", () => {
  const result = parseVehicleServiceFeaturesCsv(
    buildCsv("BUSEMA;BUA426;quizas;Si;NO;NO;NO;NO;NO;NO;"),
  );

  assert.equal(result.records[0].features.powerCut, false);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].reason, "unrecognized_flag_value");
});

test("a comma-delimited export is also supported", () => {
  const result = parseVehicleServiceFeaturesCsv(
    [
      "EMPRESA,PATENTE,CORTE,PANICO,SENSOR DE PUERTA DE CHOFER,SENSOR DE PUERTA DE ACOMPANANTE,SENSOR DE PUERTA LATERAL,SENSOR DE PUERTA TRASERA,SENSOR DE ENGANCHE DESENGANCHE,LECTURA CANBUS,CONECTIVIDAD WIFI",
      '"MASALA, CARLOS",LHW659,Si,Si,NO,NO,NO,NO,Si,NO,',
    ].join("\n"),
  );

  assert.equal(result.records[0].companyName, "MASALA, CARLOS");
  assert.equal(result.records[0].features.hitchSensor, true);
});

test("a spreadsheet missing a required column fails loudly", () => {
  assert.throws(
    () => parseVehicleServiceFeaturesCsv("EMPRESA;PATENTE;CORTE\nX;ABC123;Si"),
    /missing required columns/,
  );
});
