"use client";

import { type FormEvent, useEffect, useState } from "react";

type ApiResponse = {
  success?: boolean;
  status?: "accepted";
  message?: string;
  error?: string;
  messageId?: string;
  trackingAvailable?: boolean;
};

type Feedback = {
  type: "info" | "error";
  text: string;
};

type IncomingMessage = {
  id: string;
  from: string;
  profileName?: string;
  type: string;
  text: string;
  receivedAt: string;
};

type DeliveryStatus = "accepted" | "sent" | "delivered" | "read" | "failed";

type OutgoingMessage = {
  id: string;
  to: string;
  text: string;
  status: DeliveryStatus;
  createdAt: string;
  updatedAt: string;
  statusTimestamp?: string;
  failureReason?: string;
};

type MessagesResponse = {
  messages?: IncomingMessage[];
  outgoingMessages?: OutgoingMessage[];
};

const DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  accepted: "Accepted",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
};

function getDeliveryFeedback(message: OutgoingMessage): Feedback {
  if (message.status === "failed") {
    return {
      type: "error",
      text: message.failureReason
        ? `Delivery failed: ${message.failureReason}`
        : "Meta reported that delivery failed.",
    };
  }

  const statusText: Record<Exclude<DeliveryStatus, "failed">, string> = {
    accepted: "Meta accepted the message. Waiting for a delivery update.",
    sent: "Meta sent the message to WhatsApp.",
    delivered: "The message was delivered to the recipient.",
    read: "The recipient read the message.",
  };

  return {
    type: "info",
    text: statusText[message.status],
  };
}

