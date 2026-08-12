import type { Db } from "mongodb";

import {
  calculateExecutionSummary,
  normalizeRequestedVehicles,
} from "./check-history-policy.ts";
import type {
  OfflineCheckExecutionStatus,
  OfflineCheckExecutionSummary,
  OfflineCheckOutcome,
  OfflineCheckVehicleTarget,
} from "./types.ts";

export const OFFLINE_CHECK_EXECUTIONS_COLLECTION_NAME = "gps_offline_check_executions";
export const OFFLINE_CHECK_OUTCOMES_COLLECTION_NAME = "gps_offline_check_outcomes";

type ExecutionDocument = {
  _id: string;
  source: "cron" | "manual";
  requestedScope: OfflineCheckVehicleTarget[];
  requestedCount: number;
  status: OfflineCheckExecutionStatus;
  startedAt: Date;
  endedAt?: Date;
  counts: OfflineCheckExecutionSummary["counts"];
  outcomeCount: number;
  schemaVersion: number;
};

type OutcomeDocument = OfflineCheckOutcome & {
  _id: string;
  executionId: string;
  companyKey: string;
  schemaVersion: number;
  createdAt: Date;
};

function isNamespaceExists(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 48;
}

function validator(required: string[], properties: Record<string, unknown>) {
  return { $jsonSchema: { bsonType: "object", required, properties } };
}

function toSummary(document: ExecutionDocument): OfflineCheckExecutionSummary {
  return {
    requestedCount: document.requestedCount,
    outcomeCount: document.outcomeCount,
    counts: document.counts,
    status: document.status === "running" ? "partial" : document.status,
  };
}

export function createCheckHistoryStore(database: Db) {
  const executions = database.collection<ExecutionDocument>(OFFLINE_CHECK_EXECUTIONS_COLLECTION_NAME);
  const outcomes = database.collection<OutcomeDocument>(OFFLINE_CHECK_OUTCOMES_COLLECTION_NAME);
  let schemaPromise: Promise<void> | null = null;

  async function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        try {
          await database.createCollection(OFFLINE_CHECK_EXECUTIONS_COLLECTION_NAME, {
            validator: validator(
              ["_id", "source", "requestedScope", "requestedCount", "status", "startedAt", "counts", "outcomeCount", "schemaVersion"],
              {
                _id: { bsonType: "string" }, source: { enum: ["cron", "manual"] }, requestedScope: { bsonType: "array" },
                requestedCount: { bsonType: "int" }, status: { enum: ["running", "completed", "partial", "failed"] },
                startedAt: { bsonType: "date" }, endedAt: { bsonType: "date" }, counts: { bsonType: "object" },
                outcomeCount: { bsonType: "int" }, schemaVersion: { bsonType: "int" },
              },
            ), validationLevel: "strict", validationAction: "error",
          });
        } catch (error) {
          if (!isNamespaceExists(error)) throw error;
          await database.command({ collMod: OFFLINE_CHECK_EXECUTIONS_COLLECTION_NAME, validator: validator([], {}), validationLevel: "strict", validationAction: "error" });
        }
        try {
          await database.createCollection(OFFLINE_CHECK_OUTCOMES_COLLECTION_NAME, {
            validator: validator(
              ["_id", "executionId", "vehicleId", "companyKey", "outcome", "schemaVersion", "createdAt"],
              { _id: { bsonType: "string" }, executionId: { bsonType: "string" }, vehicleId: { bsonType: "string" }, companyKey: { bsonType: "string" }, outcome: { enum: ["reporting", "delayed", "missing", "invalid", "failure"] }, schemaVersion: { bsonType: "int" }, createdAt: { bsonType: "date" },
              },
            ), validationLevel: "strict", validationAction: "error",
          });
        } catch (error) {
          if (!isNamespaceExists(error)) throw error;
          await database.command({ collMod: OFFLINE_CHECK_OUTCOMES_COLLECTION_NAME, validator: validator([], {}), validationLevel: "strict", validationAction: "error" });
        }
        await Promise.all([
          executions.createIndex({ source: 1, startedAt: -1 }),
          outcomes.createIndex({ executionId: 1, vehicleId: 1 }, { unique: true }),
          outcomes.createIndex({ executionId: 1 }),
        ]);
      })();
    }
    await schemaPromise;
  }

  async function startExecution(input: { executionId: string; source: "cron" | "manual"; requestedVehicles: OfflineCheckVehicleTarget[] }) {
    await ensureSchema();
    const requestedScope = normalizeRequestedVehicles(input.requestedVehicles);
    const now = new Date();
    await executions.updateOne(
      { _id: input.executionId },
      {
        $setOnInsert: {
          _id: input.executionId, source: input.source, requestedScope, requestedCount: requestedScope.length,
          status: "running", startedAt: now, counts: { reporting: 0, delayed: 0, missing: 0, invalid: 0, failure: 0 }, outcomeCount: 0, schemaVersion: 1,
        },
      },
      { upsert: true },
    );
    return (await executions.findOne({ _id: input.executionId }))!;
  }

  async function upsertOutcome(executionId: string, outcome: OfflineCheckOutcome & { companyKey: string }) {
    await ensureSchema();
    await outcomes.updateOne(
      { executionId, vehicleId: outcome.vehicleId },
      { $setOnInsert: { _id: `${executionId}:${outcome.vehicleId}`, executionId, vehicleId: outcome.vehicleId, companyKey: outcome.companyKey, outcome: outcome.outcome, observation: outcome.observation, error: outcome.error, schemaVersion: 1, createdAt: new Date() } },
      { upsert: true },
    );
  }

  async function listOutcomes(executionId: string) {
    await ensureSchema();
    return outcomes.find({ executionId }).toArray();
  }

  async function finalizeExecution(executionId: string) {
    await ensureSchema();
    const execution = (await executions.findOne({ _id: executionId }))!;
    const stored = await listOutcomes(executionId);
    const summary = calculateExecutionSummary(execution.requestedScope, stored);
    await executions.updateOne({ _id: executionId }, { $set: { ...summary, endedAt: new Date() } });
    return (await executions.findOne({ _id: executionId }))!;
  }

  return { ensureSchema, startExecution, upsertOutcome, listOutcomes, finalizeExecution, toSummary };
}
