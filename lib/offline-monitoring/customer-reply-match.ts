export type CustomerReplyNotification = {
  id: string;
  whatsappPhone: string;
  metaMessageId?: string;
  createdAt: string;
};

export type CustomerReplyMessage = {
  from: string;
  text: string;
  receivedAt: string;
  contextMessageId?: string;
};

export type CustomerReply = {
  text: string;
  receivedAt: string;
};

function normalizeWhatsappPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("549") ? `54${digits.slice(3)}` : digits;
}

function isAtOrAfter(left: string, right: string) {
  return new Date(left).getTime() >= new Date(right).getTime();
}

export function matchCustomerRepliesToNotifications(
  notifications: CustomerReplyNotification[],
  messages: CustomerReplyMessage[],
): Map<string, CustomerReply> {
  const replies = new Map<string, CustomerReply>();
  const sortedMessages = [...messages].sort((left, right) =>
    right.receivedAt.localeCompare(left.receivedAt),
  );

  for (const notification of notifications) {
    if (!notification.metaMessageId) {
      continue;
    }

    const phone = normalizeWhatsappPhone(notification.whatsappPhone);
    const reply = sortedMessages.find(
      (message) =>
        normalizeWhatsappPhone(message.from) === phone &&
        message.contextMessageId === notification.metaMessageId &&
        isAtOrAfter(message.receivedAt, notification.createdAt),
    );

    if (reply) {
      replies.set(notification.id, {
        text: reply.text,
        receivedAt: reply.receivedAt,
      });
    }
  }


  for (const message of sortedMessages) {
    if (message.contextMessageId) {
      continue;
    }

    const notification = notifications
      .filter((candidate) => {
        const receivedAt = new Date(message.receivedAt).getTime();
        const createdAt = new Date(candidate.createdAt).getTime();
        return (
          normalizeWhatsappPhone(candidate.whatsappPhone) ===
            normalizeWhatsappPhone(message.from) &&
          receivedAt >= createdAt &&
          receivedAt - createdAt <= 2 * 60 * 60 * 1000
        );
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

    if (notification && !replies.has(notification.id)) {
      replies.set(notification.id, {
        text: message.text,
        receivedAt: message.receivedAt,
      });
    }
  }

  return replies;
}

