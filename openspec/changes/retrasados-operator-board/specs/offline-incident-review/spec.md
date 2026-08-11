# Offline Incident Review Specification

## Purpose

Defines operator-owned fields (operational status, comment, review timestamp, reviewing operator) recorded against a delayed-vehicle incident, and the ownership boundary that keeps them fully separate from scanner-owned `status` and `active`.

## Requirements

### Requirement: Operator Fields Are Distinct From Scanner Fields

The system MUST persist operational status, operator comment, review timestamp, and reviewing operator identity in fields separate from `incident.status` and `incident.active`. Operator actions MUST NOT modify `status` or `active`.

#### Scenario: Setting operational status leaves scanner fields untouched

- GIVEN an active incident with `status: "pending"`
- WHEN an operator sets operational status to "workshop"
- THEN the incident's operator fields are updated
- AND `status` and `active` remain unchanged

#### Scenario: Pre-existing incident has no operator fields until reviewed

- GIVEN an incident created before this change exists with no operator fields
- WHEN the incident is read
- THEN operational status, comment, review date and operator are absent or default-empty, never inferred from `status`

### Requirement: Operational Status Vocabulary Is Fixed And Server-Validated

The system MUST validate operational status against a fixed TypeScript union: stopped/workshop, technical review, consulted/pending answer, reporting again, and exception values (e.g. customer debt). Colour MUST be presentation-only; the persisted value MUST always be the semantic status name.

#### Scenario: Valid status is accepted

- GIVEN a valid operational status value
- WHEN an operator submits it for an incident
- THEN the value is persisted as the semantic name, not a colour or numeric code

#### Scenario: Invalid status is rejected

- GIVEN a status value outside the fixed union
- WHEN an operator submits it
- THEN the system rejects the request server-side
- AND no field on the incident changes

### Requirement: Operator Review Records Identity And Timestamp Atomically

Setting operational status or comment MUST record the operator identity and review timestamp together with the change. Comment MUST be optional free text bounded to 1000 characters.

#### Scenario: Review update stores status, comment, operator and timestamp together

- GIVEN a valid operator and status
- WHEN the operator submits status and a comment
- THEN the incident stores status, comment, operator identity and review timestamp in the same update

#### Scenario: Comment exceeding the length limit is rejected

- GIVEN a comment longer than 1000 characters
- WHEN an operator submits it
- THEN the system rejects the request
- AND no partial update is persisted

### Requirement: Dead Scanner Status Value Stays Unused

`"acknowledged"` MUST NOT be written by any operator-review action or by this capability.

#### Scenario: Operator review never writes "acknowledged"

- GIVEN any operator review action (status change, comment)
- WHEN the action is processed
- THEN `incident.status` never becomes `"acknowledged"` as a result
