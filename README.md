# WhatsApp Cloud API Sender

A small Next.js App Router application that sends text messages through the
WhatsApp Cloud API. The browser calls the local backend route, and only the
server communicates with Meta, so the access token is never exposed to the
client.

## Requirements

- Node.js 22.6 or newer
- A Meta for Developers app with the WhatsApp use case configured
- A WhatsApp test Phone Number ID
- A temporary access token
- A verified test recipient

## Configuration

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file:

   ```bash
   Copy-Item .env.example .env.local
   ```

   On macOS or Linux:

   ```bash
   cp .env.example .env.local
   ```

3. Complete `.env.local` with the test credentials from Meta:

   ```env
   WHATSAPP_ACCESS_TOKEN=your_temporary_access_token
   WHATSAPP_PHONE_NUMBER_ID=your_test_phone_number_id
   WHATSAPP_API_VERSION=v25.0
   HUMAN_SUPPORT_PHONE=5491112345678
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=choose_a_long_random_value
   META_APP_SECRET=your_meta_app_secret
   CRON_SECRET=choose_another_long_random_value
   MONGODB_URI=your_mongodb_atlas_connection_string
   MONGODB_DATABASE=whatsapp_backend_test
   GEMINI_API_KEY=your_gemini_api_key
   GEMINI_MODEL=gemini-3.1-flash-lite
   CONVERSATION_SESSION_TIMEOUT_MINUTES=60
   CYBERMAPA_API_URL=your_cybermapa_https_endpoint
   CYBERMAPA_USER=your_street_z_user
    CYBERMAPA_PASSWORD=your_street_z_password
    CYBERMAPA_TIMEOUT_MS=10000
    CYBERMAPA_OFFLINE_THRESHOLD_HOURS=48
   ```

   Do not prefix these variables with `NEXT_PUBLIC_`. `.env.local` is ignored by
   Git and must never be committed.

## Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter the verified
recipient number including its country code, write a message, and select
**Send message**.

## Receive replies with a webhook

The application exposes:

- `GET /api/whatsapp/webhook` for Meta's verification challenge.
- `POST /api/whatsapp/webhook` for signed webhook notifications.
- `GET /api/whatsapp/messages` for the browser inbox.

Meta must be able to reach the webhook through a public HTTPS URL. During local
development, expose port `3000` with an HTTPS tunnel, then use this callback:

```text
https://your-public-host/api/whatsapp/webhook
```

In the Meta app:

1. Open the WhatsApp webhook configuration.
2. Enter the public callback URL.
3. Enter the exact value of `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
4. Subscribe to the `messages` field.

`META_APP_SECRET` is used to validate Meta's `X-Hub-Signature-256` header. Never
expose it to the browser.

Incoming messages are stored in the `messages` collection inside the configured
MongoDB database. The browser refreshes the inbox every three seconds. For a
temporary test, use a dedicated database such as `whatsapp_backend_test` and
delete that database after the test.

Outgoing messages are stored in `outgoing_messages` using Meta's message ID.
Status webhook events update each message to `sent`, `delivered`, `read`, or
`failed`, and the browser displays the latest status during the same polling
cycle.

New inbound text messages trigger an experimental Gemini response after the
webhook response has been acknowledged. Duplicate webhook deliveries do not
generate duplicate replies because only newly inserted message IDs are
processed. Before generating the reply, the backend marks the inbound message
as read and activates WhatsApp's text typing indicator. This gives the sender a
blue read receipt and visible feedback while Gemini prepares the response.

When `HUMAN_SUPPORT_PHONE` is configured, Gemini can request a human handoff
after the available support tools cannot resolve a question. The backend sends
a reply button first. Only after the user confirms does it generate a `wa.me`
link containing a compact summary of the unresolved request. The phone must be
in international format; formatting characters are removed by the backend.

## Conversation memory

Messages from the same sender remain in one active conversation session while
the inactivity gap stays below `CONVERSATION_SESSION_TIMEOUT_MINUTES`. Gemini
receives the latest ten completed exchanges from that active session.

Session metadata and rolling summaries are stored in the
`whatsapp_conversations` MongoDB collection. Once a session has at least 20
completed exchanges, older exchanges are summarized in batches while the ten
most recent exchanges remain available verbatim.

Gemini also receives a read-only `get_recent_conversations` function
declaration. When a message appears to refer to an older topic that is not in
the active session, Gemini can request that function. The backend—not
Gemini—queries up to three conversations from the same WhatsApp sender within
the previous seven days, then returns the limited context to Gemini for the
final response. The model never chooses the phone number used by the query.

The number may contain `+`, spaces, hyphens, or parentheses; the backend removes
them before calling Meta.

## Cybermapa read-only tools

When Cybermapa is configured, Gemini can request two server-side tools:

- `get_authorized_vehicles` lists vehicles available to the current WhatsApp
  sender.
- `get_vehicle_status` returns the last position reported by Cybermapa for one
  authorized plate.

Gemini never calls Cybermapa directly. The backend validates the tool arguments,
uses the WhatsApp sender from Meta's signed webhook, checks MongoDB
authorization, and only then sends a fixed `GETVEHICULOS` or `DATOSACTUALES`
action. Cybermapa credentials are added inside the server-only client and are
never returned to Gemini or the browser.

The public Cybermapa documentation describes the request payload but does not
publish the account-specific service URL. Obtain the HTTPS endpoint from
Cybermapa and set it as `CYBERMAPA_API_URL`.

### Authorize a WhatsApp sender

Authorizations are stored in the `cybermapa_authorizations` collection. The
document `_id` is the WhatsApp number containing digits only. The safest setup
lists every allowed plate explicitly:

```javascript
const now = new Date().toISOString();

