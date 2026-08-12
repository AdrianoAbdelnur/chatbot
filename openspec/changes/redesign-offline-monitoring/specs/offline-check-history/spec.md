# Offline Check History Specification

## Purpose

Defines durable history for automatic and manual checks, independent of other domain records.

## Requirements

### Requirement: Every Check Execution Is Recorded

Every cron and manual execution MUST persist even when it detects no delay, creates no incident, or sends no WhatsApp message. Each record MUST have a stable identity, source, start time, optional end time while running, lifecycle/final status, requested scope, and distinct vehicle count.

#### Scenario: Successful run finds no delayed vehicles

- GIVEN an execution requests vehicles that all report normally
- WHEN the check completes without an incident or notification
- THEN one completed execution record remains in history
- AND it identifies the source, timestamps, requested scope, and count

#### Scenario: Running execution is finalized

- GIVEN an execution record exists with a start time and running status
- WHEN processing finishes
- THEN the same record gains an end time and final status

### Requirement: Every Requested Vehicle Has A Bounded Outcome

A finalized execution MUST contain one outcome per distinct requested vehicle. Outcomes MUST include reporting normally, delayed, missing report, invalid report, and per-vehicle failure. Observations MUST appear only when supported by source data.

#### Scenario: Run contains mixed vehicle results

- GIVEN distinct requested vehicles produce normal, delayed, missing, invalid, and failed evaluations
- WHEN the execution is finalized
- THEN each vehicle has exactly one corresponding bounded outcome
- AND the recorded outcome count equals the distinct requested count

#### Scenario: Duplicate vehicle in requested scope

- GIVEN the requested scope resolves the same vehicle more than once
- WHEN history is finalized
- THEN that vehicle has one outcome and contributes once to the requested count

### Requirement: Failures Preserve Truthful Partial History

If some vehicles fail, the execution MUST retain successful outcomes, record explicit failures, and finish partially completed. If the whole source fails, it MUST finish failed and MUST NOT fabricate observations; requested vehicles MUST receive failure outcomes without unsupported data.

#### Scenario: Some vehicles fail

- GIVEN an execution successfully evaluates some requested vehicles but fails others
- WHEN it is finalized
- THEN successful and failed per-vehicle outcomes are retained
- AND the execution final status is partial completion

#### Scenario: Source fails before observations exist

- GIVEN the authoritative source fails for the whole requested scope
- WHEN the execution is finalized
- THEN its final status is failed and requested scope remains recorded
- AND every requested vehicle has a failure outcome with no fabricated observation

### Requirement: Execution Recording Is Idempotent

Retrying the same execution MUST reuse its identity and MUST NOT duplicate it or its outcomes. A retry MAY complete an unfinished outcome while preserving one outcome per vehicle.

#### Scenario: Completed execution is retried

- GIVEN a finalized execution and its vehicle outcomes already exist
- WHEN the same logical execution is submitted again
- THEN history still contains one execution
- AND each requested vehicle still has exactly one outcome

#### Scenario: Interrupted execution resumes

- GIVEN an execution was persisted before interruption
- WHEN processing retries with the same identity
- THEN it resumes or finalizes that record rather than creating another

### Requirement: History Has Independent Ownership And Retention

History MUST NOT be inferred from, embedded in, or deleted with incidents, notifications, membership, or operator audit. Initially, every execution and outcome MUST be retained and MUST NOT expire automatically; retention policy is deferred.

#### Scenario: Related domain record changes

- GIVEN a check history record exists
- WHEN its incident resolves, membership is disabled, notification changes, or audit events are added
- THEN the execution and outcomes remain unchanged

#### Scenario: Record ages without cleanup policy

- GIVEN an execution record becomes old
- WHEN time passes in the initial release
- THEN it remains available and is not automatically deleted
