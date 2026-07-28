export type MonitoringSystem = "CYBERMAPA";

export type CompanyContact = {
  id: string;
  system: MonitoringSystem;
  companyName: string;
  companyKey: string;
  contactName: string;
  whatsappPhone: string;
  enabled: boolean;
  vehicleSource: "manual" | "platform";
  vehiclePlates: string[];
};

export type VehicleMonitoringObservation = {
  system: MonitoringSystem;
  companyName: string;
  plate: string;
  lastReportedAt: string;
  offlineHours: number;
  isOffline: boolean;
};

export type IncidentReconciliationResult = {
  created: number;
  updated: number;
  resolved: number;
};

export type OfflineIncidentForNotification = {
  id: string;
  system: MonitoringSystem;
  companyName: string;
  plate: string;
  lastReportedAt: string;
};

export type OfflineNotificationPreview = {
  system: MonitoringSystem;
  companyName: string;
  contactName: string;
  whatsappPhone: string;
  maskedWhatsappPhone: string;
  incidentIds: string[];
  vehicleCount: number;
  vehicleList: string;
  renderedText: string;
};
