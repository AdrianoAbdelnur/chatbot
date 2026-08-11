import { addOutgoingMessage } from "../whatsapp-message-store.ts";

import { listEnabledCompanyContacts } from "./company-contact-store.ts";
import { listUnnotifiedActiveOfflineIncidents } from "./incident-store.ts";
import { createOfflineNotificationPreviews } from "./notification-planner.ts";
import {
  markOfflineNotificationAccepted,
  markOfflineNotificationFailed,
  reserveOfflineNotification,
} from "./notification-store.ts";
import type { DispatchScope, OfflineNotificationPreview } from "./types.ts";
import {
  getOfflineTemplateConfig,
  getOfflineTemplateIdentity,
  OfflineTemplateRejectedError,
  sendOfflineNotificationTemplate,
} from "./whatsapp-template-client.ts";

type OfflineNotificationDependencies = {
  listIncidents: typeof listUnnotifiedActiveOfflineIncidents;
  listContacts(): ReturnType<typeof listEnabledCompanyContacts>;
  reserve: typeof reserveOfflineNotification;
  sendTemplate: typeof sendOfflineNotificationTemplate;
  markAccepted: typeof markOfflineNotificationAccepted;
  markFailed: typeof markOfflineNotificationFailed;
  trackOutgoing: typeof addOutgoingMessage;
};

const defaultDependencies: OfflineNotificationDependencies = {
  listIncidents: listUnnotifiedActiveOfflineIncidents,
  listContacts: () => listEnabledCompanyContacts("CYBERMAPA"),
  reserve: reserveOfflineNotification,
  sendTemplate: sendOfflineNotificationTemplate,
  markAccepted: markOfflineNotificationAccepted,
  markFailed: markOfflineNotificationFailed,
  trackOutgoing: addOutgoingMessage,
};

function toSafePreview(preview: OfflineNotificationPreview) {
  return {
    system: preview.system,
    companyName: preview.companyName,
    contactName: preview.contactName,
    recipient: preview.maskedWhatsappPhone,
    incidentIds: preview.incidentIds,
    vehicleCount: preview.vehicleCount,
    vehicleList: preview.vehicleList,
    renderedText: preview.renderedText,
  };
}

function toSafeFailure(preview: OfflineNotificationPreview, reason: string) {
  return {
    companyName: preview.companyName,
    recipient: preview.maskedWhatsappPhone,
    reason,
  };
}

export async function runOfflineNotificationDispatch(
  options: { send?: boolean; scope?: DispatchScope } = {},
  dependencies: OfflineNotificationDependencies = defaultDependencies,
) {
  const [incidents, contacts] = await Promise.all([
    dependencies.listIncidents(options.scope),
    dependencies.listContacts(),
  ]);
  const plan = createOfflineNotificationPreviews(incidents, contacts);
  const templateIdentity = getOfflineTemplateIdentity();

  if (!options.send) {
    return {
      send: false,
      template: templateIdentity,
      unnotifiedIncidentCount: incidents.length,
      notificationCount: plan.previews.length,
      skippedWithoutContact: plan.skippedWithoutContact,
      acceptedCount: 0,
      failedCount: 0,
      skippedDuplicateCount: 0,
      failures: [],
      notifications: plan.previews.map(toSafePreview),
    };
  }

  const templateConfig = getOfflineTemplateConfig();
  let acceptedCount = 0;
  let failedCount = 0;
  let skippedDuplicateCount = 0;
  const failures: ReturnType<typeof toSafeFailure>[] = [];

  for (const preview of plan.previews) {
    const notificationId = await dependencies.reserve({
      preview,
      templateName: templateConfig.name,
      templateLanguage: templateConfig.language,
    });

    if (!notificationId) {
      skippedDuplicateCount += 1;
      continue;
    }

    try {
      const messageId = await dependencies.sendTemplate(
        {
          to: preview.whatsappPhone,
          contactName: preview.contactName,
          vehicleCount: preview.vehicleCount,
          vehicleList: preview.vehicleList,
        },
        templateConfig,
      );

      await dependencies.markAccepted({
        notificationId,
        incidentIds: preview.incidentIds,
        metaMessageId: messageId,
      });
      await dependencies
        .trackOutgoing({
          id: messageId,
          to: preview.whatsappPhone,
          text: preview.renderedText,
          createdAt: new Date().toISOString(),
        })
        .catch(() => undefined);
      acceptedCount += 1;
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "The template send failed.";
      await dependencies.markFailed(
        notificationId,
        reason,
        {
          releaseForRetry: error instanceof OfflineTemplateRejectedError,
        },
      );
      failures.push(toSafeFailure(preview, reason));
      failedCount += 1;
    }
  }

  return {
    send: true,
    template: templateIdentity,
    unnotifiedIncidentCount: incidents.length,
    notificationCount: plan.previews.length,
    skippedWithoutContact: plan.skippedWithoutContact,
    acceptedCount,
    failedCount,
    skippedDuplicateCount,
    failures,
    notifications: plan.previews.map(toSafePreview),
  };
}
