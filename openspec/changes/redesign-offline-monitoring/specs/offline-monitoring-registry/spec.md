# Offline Monitoring Registry Specification

## Purpose

Defines the company/vehicle catalog and the persistent, vehicle-level membership that determines automatic cron checks independently of notification contacts.

## Requirements

### Requirement: Catalog Is Available Without An Operator Fetch Action

The board MUST load the complete company catalog automatically. Selecting a company MUST expose that company's current vehicles and each vehicle's automatic-monitoring membership.

#### Scenario: Opening the board loads companies

- GIVEN the operator opens Retrasados
- WHEN the catalog becomes available
- THEN all current companies are shown without a manual fetch action

#### Scenario: Selecting a company shows its vehicles

- GIVEN the company catalog is loaded
- WHEN the operator selects one company
- THEN only that company's current vehicles and membership states are shown

#### Scenario: Catalog retrieval fails

- GIVEN the company catalog cannot be retrieved
- WHEN the board loads
- THEN the failure is shown and no fabricated company or vehicle is offered

### Requirement: Automatic Membership Is Persistent Per Vehicle

The system MUST allow each current vehicle to be enabled or disabled for automatic monitoring. Membership changes MUST persist across board sessions and MUST NOT depend on notification-contact configuration.

#### Scenario: Operator changes one membership

- GIVEN a disabled vehicle in the selected company
- WHEN the operator enables automatic monitoring for it
- THEN that vehicle remains enabled after the board is reloaded
- AND other vehicles retain their prior state

#### Scenario: Contact changes do not alter membership

- GIVEN a vehicle has a persisted membership state
- WHEN a delivery contact is added, changed, disabled, or removed
- THEN the vehicle's membership remains unchanged

### Requirement: Cron Checks Exactly Enabled Vehicles

Each automatic run MUST check every enabled vehicle and MUST NOT check a disabled vehicle merely because it exists in the catalog or has a delivery contact.

#### Scenario: Mixed membership

- GIVEN enabled and disabled vehicles exist
- WHEN the automatic check runs
- THEN every enabled vehicle is checked
- AND no disabled vehicle is checked

### Requirement: Migration Preserves The Legacy Automatic Scope

Initial migration MUST enable exactly the authoritative legacy set of 87 vehicles. Every other vehicle present at migration, and every vehicle discovered later, MUST default to disabled. Repeating migration MUST NOT create duplicates or reset an initialized membership.

#### Scenario: Initial migration

- GIVEN the authoritative legacy set contains 87 distinct vehicles
- WHEN migration initializes the registry
- THEN exactly those 87 vehicles are enabled
- AND every other current vehicle is disabled

#### Scenario: Newly discovered vehicle

- GIVEN registry initialization is complete
- WHEN a new vehicle appears in the catalog
- THEN it is shown with automatic monitoring disabled

#### Scenario: Migration is repeated

- GIVEN memberships were already initialized and one was later changed
- WHEN migration runs again
- THEN no duplicate membership is created
- AND the operator's current membership choice remains unchanged

### Requirement: Membership Does Not Own Incident Lifecycle

Disabling automatic monitoring MUST NOT hide, resolve, delete, or otherwise mutate an already active delayed-vehicle incident. Incident visibility and resolution MUST continue to follow reconciliation results.

#### Scenario: Active incident survives disabling

- GIVEN an enabled vehicle has an active delayed incident
- WHEN the operator disables its automatic membership
- THEN the incident remains active and visible
- AND no resolution is recorded solely because of that change
