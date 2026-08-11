# Operator Directory Specification

## Purpose

Defines a credential-free, name-only reference list of operators used purely for attribution on review, authorization, and audit actions — not for authentication or access control.

## Requirements

### Requirement: Operators Are Name-Only Records

Operator records MUST contain only an identifier and a display name, with no credentials, password, or session data.

#### Scenario: Directory entry has no credential fields

- GIVEN an operator record in the directory
- WHEN it is read
- THEN it exposes only an id and a name, no password or credential field

### Requirement: Unknown Operator Is Rejected

An action submitted with an operator id not present in the directory MUST be rejected server-side, with no incident update and no audit event created.

#### Scenario: Action with unrecognised operator id fails cleanly

- GIVEN an operator id that does not exist in the directory
- WHEN a review, authorization, or re-check action is submitted with it
- THEN the request is rejected
- AND neither the incident nor the audit trail is modified

### Requirement: Directory Is Attribution-Only

The operator directory MUST NOT be used to grant or restrict access to any route; it exists solely to attribute actions to a known name.

#### Scenario: Valid operator selection does not bypass any access check

- GIVEN a request carrying a valid operator id
- WHEN it reaches a mutating route
- THEN the operator id affects only attribution, not authorization to call the route

### Requirement: Seam For A Future Real Identity

The audit event actor field MUST be shaped so a future authenticated identity can replace directory-selected operator attribution without changing the audit event contract.

#### Scenario: Actor shape is stable across attribution sources

- GIVEN an audit event created from a directory-selected operator
- WHEN a future action is created from a real authenticated user instead
- THEN both events use the same actor field shape (id and name)
