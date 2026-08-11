import assert from "node:assert/strict";
import test from "node:test";

import { matchCustomerRepliesToNotifications } from "../lib/offline-monitoring/customer-reply-match.ts";

const NOTIFICATIONS = [
  {
    id: "offline:older",
    whatsappPhone: "+54 381 555 0100",
    metaMessageId: "wamid.older",
    createdAt: "2026-08-05T09:00:00.000Z",
  },
  {
    id: "offline:latest",
    whatsappPhone: "+54 381 555 0100",
    metaMessageId: "wamid.latest",
    createdAt: "2026-08-05T10:00:00.000Z",
  },
  {
    id: "offline:other-company",
    whatsappPhone: "+54 381 555 0200",
    metaMessageId: "wamid.other",
    createdAt: "2026-08-05T09:00:00.000Z",
  },
];

test("matches a reply to its exact WhatsApp message context", () => {
  const replies = matchCustomerRepliesToNotifications(NOTIFICATIONS, [
    {
      from: "5493815550100",
      text: "La unidad esta en el taller.",
      receivedAt: "2026-08-05T11:00:00.000Z",
      contextMessageId: "wamid.older",
    },
  ]);

  assert.deepEqual(replies.get("offline:older"), {
    text: "La unidad esta en el taller.",
    receivedAt: "2026-08-05T11:00:00.000Z",
  });
  assert.equal(replies.has("offline:latest"), false);
});

test("matches a context-free reply made shortly after the latest notification", () => {
  const replies = matchCustomerRepliesToNotifications(NOTIFICATIONS, [
    {
      from: "5493815550100",
      text: "Ya esta reportando.",
      receivedAt: "2026-08-05T10:01:00.000Z",
    },
  ]);

  assert.equal(replies.get("offline:latest")?.text, "Ya esta reportando.");
});

test("does not auto-assign a delayed context-free reply", () => {
  const replies = matchCustomerRepliesToNotifications(NOTIFICATIONS, [
    {
      from: "5493815550100",
      text: "Mensaje de otra conversaci?n.",
      receivedAt: "2026-08-05T13:00:00.000Z",
    },
  ]);

  assert.equal(replies.size, 0);
});

test("never matches a reply from one company contact to another company", () => {
  const replies = matchCustomerRepliesToNotifications(NOTIFICATIONS, [
    {
      from: "5493815550200",
      text: "Respuesta de otra empresa.",
      receivedAt: "2026-08-05T11:00:00.000Z",
    },
  ]);

  assert.equal(replies.has("offline:latest"), false);
  assert.equal(replies.get("offline:other-company")?.text, "Respuesta de otra empresa.");
});
