# Offline Incident Audit Trail Specification

## Purpose

Defines the append-only event log that records every operator action against a delayed-vehicle incident, providing full traceability independent of the incident's current-state fields.

## Requirements

### Requirement: Every Operator Action Appends An Immutable Event

Every operator action (status change, comment edit, re-check, authorization) MUST append an audit event recording actor, action type, timestamp, and before/after state where meaningful.

#### Scenario: Status change appends an event with before/after

- GIVEN an incident with operational status "workshop"
- WHEN an operator changes it to "technical review"
- THEN an audit event is appended with actor, action type "status_change", timestamp, before value "workshop", after value "technical review"

#### Scenario: Re-check appends an event regardless of outcome

- GIVEN an incident being re-checked
- WHEN the re-check completes, whether it resolves the incident or not
- THEN an audit event with action type "recheck" is appended

#### Scenario: Authorization appends an event

- GIVEN an unauthorized incident
- WHEN an operator authorizes it
- THEN an audit event with action type "authorization" is appended, including actor and timestamp

### Requirement: Audit Events Are Never Modified Or Deleted

No code path MUST update or delete an existing audit event. New actions MUST always append a new event.

#### Scenario: Prior events remain unchanged after a new action

- GIVEN an incident with one existing audit event
- WHEN a second operator action occurs
- THEN the first event's content is unchanged
- AND a second, distinct event exists alongside it
