# Offline Vehicle Recheck Specification

## Purpose

Defines on-demand re-check of a single delayed vehicle, reusing the existing Cybermapa report fetch and incident reconciliation path, without a new external integration.

## Requirements

### Requirement: Recheck Queries A Single Plate And Reconciles

Re-checking a vehicle MUST query the current report for exactly that plate and reconcile the result through the existing reconciliation path.

#### Scenario: Recheck fetches only the requested plate

- GIVEN an incident for plate "ABC123"
- WHEN an operator triggers a re-check
- THEN the system queries the current report for "ABC123" only

### Requirement: Recheck Resolves The Incident When Back Within Threshold

If the vehicle now reports within threshold, the incident MUST resolve and the worksheet MUST reflect the resolution.

#### Scenario: Recent report resolves the incident

- GIVEN a delayed incident for a plate
- WHEN a re-check finds a report within the configured threshold
- THEN the incident is resolved through the existing reconciliation logic
- AND the worksheet no longer lists it as active

### Requirement: Recheck Refreshes Data When Still Delayed

If the vehicle is still delayed, last-report data and derived age MUST refresh on the incident.

#### Scenario: Still-delayed vehicle gets refreshed last-report and age

- GIVEN a delayed incident
- WHEN a re-check finds a report still older than the threshold
- THEN `lastReportedAt` and the derived age reflect the newly fetched report
- AND the incident remains active

### Requirement: Recheck Is Always Audited

A re-check MUST be recorded in the audit trail regardless of its outcome.

#### Scenario: Audit event exists for every re-check attempt

- GIVEN any re-check request, successful or not
- WHEN it completes
- THEN an audit event of type "recheck" is appended

### Requirement: Upstream Failure Surfaces Without Corrupting State

If the Cybermapa query fails, the failure MUST surface to the operator and MUST NOT corrupt existing incident state.

#### Scenario: Cybermapa failure leaves incident state intact

- GIVEN a re-check request
- WHEN the Cybermapa report query fails
- THEN the operator receives an error response
- AND the incident's stored fields remain exactly as before the request
