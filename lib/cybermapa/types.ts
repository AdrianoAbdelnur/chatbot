export type CybermapaVehicle = {
  companyName: string;
  make: string;
  model: string;
  color: string;
  year: string;
  plate: string;
  description: string;
  gpsId: string;
  moduleName: string;
  alias: string;
  name: string;
};

export type CybermapaVehicleStatus = {
  name: string;
  alias: string;
  plate: string;
  gpsId: string;
  latitude: number;
  longitude: number;
  reportedAt: string;
  directionDegrees: number | null;
  speedKph: number | null;
  eventCode: string;
};

export type CybermapaVehicleReport = {
  plate: string;
  reportedAt: string;
};
