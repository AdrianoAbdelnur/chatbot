# Retrasados Operator Board Specification

## Purpose

Defines the worksheet surface — its row contract, WhatsApp-query states, default scope, and the security posture of its supporting API routes — where an operator reviews delayed-vehicle incidents before authorizing dispatch.

## Requirements

### Requirement: Worksheet Row Data Contract

Each worksheet row MUST expose: system, company, plate, last report timestamp, derived age, operational status, comment, review date, reviewing operator, and WhatsApp-query state.

#### Scenario: Reviewed incident row includes all fields

- GIVEN an incident that has been reviewed and authorized
- WHEN the worksheet lists it
- THEN the row includes system, company, plate, last report timestamp, derived age, operational status, comment, review date, operator, and WhatsApp-query state

#### Scenario: Unreviewed incident row shows defaults

- GIVEN an incident with no operator fields set
- WHEN the worksheet lists it
- THEN operational status, comment, review date and operator appear empty/default
- AND WhatsApp-query state shows "not authorized"

### Requirement: WhatsApp-Query State Vocabulary

WhatsApp-query state MUST report at least: not authorized, authorized-not-yet-sent, sent, failed. A Meta-accepted send MUST NOT be reported as delivered.

#### Scenario: Authorized-but-not-dispatched row shows authorized-not-yet-sent

- GIVEN an incident just authorized before dispatch completes
- WHEN the worksheet reads its state
- THEN it shows "authorized-not-yet-sent"

#### Scenario: Meta-accepted notification shows sent, not delivered

- GIVEN a notification accepted by Meta for an incident
- WHEN the worksheet reads its state
- THEN it shows "sent"
- AND never claims "delivered"

#### Scenario: Failed notification shows failed state

- GIVEN a notification that failed to send
- WHEN the worksheet reads its state
- THEN it shows "failed"

### Requirement: Default Scope Is Active Incidents, Reflecting Live State

The worksheet MUST show only active incidents by default. Each fetch MUST reflect current incident state, so an incident resolved by the scanner between fetches no longer appears.

#### Scenario: Scanner-resolved incident drops off on next fetch

- GIVEN an incident visible as active in one worksheet fetch
- WHEN the scanner resolves it before the next fetch
- THEN the next fetch excludes that incident from the default view

### Requirement: Mutating Routes Validate Input And Protect Secrets

Routes for status update, comment, re-check, and authorize MUST validate input server-side and MUST NOT expose WhatsApp, Meta, MongoDB, or Gemini secrets to the browser or client bundle.

#### Scenario: Malformed request is rejected

- GIVEN a request body missing a required field or with a wrong type
- WHEN it hits a mutating route
- THEN the route rejects it with an error response and no side effect

#### Scenario: Response payload carries no secret values

- GIVEN any successful or failed response from a board route
- WHEN the payload is inspected
- THEN it contains no WhatsApp token, Meta secret, MongoDB credential, or Gemini key

### Requirement: No Application Authentication In This Change

This capability MUST NOT implement application login, sessions, or roles. Access restriction is an accepted external/operational concern, not code in this change.

#### Scenario: Board routes require no login step

- GIVEN the board page and its API routes as shipped in this change
- WHEN they are accessed
- THEN no login, session, or role check gates access
- AND this is a stated, accepted limitation pending external access restriction
