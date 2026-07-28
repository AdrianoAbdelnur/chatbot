import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | WhatsApp Message Console",
  description:
    "Privacy information for the WhatsApp Cloud API test application.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <p className="eyebrow">Trailingsat S.A.</p>
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: July 19, 2026</p>

        <section>
          <h2>About this application</h2>
          <p>
            This application is a limited WhatsApp Cloud API integration used
            to test sending messages and receiving webhook notifications.
            Trailingsat S.A. operates the application.
          </p>
        </section>

        <section>
          <h2>Information processed</h2>
          <p>
            When you communicate with the configured WhatsApp test number, the
            application may process your WhatsApp phone number, profile name,
            message content, conversation summaries, message identifier,
            message type, timestamp, authorized vehicle identifiers, and the
            latest vehicle location and operational data returned for an
            authorized tracking request.
          </p>
        </section>

        <section>
          <h2>How information is used</h2>
          <p>
            Information is used only to test message delivery, display incoming
            replies in the test console, generate experimental automated
            replies, troubleshoot the integration, and protect the service from
            unauthorized webhook or vehicle-data requests. Vehicle information
            is requested only when an authorized WhatsApp sender asks for it.
          </p>
        </section>

        <section>
          <h2>Service providers</h2>
          <p>
            Processing relies on Meta&apos;s WhatsApp Cloud API, Vercel for
            application hosting, MongoDB Atlas for temporary message storage,
            Google Gemini for generating experimental automated replies, and
            Cybermapa Street Z for authorized vehicle information. Message
            content and the limited tool results needed to answer a request may
            be processed by these providers according to their own terms and
            privacy practices.
          </p>
        </section>

        <section>
          <h2>Retention and deletion</h2>
          <p>
            Message data is retained only for the duration of this integration
            test. Conversation history and summaries may be used during that
            period to preserve context between related messages and may be
            deleted earlier when no longer needed. A request to access or
            delete test data can be submitted through the contact information
            associated with the Meta application. Vehicle access audit records
            contain the sender, requested plate, outcome, and timestamp, but do
            not store Cybermapa credentials or returned coordinates.
          </p>
        </section>

        <section>
          <h2>Sharing and sale</h2>
          <p>
            The application does not sell personal information. Information is
            shared only with the service providers required to operate this
            test or when disclosure is required by law.
          </p>
        </section>

        <section>
          <h2>Security</h2>
          <p>
            Access credentials remain on the server, webhook requests are
            validated using Meta signatures, and transport connections use
            HTTPS. No system can guarantee absolute security.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For privacy questions or data requests, contact Trailingsat S.A.
            through the contact information registered for the Chatbot
            application in Meta for Developers.
          </p>
        </section>

        <Link className="legal-back-link" href="/">
          ← Return to the message console
        </Link>
      </article>
    </main>
  );
}
