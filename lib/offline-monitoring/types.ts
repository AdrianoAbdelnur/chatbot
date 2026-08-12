import type { OfflineOperationalStatus } from "./operational-status.ts";

export type { OfflineOperationalStatus };

export type MonitoringSystem = "CYBERMAPA";

export type RegistryIdentityStatus = "ok" | "identityConflict";

export type OfflineMonitoringRegistryVehicle = {
  vehicleId: string;
  system: MonitoringSystem;
  plate: string;
  gpsId: string | null;
  companyName: string;
  companyKey: string;
  present: boolean;
  enabled: boolean;
  identityStatus: RegistryIdentityStatus;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export type OfflineMonitoringCatalogVehicle = {
  system: MonitoringSystem;
  plate: string;
  gpsId?: string | null;
  companyName: string;
};

export type OperatorActor = {
  id: string;
  name: string;
};

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

export type DispatchScope = {
  companyName?: string;
};

export type OfflineIncidentAuditAction =
  | "status_change"
  | "comment_change"
  | "recheck"
  | "authorization";

export type OfflineIncidentAuditOutcome =
  | "applied"
  | "no_change"
  | "upstream_failure";

export type OfflineIncidentAuditEvent = {
  incidentId: string;
  action: OfflineIncidentAuditAction;
  actor: OperatorActor;
  before?: string | null;
  after?: string | null;
  outcome?: OfflineIncidentAuditOutcome;
  createdAt: string;
};

export type WhatsappQueryState =
  | "not_authorized"
  | "authorized_not_sent"
  | "dispatching"
  | "sent"
  | "failed";

export type OfflineBoardIncident = {
  id: string;
  system: MonitoringSystem;
  companyName: string;
  plate: string;
  lastReportedAt: string;
  authorizedAt?: string;
  initialNotificationId?: string;
  operationalStatus?: OfflineOperationalStatus;
  operatorComment?: string;
  reviewedAt?: string;
  reviewedBy?: OperatorActor;
};

export type OfflineBoardCustomerReply = {
  text: string;
  receivedAt: string;
};

export type OfflineBoardNotification = {
  status: "pending" | "accepted" | "failed" | "cancelled";
  failureReason?: string;
  customerReply?: OfflineBoardCustomerReply;
};

export type OfflineBoardRow = {
  id: string;
  system: MonitoringSystem;
  companyName: string;
  plate: string;
  lastReportedAt: string;
  offlineHours: number;
  operationalStatus: OfflineOperationalStatus | null;
  operatorComment: string | null;
  reviewedAt: string | null;
  reviewedBy: OperatorActor | null;
  authorizedAt: string | null;
  whatsappQueryState: WhatsappQueryState;
  whatsappFailureReason: string | null;
  whatsappCustomerReply: OfflineBoardCustomerReply | null;
};

export type SafeDispatchSummary = {
  companyName: string;
  notificationCount: number;
  acceptedCount: number;
  failedCount: number;
  skippedDuplicateCount: number;
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
