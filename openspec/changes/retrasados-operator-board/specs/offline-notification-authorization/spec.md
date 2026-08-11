# Offline Notification Authorization Specification

## Purpose

Defines the per-row authorization gate that becomes a precondition for every WhatsApp dispatch path (cron, manual script, operator route), plus the immediate company-scoped dispatch triggered by authorization.

## Requirements

### Requirement: Authorization Required Before Dispatch

An active incident lacking explicit authorization MUST NOT be dispatched by any path.

#### Scenario: Cron dispatches nothing for unauthorized incidents

- GIVEN one or more active incidents with no authorization
- WHEN the daily cron runs scan and dispatch
- THEN the scan persists as normal
- AND no notification is sent for the unauthorized incidents

#### Scenario: Manual script does not dispatch unauthorized incidents

- GIVEN an active incident with no authorization
- WHEN the manual notify script runs
- THEN the incident is excluded from the dispatch batch

#### Scenario: Operator route dispatches only authorized rows

- GIVEN a mix of authorized and unauthorized incidents for a company
- WHEN the operator authorizes a subset
- THEN only the authorized subset is dispatched

### Requirement: Pre-Existing Incidents Are Unauthorized By Default

Incidents with no authorization fields MUST be treated as not authorized.

#### Scenario: Incident predating this change is excluded from dispatch

- GIVEN an incident created before this change with no `authorizedAt` field
- WHEN any dispatch path evaluates eligible incidents
- THEN the incident is excluded until explicitly authorized

### Requirement: Authorization Records Operator And Timestamp

Authorizing an incident MUST record the authorizing operator's identity and the authorization timestamp.

#### Scenario: Authorize action stamps operator and timestamp

- GIVEN a valid operator and an unauthorized incident
- WHEN the operator authorizes it
- THEN the incident stores `authorizedBy` and `authorizedAt`

### Requirement: Authorization Does Not Duplicate Existing Sends

Authorizing an incident that already has an assigned notification (`initialNotificationId` present) MUST NOT create a duplicate send. Re-authorizing an already-authorized-and-sent incident MUST be a no-op, not an error.

#### Scenario: Authorizing an already-notified incident sends nothing new

- GIVEN an incident with `initialNotificationId` already set
- WHEN an operator authorizes it
- THEN no new notification is reserved or sent
- AND the existing idempotency key is unaffected

#### Scenario: Re-authorizing a sent incident succeeds without side effect

- GIVEN an incident already authorized and already sent
- WHEN an operator authorizes it again
- THEN the request succeeds
- AND no duplicate notification, error, or state corruption occurs

### Requirement: Immediate Company-Scoped Dispatch On Authorize

Authorizing MUST trigger immediate dispatch scoped to the authorizing company, grouping only already-authorized rows, honouring the existing 10-vehicle cap per message.

#### Scenario: Authorizing rows for one company dispatches immediately

- GIVEN 3 unauthorized incidents for company A
- WHEN an operator authorizes all 3
- THEN a dispatch runs immediately for company A only
- AND incidents for other companies are unaffected

#### Scenario: Authorizing more than 10 rows splits into capped batches

- GIVEN 15 authorized incidents for one company
- WHEN dispatch runs
- THEN vehicles are grouped into batches of at most 10 per message

### Requirement: Cron Scans And Persists But Dispatches Only Authorized Rows

The daily cron MUST continue to scan and persist incidents. It MUST NOT dispatch any incident lacking authorization.

#### Scenario: Cron with zero authorized incidents dispatches nothing

- GIVEN a scan that detects new delayed vehicles, none authorized
- WHEN the cron runs
- THEN incidents are persisted
- AND zero notifications are sent
