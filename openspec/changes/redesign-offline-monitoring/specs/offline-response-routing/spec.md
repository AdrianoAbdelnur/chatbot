# Offline Response Routing Specification

## Purpose

Defines fail-closed classification and persistence of inbound replies to delayed-vehicle inquiries, keeping unrelated conversation outside Retrasados.

## Requirements

### Requirement: Classification Uses Original Inquiry Candidates

Before general chatbot handling, the system MUST resolve candidate incidents from the sender and inquiries actually sent to that sender. The classifier MUST receive only candidates from the relevant original inquiry and MUST decide whether the message is matched, unrelated, or undecidable.

#### Scenario: Reply names one candidate vehicle

- GIVEN an inquiry asked about multiple delayed vehicles
- WHEN the sender replies coherently about one candidate vehicle
- THEN classification identifies only that incident as matched

#### Scenario: Coherent reply covers the full inquiry

- GIVEN one original inquiry asked about multiple incidents
- WHEN the sender gives a coherent general answer applying to all of them
- THEN classification MAY match every incident in that original inquiry

#### Scenario: No eligible original inquiry

- GIVEN an inbound message has no inquiry candidate sent to that sender
- WHEN offline-response routing runs
- THEN no incident is matched
- AND no response appears in Retrasados

### Requirement: Backend Validation Fails Closed

The system MUST validate every classified target against the backend-provided candidate set. Invalid, stale, malformed, contradictory, or ambiguous classifications MUST NOT be guessed, widened, or attached to an incident.

#### Scenario: Classifier returns a non-candidate target

- GIVEN the classifier returns an incident outside its candidate set
- WHEN the result is validated
- THEN the result is rejected
- AND no offline response is assigned

#### Scenario: Ambiguous reply

- GIVEN a reply cannot be attributed coherently within its candidates
- WHEN classification completes
- THEN it remains unassigned and eligible for retry or review
- AND no candidate incident displays it

#### Scenario: Classifier is unavailable or malformed

- GIVEN classification fails or returns malformed output
- WHEN routing processes the inbound message
- THEN the message remains unassigned and retryable
- AND no incident attribution is inferred

### Requirement: Valid Matches Are Persisted Idempotently

A validated match MUST be persisted against its inbound message and matched incident or incidents. Reprocessing the same inbound message MUST NOT create duplicate response records or duplicate incident associations.

#### Scenario: Valid single-incident match

- GIVEN a reply is validated for one candidate incident
- WHEN routing persists the decision
- THEN that response appears only on the matched Retrasados incident

#### Scenario: Same inbound message is retried

- GIVEN a validated response was already persisted
- WHEN the same inbound message is processed again
- THEN the stored attribution remains single and unchanged

### Requirement: Offline Routing Isolated From General Chatbot Handling

A validated offline response MUST NOT be handled as a general chatbot message. A confidently unrelated message MUST NOT appear in Retrasados and MUST remain eligible for normal chatbot handling. An undecided or failed classification MUST remain pending and MUST NOT trigger a guessed offline attribution or normal chatbot response until routing is resolved.

#### Scenario: Matched reply bypasses chatbot

- GIVEN an inbound message is validated as an offline response
- WHEN routing completes
- THEN it is stored for Retrasados
- AND the general chatbot does not respond to that message

#### Scenario: Unrelated customer message continues normally

- GIVEN the classifier confidently marks an inbound message unrelated
- WHEN routing completes
- THEN no Retrasados response is stored
- AND the message may continue to general chatbot handling

#### Scenario: Classification remains undecided

- GIVEN classification is ambiguous, invalid, or unavailable
- WHEN routing cannot reach a valid decision
- THEN the message remains retryable and absent from Retrasados
- AND the general chatbot is not invoked for that undecided message
