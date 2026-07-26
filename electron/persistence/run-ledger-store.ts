import {
  cancelRunStep,
  claimRunStep,
  completeRunStep,
  failRunStep,
  interruptRunStep,
  markRunStepWaiting,
  RunReceiptRecordSchema,
  RunRecordSchema,
  RunStepRecordSchema,
  type RunReceiptRecord,
  type RunRecord,
  type RunStepRecord,
  type RunStepTransition,
} from "../../src/lib/runs/run-domain";

interface RunLedgerStatement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { changes?: number | bigint };
}

interface RunLedgerDatabase {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => RunLedgerStatement;
  transaction: <TResult>(callback: () => TResult) => () => TResult;
}

interface RunRow {
  id: string;
  kind: string;
  origin_kind: string;
  origin_id: string;
  project_path: string;
  workspace_id: string;
  task_id: string | null;
  status: string;
  policy_json: string;
  provenance_json: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  error: string | null;
}

interface RunStepRow {
  id: string;
  run_id: string;
  kind: string;
  dependency_ids_json: string;
  status: string;
  attempt: number;
  execution_id: string | null;
  claim_idempotency_key: string | null;
  input_hash: string;
  result_artifact_ref: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

interface RunReceiptRow {
  run_id: string;
  step_id: string;
  sequence: number;
  receipt_type: string;
  execution_id: string | null;
  idempotency_key: string;
  created_at: string;
  detail_json: string | null;
}

type RunLedgerPersistenceRejectionReason =
  | "input-mismatch"
  | "not-found"
  | "run-conflict"
  | "step-conflict";

export type RunLedgerTransitionResult =
  | RunStepTransition
  | {
      accepted: false;
      reason: RunLedgerPersistenceRejectionReason;
      run: RunRecord | null;
      step: RunStepRecord | null;
      receipts: [];
    };

function parseJson(value: string) {
  return JSON.parse(value) as unknown;
}

function mapRunRow(row: RunRow): RunRecord {
  return RunRecordSchema.parse({
    id: row.id,
    kind: row.kind,
    origin: {
      kind: row.origin_kind,
      id: row.origin_id,
    },
    ownership: {
      projectPath: row.project_path,
      workspaceId: row.workspace_id,
      taskId: row.task_id,
    },
    status: row.status,
    policy: parseJson(row.policy_json),
    provenance: parseJson(row.provenance_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    error: row.error,
  });
}

function mapRunStepRow(row: RunStepRow): RunStepRecord {
  return RunStepRecordSchema.parse({
    id: row.id,
    runId: row.run_id,
    kind: row.kind,
    dependencyIds: parseJson(row.dependency_ids_json),
    status: row.status,
    attempt: row.attempt,
    executionId: row.execution_id,
    claimIdempotencyKey: row.claim_idempotency_key,
    inputHash: row.input_hash,
    resultArtifactRef: row.result_artifact_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    error: row.error,
  });
}

function mapRunReceiptRow(row: RunReceiptRow): RunReceiptRecord {
  return RunReceiptRecordSchema.parse({
    runId: row.run_id,
    stepId: row.step_id,
    sequence: row.sequence,
    type: row.receipt_type,
    executionId: row.execution_id,
    idempotencyKey: row.idempotency_key,
    timestamp: row.created_at,
    detail: row.detail_json ? parseJson(row.detail_json) : null,
  });
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasRunIdentityConflict(existing: RunRecord, incoming: RunRecord) {
  return (
    existing.kind !== incoming.kind ||
    !sameJson(existing.origin, incoming.origin) ||
    !sameJson(existing.ownership, incoming.ownership) ||
    !sameJson(existing.policy, incoming.policy) ||
    !sameJson(existing.provenance, incoming.provenance)
  );
}

function hasStepIdentityConflict(
  existing: RunStepRecord,
  incoming: RunStepRecord,
) {
  return (
    existing.runId !== incoming.runId ||
    existing.kind !== incoming.kind ||
    !sameJson(existing.dependencyIds, incoming.dependencyIds)
  );
}

export class RunLedgerStore {
  private readonly db: RunLedgerDatabase;

  constructor(database: unknown) {
    this.db = database as RunLedgerDatabase;
    this.bootstrap();
  }

  private bootstrap() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        origin_kind TEXT NOT NULL,
        origin_id TEXT NOT NULL,
        project_path TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        task_id TEXT,
        status TEXT NOT NULL,
        policy_json TEXT NOT NULL,
        provenance_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_runs_ownership_updated
        ON runs (project_path, workspace_id, task_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS run_steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        dependency_ids_json TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 0,
        execution_id TEXT,
        claim_idempotency_key TEXT,
        input_hash TEXT NOT NULL,
        result_artifact_ref TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        error TEXT,
        FOREIGN KEY (run_id) REFERENCES runs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_run_steps_run_status
        ON run_steps (run_id, status, updated_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_run_steps_run_id
        ON run_steps (run_id, id);

      CREATE TABLE IF NOT EXISTS run_receipts (
        run_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        receipt_type TEXT NOT NULL,
        execution_id TEXT,
        idempotency_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        detail_json TEXT,
        PRIMARY KEY (run_id, sequence),
        FOREIGN KEY (run_id) REFERENCES runs(id),
        FOREIGN KEY (step_id) REFERENCES run_steps(id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_run_receipts_idempotency
        ON run_receipts (run_id, idempotency_key);

      CREATE INDEX IF NOT EXISTS idx_run_receipts_step_sequence
        ON run_receipts (step_id, sequence);
    `);
  }

  private getRun(runId: string): RunRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          id,
          kind,
          origin_kind,
          origin_id,
          project_path,
          workspace_id,
          task_id,
          status,
          policy_json,
          provenance_json,
          created_at,
          updated_at,
          completed_at,
          error
        FROM runs
        WHERE id = ?
      `,
      )
      .get(runId) as RunRow | undefined;
    return row ? mapRunRow(row) : null;
  }

  private getStep(stepId: string): RunStepRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          id,
          run_id,
          kind,
          dependency_ids_json,
          status,
          attempt,
          execution_id,
          claim_idempotency_key,
          input_hash,
          result_artifact_ref,
          created_at,
          updated_at,
          started_at,
          completed_at,
          error
        FROM run_steps
        WHERE id = ?
      `,
      )
      .get(stepId) as RunStepRow | undefined;
    return row ? mapRunStepRow(row) : null;
  }

  getAggregate(args: { runId: string; stepId: string }) {
    const run = this.getRun(args.runId);
    const step = this.getStep(args.stepId);
    return run && step && step.runId === run.id ? { run, step } : null;
  }

  private insertRun(run: RunRecord) {
    this.db
      .prepare(
        `
        INSERT INTO runs (
          id,
          kind,
          origin_kind,
          origin_id,
          project_path,
          workspace_id,
          task_id,
          status,
          policy_json,
          provenance_json,
          created_at,
          updated_at,
          completed_at,
          error
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        run.id,
        run.kind,
        run.origin.kind,
        run.origin.id,
        run.ownership.projectPath,
        run.ownership.workspaceId,
        run.ownership.taskId,
        run.status,
        JSON.stringify(run.policy),
        JSON.stringify(run.provenance),
        run.createdAt,
        run.updatedAt,
        run.completedAt,
        run.error,
      );
  }

  private insertStep(step: RunStepRecord) {
    this.db
      .prepare(
        `
        INSERT INTO run_steps (
          id,
          run_id,
          kind,
          dependency_ids_json,
          status,
          attempt,
          execution_id,
          claim_idempotency_key,
          input_hash,
          result_artifact_ref,
          created_at,
          updated_at,
          started_at,
          completed_at,
          error
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        step.id,
        step.runId,
        step.kind,
        JSON.stringify(step.dependencyIds),
        step.status,
        step.attempt,
        step.executionId,
        step.claimIdempotencyKey,
        step.inputHash,
        step.resultArtifactRef,
        step.createdAt,
        step.updatedAt,
        step.startedAt,
        step.completedAt,
        step.error,
      );
  }

  private persistTransition(transition: RunStepTransition) {
    if (!transition.accepted || transition.duplicate) {
      return;
    }
    this.db
      .prepare(
        `
        UPDATE runs
        SET
          status = ?,
          updated_at = ?,
          completed_at = ?,
          error = ?
        WHERE id = ?
      `,
      )
      .run(
        transition.run.status,
        transition.run.updatedAt,
        transition.run.completedAt,
        transition.run.error,
        transition.run.id,
      );
    this.db
      .prepare(
        `
        UPDATE run_steps
        SET
          status = ?,
          attempt = ?,
          execution_id = ?,
          claim_idempotency_key = ?,
          result_artifact_ref = ?,
          updated_at = ?,
          started_at = ?,
          completed_at = ?,
          error = ?
        WHERE id = ?
      `,
      )
      .run(
        transition.step.status,
        transition.step.attempt,
        transition.step.executionId,
        transition.step.claimIdempotencyKey,
        transition.step.resultArtifactRef,
        transition.step.updatedAt,
        transition.step.startedAt,
        transition.step.completedAt,
        transition.step.error,
        transition.step.id,
      );

    const sequenceRow = this.db
      .prepare(
        `
        SELECT COALESCE(MAX(sequence), 0) AS sequence
        FROM run_receipts
        WHERE run_id = ?
      `,
      )
      .get(transition.run.id) as { sequence: number } | undefined;
    let sequence = Number(sequenceRow?.sequence ?? 0);
    for (const receipt of transition.receipts) {
      sequence += 1;
      const record = RunReceiptRecordSchema.parse({ ...receipt, sequence });
      this.db
        .prepare(
          `
          INSERT INTO run_receipts (
            run_id,
            step_id,
            sequence,
            receipt_type,
            execution_id,
            idempotency_key,
            created_at,
            detail_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          record.runId,
          record.stepId,
          record.sequence,
          record.type,
          record.executionId,
          record.idempotencyKey,
          record.timestamp,
          record.detail ? JSON.stringify(record.detail) : null,
        );
    }
  }

  claimStep(args: {
    run: RunRecord;
    step: RunStepRecord;
    executionId: string;
    idempotencyKey: string;
    now: string;
  }): RunLedgerTransitionResult {
    const incomingRun = RunRecordSchema.parse(args.run);
    const incomingStep = RunStepRecordSchema.parse(args.step);
    const tx = this.db.transaction<RunLedgerTransitionResult>(() => {
      let run = this.getRun(incomingRun.id);
      let step = this.getStep(incomingStep.id);
      if (run && hasRunIdentityConflict(run, incomingRun)) {
        return {
          accepted: false,
          reason: "run-conflict",
          run,
          step,
          receipts: [],
        };
      }
      if (step && hasStepIdentityConflict(step, incomingStep)) {
        return {
          accepted: false,
          reason: "step-conflict",
          run,
          step,
          receipts: [],
        };
      }
      if (step && step.inputHash !== incomingStep.inputHash) {
        return {
          accepted: false,
          reason: "input-mismatch",
          run,
          step,
          receipts: [],
        };
      }
      if (!run) {
        this.insertRun(incomingRun);
        run = incomingRun;
      }
      if (!step) {
        if (incomingStep.runId !== run.id) {
          return {
            accepted: false,
            reason: "step-conflict",
            run,
            step: null,
            receipts: [],
          };
        }
        this.insertStep(incomingStep);
        step = incomingStep;
      }
      const transition = claimRunStep({
        run,
        step,
        executionId: args.executionId,
        idempotencyKey: args.idempotencyKey,
        now: args.now,
      });
      this.persistTransition(transition);
      return transition;
    });
    return tx();
  }

  private transitionExisting(
    args: {
      runId: string;
      stepId: string;
    },
    apply: (aggregate: {
      run: RunRecord;
      step: RunStepRecord;
    }) => RunStepTransition,
  ): RunLedgerTransitionResult {
    const tx = this.db.transaction<RunLedgerTransitionResult>(() => {
      const aggregate = this.getAggregate(args);
      if (!aggregate) {
        return {
          accepted: false,
          reason: "not-found",
          run: this.getRun(args.runId),
          step: this.getStep(args.stepId),
          receipts: [],
        };
      }
      const transition = apply(aggregate);
      this.persistTransition(transition);
      return transition;
    });
    return tx();
  }

  markStepWaiting(args: {
    runId: string;
    stepId: string;
    executionId: string;
    idempotencyKey: string;
    detail?: unknown;
    now: string;
  }) {
    return this.transitionExisting(args, ({ run, step }) =>
      markRunStepWaiting({
        run,
        step,
        executionId: args.executionId,
        idempotencyKey: args.idempotencyKey,
        detail: args.detail,
        now: args.now,
      }),
    );
  }

  completeStep(args: {
    runId: string;
    stepId: string;
    executionId: string;
    idempotencyKey: string;
    resultArtifactRef: string;
    now: string;
  }) {
    return this.transitionExisting(args, ({ run, step }) =>
      completeRunStep({
        run,
        step,
        executionId: args.executionId,
        idempotencyKey: args.idempotencyKey,
        resultArtifactRef: args.resultArtifactRef,
        now: args.now,
      }),
    );
  }

  failStep(args: {
    runId: string;
    stepId: string;
    executionId: string;
    idempotencyKey: string;
    error: string;
    detail?: unknown;
    now: string;
  }) {
    return this.transitionExisting(args, ({ run, step }) =>
      failRunStep({
        run,
        step,
        executionId: args.executionId,
        idempotencyKey: args.idempotencyKey,
        error: args.error,
        detail: args.detail,
        now: args.now,
      }),
    );
  }

  cancelStep(args: {
    runId: string;
    stepId: string;
    idempotencyKey: string;
    expectedExecutionId?: string;
    detail?: unknown;
    now: string;
  }) {
    return this.transitionExisting(args, ({ run, step }) =>
      cancelRunStep({
        run,
        step,
        idempotencyKey: args.idempotencyKey,
        expectedExecutionId: args.expectedExecutionId,
        detail: args.detail,
        now: args.now,
      }),
    );
  }

  listReceipts(args: { runId: string }): RunReceiptRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          run_id,
          step_id,
          sequence,
          receipt_type,
          execution_id,
          idempotency_key,
          created_at,
          detail_json
        FROM run_receipts
        WHERE run_id = ?
        ORDER BY sequence ASC
      `,
      )
      .all(args.runId) as RunReceiptRow[];
    return rows.map(mapRunReceiptRow);
  }

  reconcileInterruptedRuns(args: { now: string }) {
    const tx = this.db.transaction(() => {
      const rows = this.db
        .prepare(
          `
          SELECT id, run_id
          FROM run_steps
          WHERE status IN ('running', 'waiting')
          ORDER BY run_id, id
        `,
        )
        .all() as Array<{ id: string; run_id: string }>;
      let reconciled = 0;
      for (const row of rows) {
        const aggregate = this.getAggregate({
          runId: row.run_id,
          stepId: row.id,
        });
        if (!aggregate) {
          continue;
        }
        const transition = interruptRunStep({
          run: aggregate.run,
          step: aggregate.step,
          idempotencyKey: `restart:${aggregate.step.executionId ?? aggregate.step.id}`,
          error: "Stave restarted before the secondary provider step finished.",
          now: args.now,
        });
        if (!transition.accepted || transition.duplicate) {
          continue;
        }
        this.persistTransition(transition);
        reconciled += 1;
      }
      return reconciled;
    });
    return tx();
  }
}
