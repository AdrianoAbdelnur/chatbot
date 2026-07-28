import assert from "node:assert/strict";
import test from "node:test";

import { getAutomaticReplyMetaFailureReason } from "../lib/whatsapp-meta-error.ts";

test("formats safe Meta error details for automatic replies", () => {
  const reason = getAutomaticReplyMetaFailureReason(
    {
      error: {
        message: "The recipient is unavailable.",
        type: "OAuthException",
        code: 131047,
        error_subcode: 2494010,
      },
    },
    "secret-token",
  );

  assert.equal(
    reason,
    "The recipient is unavailable. (type=OAuthException, code=131047, subcode=2494010)",
  );
});

test("redacts the access token from Meta error messages", () => {
  const reason = getAutomaticReplyMetaFailureReason(
    {
      error: {
        message: "Token secret-token is invalid.",
        code: 190,
      },
    },
    "secret-token",
  );

  assert.equal(reason, "Token [redacted] is invalid. (code=190)");
});

test("uses a generic reason for malformed Meta errors", () => {
  assert.equal(
    getAutomaticReplyMetaFailureReason(null, "secret-token"),
    "Meta could not send the automatic reply.",
  );
});
