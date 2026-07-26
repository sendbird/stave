import { z } from "zod";
import {
  CRANE_STAVE_RECEIPT_STATES,
  CraneStaveJobV1Schema,
  CraneStaveReceiptV1Schema,
  type CraneStaveJobV1,
  type CraneStaveReceiptState,
  type CraneStaveReceiptV1,
} from "../../src/lib/crane-connector/contract";

interface CraneBindingStatement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { changes?: number | bigint };
}

interface CraneBindingDatabase {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => CraneBindingStatement;
}

const NullableIdSchema = z.string().trim().min(1).max(256).nullable();

export const LocalCraneJobBindingSchema = z
  .object({
    jobId: z.string().trim().min(1).max(128),
    connectorId: z.string().trim().min(1).max(128),
    job: CraneStaveJobV1Schema,
    leaseExpiresAt: z.string().datetime({ offset: true }),
    state: z.enum(CRANE_STAVE_RECEIPT_STATES),
    lastReceiptSequence: z.number().int().min(0),
    pendingReceipt: CraneStaveReceiptV1Schema.nullable(),
    workspaceId: NullableIdSchema,
    taskId: NullableIdSchema,
    turnId: NullableIdSchema,
    errorCode: z.string().trim().min(1).max(64).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.job.id !== value.jobId ||
      value.job.connectorId !== value.connectorId
    ) {
      context.addIssue({
        code: "custom",
        message: "The binding identity must match its Crane job.",
      });
    }
    if (
      value.pendingReceipt &&
      (value.pendingReceipt.jobId !== value.jobId ||
        value.pendingReceipt.connectorId !== value.connectorId)
    ) {
      context.addIssue({
        code: "custom",
        message: "The pending receipt must match its Crane binding.",
      });
    }
  });

export interface LocalCraneJobBinding {
  jobId: string;
  connectorId: string;
  job: CraneStaveJobV1;
  leaseExpiresAt: string;
  state: CraneStaveReceiptState;
  lastReceiptSequence: number;
  pendingReceipt: CraneStaveReceiptV1 | null;
  workspaceId: string | null;
  taskId: string | null;
  turnId: string | null;
  errorCode: string | null;
  updatedAt: string;
}

interface CraneBindingRow {
  job_id: string;
  connector_id: string;
  job_json: string;
  lease_expires_at: string;
  state: string;
  last_receipt_sequence: number;
  pending_receipt_json: string | null;
  workspace_id: string | null;
  task_id: string | null;
  turn_id: string | null;
  error_code: string | null;
  updated_at: string;
}

const TERMINAL_STATES: CraneStaveReceiptState[] = [
  "declined",
  "completed",
  "failed",
  "cancelled",
];

function parseBindingRow(row: CraneBindingRow): LocalCraneJobBinding {
  return LocalCraneJobBindingSchema.parse({
    jobId: row.job_id,
    connectorId: row.connector_id,
    job: JSON.parse(row.job_json),
    leaseExpiresAt: row.lease_expires_at,
    state: row.state,
    lastReceiptSequence: row.last_receipt_sequence,
    pendingReceipt: row.pending_receipt_json
      ? JSON.parse(row.pending_receipt_json)
      : null,
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    turnId: row.turn_id,
    errorCode: row.error_code,
    updatedAt: row.updated_at,
  });
}

const SELECT_COLUMNS = `
  job_id,
  connector_id,
  job_json,
  lease_expires_at,
  state,
  last_receipt_sequence,
  pending_receipt_json,
  workspace_id,
  task_id,
  turn_id,
  error_code,
  updated_at
`;

export class CraneJobBindingStore {
  private readonly db: CraneBindingDatabase;

  constructor(database: unknown) {
    this.db = database as CraneBindingDatabase;
    this.bootstrap();
  }

  private bootstrap() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crane_stave_job_bindings (
        job_id TEXT PRIMARY KEY,
        connector_id TEXT NOT NULL,
        job_json TEXT NOT NULL,
        lease_expires_at TEXT NOT NULL,
        state TEXT NOT NULL,
        last_receipt_sequence INTEGER NOT NULL DEFAULT 0,
        pending_receipt_json TEXT,
        workspace_id TEXT,
        task_id TEXT,
        turn_id TEXT,
        error_code TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_crane_stave_bindings_active
        ON crane_stave_job_bindings (connector_id, state, updated_at DESC);
    `);
  }

  get(jobId: string): LocalCraneJobBinding | null {
    const row = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM crane_stave_job_bindings
         WHERE job_id = ?`,
      )
      .get(jobId) as CraneBindingRow | undefined;
    return row ? parseBindingRow(row) : null;
  }

  listActive(connectorId: string): LocalCraneJobBinding[] {
    const terminalPlaceholders = TERMINAL_STATES.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM crane_stave_job_bindings
         WHERE connector_id = ?
           AND (
             state NOT IN (${terminalPlaceholders})
             OR pending_receipt_json IS NOT NULL
           )
         ORDER BY updated_at ASC, job_id ASC`,
      )
      .all(connectorId, ...TERMINAL_STATES) as CraneBindingRow[];
    return rows.map(parseBindingRow);
  }

  upsert(input: LocalCraneJobBinding): LocalCraneJobBinding {
    const binding = LocalCraneJobBindingSchema.parse(input);
    const existing = this.get(binding.jobId);
    if (
      existing &&
      (existing.connectorId !== binding.connectorId ||
        JSON.stringify(existing.job) !== JSON.stringify(binding.job))
    ) {
      throw new Error(
        "A Crane job binding already exists with a different identity.",
      );
    }

    this.db
      .prepare(
        `INSERT INTO crane_stave_job_bindings (
           job_id,
           connector_id,
           job_json,
           lease_expires_at,
           state,
           last_receipt_sequence,
           pending_receipt_json,
           workspace_id,
           task_id,
           turn_id,
           error_code,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           lease_expires_at = excluded.lease_expires_at,
           state = excluded.state,
           last_receipt_sequence = excluded.last_receipt_sequence,
           pending_receipt_json = excluded.pending_receipt_json,
           workspace_id = excluded.workspace_id,
           task_id = excluded.task_id,
           turn_id = excluded.turn_id,
           error_code = excluded.error_code,
           updated_at = excluded.updated_at`,
      )
      .run(
        binding.jobId,
        binding.connectorId,
        JSON.stringify(binding.job),
        binding.leaseExpiresAt,
        binding.state,
        binding.lastReceiptSequence,
        binding.pendingReceipt
          ? JSON.stringify(binding.pendingReceipt)
          : null,
        binding.workspaceId,
        binding.taskId,
        binding.turnId,
        binding.errorCode,
        binding.updatedAt,
      );
    return this.get(binding.jobId)!;
  }

  pruneTerminalBefore(cutoff: string): number {
    const terminalPlaceholders = TERMINAL_STATES.map(() => "?").join(", ");
    const result = this.db
      .prepare(
        `DELETE FROM crane_stave_job_bindings
         WHERE state IN (${terminalPlaceholders})
           AND pending_receipt_json IS NULL
           AND updated_at < ?`,
      )
      .run(...TERMINAL_STATES, cutoff);
    return Number(result.changes ?? 0);
  }
}
