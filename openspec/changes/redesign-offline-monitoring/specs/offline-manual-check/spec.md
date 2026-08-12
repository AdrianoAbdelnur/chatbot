# Offline Manual Check Specification

## Purpose

Defines temporary vehicle/company selection for immediate checks without changing automatic membership.

## Requirements

### Requirement: Manual Selection Supports Vehicles And Companies

The board MUST allow temporary selection of vehicles, whole companies, or both. A company MUST expand to its current vehicles, and duplicates MUST be checked once.

#### Scenario: Select individual vehicles

- GIVEN vehicles are visible
- WHEN the operator selects specific vehicles for a manual check
- THEN exactly those distinct vehicles are requested

#### Scenario: Select a whole company

- GIVEN a company has current vehicles
- WHEN the operator selects that company for a manual check
- THEN every current vehicle of that company is included

#### Scenario: Company and vehicle overlap

- GIVEN a selected vehicle also belongs to a selected company
- WHEN the manual check runs
- THEN that vehicle is checked exactly once

### Requirement: Manual Check Runs Immediately Without Persisting Selection

A valid non-empty selection MUST trigger an immediate check, remain request-local, and MUST NOT modify automatic membership.

#### Scenario: Manual check of a disabled vehicle

- GIVEN a vehicle is disabled for automatic monitoring
- WHEN the operator selects it and starts a manual check
- THEN it is checked immediately and remains automatically disabled

#### Scenario: Temporary selection is not retained

- GIVEN a manual check completed
- WHEN the operator starts a later manual-selection session
- THEN the prior temporary selection is not implicitly selected

### Requirement: Manual Targets Are Server-Validated

The system MUST validate targets against the current catalog. Empty, unknown, stale, or mismatched selections MUST be rejected without partial checks or membership changes.

#### Scenario: Empty selection

- GIVEN no company or vehicle is selected
- WHEN a manual check is requested
- THEN the request is rejected
- AND no vehicle is checked

#### Scenario: Unknown or stale target

- GIVEN the request contains a target absent from the current catalog
- WHEN the request is validated
- THEN the entire request is rejected
- AND no selected target is checked

#### Scenario: Vehicle-company mismatch

- GIVEN a vehicle is submitted under a company it does not belong to
- WHEN the request is validated
- THEN the entire request is rejected
- AND automatic membership remains unchanged

### Requirement: Manual And Automatic Checks Share Incident Outcomes

Manual results MUST follow automatic incident creation, refresh, resolution, review, and audit rules. A check MUST NOT authorize or dispatch notifications; authorization, ten-vehicle batching, and send idempotency MUST remain enforced. Contacts MUST affect delivery only.

#### Scenario: Manual check detects a delayed vehicle

- GIVEN a valid selected vehicle reports beyond the delay threshold
- WHEN its manual check completes
- THEN its incident is created or refreshed under the normal reconciliation rules

#### Scenario: Manual check finds recent reporting

- GIVEN a selected vehicle has an active delayed incident
- WHEN its manual check finds reporting within threshold
- THEN the incident is resolved under the normal reconciliation rules

#### Scenario: Selected company has no delivery contact

- GIVEN a company has valid selected vehicles but no delivery contact
- WHEN a manual check runs
- THEN those vehicles are checked and reconciled
- AND absence of a contact affects only later notification delivery

#### Scenario: Detection preserves notification gates

- GIVEN a manual check creates a delayed incident
- WHEN reconciliation completes
- THEN the incident remains subject to operator review and authorization
- AND no notification bypasses batching or send-idempotency rules

### Requirement: Check Failure Does Not Corrupt State

If required source data cannot be obtained, the system MUST report failure and MUST NOT apply partial or fabricated reconciliation outcomes.

#### Scenario: Source query fails

- GIVEN a valid manual selection
- WHEN its source query fails
- THEN the operator receives a failure result
- AND existing incidents and memberships remain unchanged