db.cybermapa_authorizations.updateOne(
  { _id: "5491112345678" },
  {
    $set: {
      enabled: true,
      allowAllVehicles: false,
      allowedVehicles: ["AA123BB", "ABC123"],
      updatedAt: now
    },
    $setOnInsert: {
      createdAt: now
    }
  },
  { upsert: true }
);
```

Set `allowAllVehicles: true` only for a trusted internal administrator. It
allows access to every vehicle visible to the configured Cybermapa account.

Tool executions are recorded without coordinates or credentials in the
`cybermapa_audit_events` collection. A missing or disabled authorization fails
closed.

### Detect vehicles that stopped reporting

Offline monitoring only checks vehicles whose Cybermapa company has an enabled
record in `gps_company_contacts`. Add or update a contact with:

```bash
npm run offline:contact:upsert -- --company "Company name" --contact "Contact name" --phone "5491112345678"
```

When platform vehicle discovery is unavailable, assign a bounded comma-separated
plate list to the company record:

```bash
npm run offline:contact:upsert -- --company "Company name" --contact "Contact name" --phone "5491112345678" --plates "AA123BB,ABC123"
```

Manual plate arrays are a temporary fallback. When `GETVEHICULOS` becomes
available, migrate each applicable contact from `vehicleSource: "manual"` to
`vehicleSource: "platform"`. The scanner will then fetch the platform vehicle
list once and keep only vehicles belonging to enabled companies with configured
contacts.

Run a read-only preview by default:

```bash
npm run offline:check
```

Persist new, updated, and resolved incidents in `gps_offline_incidents` only
after reviewing the preview:

```bash
npm run offline:check -- --persist
```

The threshold defaults to 48 hours and can be changed with
`CYBERMAPA_OFFLINE_THRESHOLD_HOURS`. Cybermapa timestamps are interpreted as
Argentina local time. This phase does not send WhatsApp messages.

### Preview grouped offline notifications

The notification command groups active, unnotified incidents by company and
limits each template message to ten vehicles. It only prints a safe preview by
default:

```bash
npm run offline:notify
```

After the `vehicle_offline_followup` template is approved in Spanish (Argentina),
send the prepared messages explicitly:

```bash
npm run offline:notify -- --send
```

Accepted notifications are stored in `gps_offline_notifications`, linked to all
included incidents, and tracked in `outgoing_messages`. A repeated run does not
send the same initial incident notification again. Explicit Meta rejections are
stored as retryable and release their incident assignments for a later attempt.
Ambiguous transport failures remain reserved to avoid sending a possible
duplicate.

### Run offline monitoring daily in Vercel

The production cron calls the protected route
`GET /api/cron/offline-vehicles` every day at 09:00 Argentina time
(`0 12 * * *` UTC). The route first persists the Cybermapa scan and only then
dispatches grouped notifications.

Set `CRON_SECRET` as a Sensitive Production environment variable. Vercel sends
it as `Authorization: Bearer <CRON_SECRET>` when invoking the cron route. Calls
without the configured secret return `401`.

## Semantic FAQ search

The assistant can retrieve curated support answers from MongoDB Atlas Vector
Search before answering general questions about installations, troubleshooting,
platform access, reports, alerts, and escalation.

The canonical FAQ source lives in `lib/faq/data.ts`. Embeddings use the existing
server-only `GEMINI_API_KEY`, the stable `gemini-embedding-2` model, and 768
dimensions. Documents are stored in `faq_entries`; the seed command creates the
`faq_vector_index` Vector Search index when it does not exist.

After editing the FAQ source, generate or refresh the embeddings explicitly:

```bash
npm run faq:seed
```

The command writes to the MongoDB database configured in `.env.local` and
consumes the Gemini API. It skips unchanged entries, updates changed entries,
and deactivates entries removed from the canonical source.

Because this endpoint sends a free-form `text` message, the recipient must have
messaged the Meta test number within the previous 24 hours. Outside that
customer service window, initiate the conversation with an approved template
from Meta and have the recipient reply before testing free-form text.

For test recipients, use the exact number format shown in Meta's allowed
recipient list. Do not rewrite or infer a different international format.

## API

### `POST /api/whatsapp/send`

Request:

```json
{
  "to": "+54 9 11 1234-5678",
  "message": "Hello from my backend"
}
```

Example with PowerShell:

```powershell
$body = @{
  to = "+54 9 11 1234 5678"
  message = "Hello from my backend"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:3000/api/whatsapp/send" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

Successful response:

```json
{
  "success": true,
  "status": "accepted",
  "message": "Meta accepted the message. Delivery is not confirmed without status webhooks.",
  "messageId": "wamid..."
}
```

The `wamid` initially confirms only that Meta accepted the request. Subsequent
status webhooks update the delivery state shown in the web interface.

Validation and Meta errors return a safe JSON response without exposing the
access token.

## Checks

```bash
npm test
npm run lint
npm run build
```
