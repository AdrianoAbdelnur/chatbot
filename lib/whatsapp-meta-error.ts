type MetaErrorResponse = {
  error?: {
    message?: unknown;
    type?: unknown;
    code?: unknown;
    error_subcode?: unknown;
  };
};

const MAX_META_ERROR_MESSAGE_LENGTH = 1_000;

export function getAutomaticReplyMetaFailureReason(
  payload: unknown,
  accessToken: string,
) {
  if (!payload || typeof payload !== "object") {
    return "Meta could not send the automatic reply.";
  }

  const error = (payload as MetaErrorResponse).error;

  if (!error || typeof error !== "object") {
    return "Meta could not send the automatic reply.";
  }

  const message =
    typeof error.message === "string"
      ? error.message
          .replaceAll(accessToken, "[redacted]")
          .slice(0, MAX_META_ERROR_MESSAGE_LENGTH)
      : "Meta rejected the automatic reply.";
  const metadata = [
    typeof error.type === "string" ? `type=${error.type}` : null,
    typeof error.code === "number" ? `code=${error.code}` : null,
    typeof error.error_subcode === "number"
      ? `subcode=${error.error_subcode}`
      : null,
  ].filter((value): value is string => value !== null);

  return metadata.length > 0
    ? `${message} (${metadata.join(", ")})`
    : message;
}
