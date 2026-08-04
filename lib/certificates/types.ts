export type VehicleServiceFeatureKey =
  | "powerCut"
  | "panicAlarm"
  | "driverDoorSensor"
  | "passengerDoorSensor"
  | "sideDoorSensor"
  | "rearDoorSensor"
  | "hitchSensor"
  | "canbusReading"
  | "wifiConnectivity";

/**
 * Declaration order drives the order of the optional service bullets
 * printed on the coverage certificate.
 */
export const VEHICLE_SERVICE_FEATURE_KEYS: readonly VehicleServiceFeatureKey[] =
  [
    "powerCut",
    "panicAlarm",
    "driverDoorSensor",
    "passengerDoorSensor",
    "sideDoorSensor",
    "rearDoorSensor",
    "hitchSensor",
    "canbusReading",
    "wifiConnectivity",
  ];

export type VehicleServiceFeatures = Record<
  VehicleServiceFeatureKey,
  boolean
>;

export type VehicleServiceRecord = {
  plate: string;
  companyName: string;
  features: VehicleServiceFeatures;
  updatedAt: string;
};