export default function Home() {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [incomingMessages, setIncomingMessages] = useState<IncomingMessage[]>(
    [],
  );
  const [outgoingMessages, setOutgoingMessages] = useState<OutgoingMessage[]>(
    [],
  );
  const [lastSentMessageId, setLastSentMessageId] = useState<string | null>(
    null,
  );
  const [inboxError, setInboxError] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadMessages() {
      try {
        const response = await fetch("/api/whatsapp/messages", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Messages request failed.");
        }

        const data = (await response.json()) as MessagesResponse;

        if (isActive) {
          setIncomingMessages(
            Array.isArray(data.messages) ? data.messages : [],
          );
          setOutgoingMessages(
            Array.isArray(data.outgoingMessages)
              ? data.outgoingMessages
              : [],
          );
          setInboxError(false);
        }
      } catch {
        if (isActive) {
          setInboxError(true);
        }
      }
    }

    void loadMessages();
    const intervalId = window.setInterval(loadMessages, 3000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setIsSending(true);

    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ to, message }),
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.success) {
        setFeedback({
          type: "error",
          text: data.error ?? "The message could not be sent.",
        });
        return;
      }

      setFeedback({
        type: "info",
        text:
          data.message ??
          "Meta accepted the message. Waiting for a delivery update.",
      });
      setLastSentMessageId(data.messageId ?? null);
      setMessage("");
    } catch {
      setFeedback({
        type: "error",
        text: "The server could not be reached. Please try again.",
      });
    } finally {
      setIsSending(false);
    }
  }

  const trackedMessage = lastSentMessageId
    ? outgoingMessages.find(
        (outgoingMessage) => outgoingMessage.id === lastSentMessageId,
      )
    : undefined;
  const displayedFeedback = trackedMessage
    ? getDeliveryFeedback(trackedMessage)
    : feedback;

  return (
    <main className="page-shell">
      <div className="dashboard-grid">
        <section className="sender-card" aria-labelledby="page-title">
          <header className="card-header">
            <div className="brand-mark" aria-hidden="true">
              <span />
            </div>
            <div>
              <p className="eyebrow">WhatsApp Cloud API</p>
              <h1 id="page-title">Message console</h1>
            </div>
          </header>

          <p className="intro">
            Send a test message through your backend and receive replies through
            Meta&apos;s webhook.
          </p>

          <form onSubmit={handleSubmit} className="message-form">
            <label htmlFor="phone">
              Destination number
              <span>Include the country code</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+54 381 632 8156"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              disabled={isSending}
              required
            />
            <p className="phone-hint">
              Use the exact recipient shown in Meta&apos;s allowed test list.
            </p>

            <label htmlFor="message">
              Message
              <span>Up to 4,096 characters</span>
            </label>
            <textarea
              id="message"
              name="message"
              rows={6}
              maxLength={4096}
              placeholder="Write your message..."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={isSending}
              required
            />

            <div className="form-footer">
              <span className="character-count">
                {message.length.toLocaleString("en-US")} / 4,096
              </span>
              <button type="submit" disabled={isSending}>
                {isSending ? "Sending..." : "Send message"}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </form>

          {displayedFeedback && (
            <p
              className={`feedback ${displayedFeedback.type}`}
              role={
                displayedFeedback.type === "error" ? "alert" : "status"
              }
            >
              <span aria-hidden="true">
                {displayedFeedback.type === "info" ? "→" : "!"}
              </span>
              {displayedFeedback.text}
            </p>
          )}

          <p className="delivery-note">
            Free-form text messages require the recipient to have messaged the
            Meta test number within the last 24 hours. Delivery updates arrive
            asynchronously through Meta&apos;s webhook.
          </p>

          {outgoingMessages.length > 0 && (
            <section
              className="delivery-history"
              aria-labelledby="delivery-title"
            >
              <div className="delivery-history-header">
                <div>
                  <p className="eyebrow">Status webhook</p>
                  <h2 id="delivery-title">Recent deliveries</h2>
                </div>
                <span>Latest {Math.min(outgoingMessages.length, 5)}</span>
              </div>

              <ol>
                {outgoingMessages.slice(0, 5).map((outgoingMessage) => (
                  <li key={outgoingMessage.id}>
                    <div className="delivery-row">
                      <strong
                        className={`delivery-status ${outgoingMessage.status}`}
                      >
                        {DELIVERY_LABELS[outgoingMessage.status]}
                      </strong>
                      <time dateTime={outgoingMessage.updatedAt}>
                        {new Date(outgoingMessage.updatedAt).toLocaleTimeString(
                          "en-US",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </time>
                    </div>
                    <p>{outgoingMessage.text}</p>
                    <span>+{outgoingMessage.to}</span>
                    {outgoingMessage.failureReason && (
                      <small>{outgoingMessage.failureReason}</small>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <p className="security-note">
            <span aria-hidden="true">●</span>
            Your access token stays on the server.
          </p>
        </section>

        <section className="inbox-card" aria-labelledby="inbox-title">
          <header className="inbox-header">
            <div>
              <p className="eyebrow">Live webhook</p>
              <h2 id="inbox-title">Incoming replies</h2>
            </div>
            <span className="live-indicator">
              <span aria-hidden="true" />
              Polling
            </span>
          </header>

          <div className="inbox-content" aria-live="polite">
            {inboxError ? (
              <p className="inbox-state error">
                The inbox could not be refreshed.
              </p>
            ) : incomingMessages.length === 0 ? (
              <div className="empty-inbox">
                <span aria-hidden="true">↙</span>
                <h3>No replies yet</h3>
                <p>
                  Configure the Meta webhook, then send a message from the
                  recipient phone.
                </p>
              </div>
            ) : (
              <ol className="message-list">
                {incomingMessages.map((incomingMessage) => (
                  <li key={incomingMessage.id} className="incoming-message">
                    <div className="message-meta">
                      <strong>
                        {incomingMessage.profileName ?? incomingMessage.from}
                      </strong>
                      <time dateTime={incomingMessage.receivedAt}>
                        {new Date(incomingMessage.receivedAt).toLocaleTimeString(
                          "en-US",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </time>
                    </div>
                    <p>{incomingMessage.text}</p>
                    {incomingMessage.profileName && (
                      <span className="message-from">
                        +{incomingMessage.from}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <footer className="inbox-footer">
            MongoDB · Last 100 messages · Refreshes every 3 seconds
          </footer>
        </section>
      </div>
    </main>
  );
}
