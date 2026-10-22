import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  LensReviewRecordSchema,
  MAX_LENS_REVIEW_IMAGE_BYTES,
  MAX_LENS_REVIEW_RECORDS_PER_TASK,
  MAX_PNG_DATA_URL_LENGTH,
  PNG_DATA_URL_PREFIX,
  type LensRecheckReason,
  type LensReviewRecord,
  type LensReviewVerdict,
} from "../../src/lib/lens/lens-review-record";
import { readContainedFile } from "../main/utils/contained-file";

interface LensReviewDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
}

/** The captures' folder under the app's artifacts folder. */
export const LENS_REVIEW_IMAGE_DIR = "lens-reviews";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The PNG bytes of a capture data URL, or null when it is not a PNG within the size bound. */
export function decodeLensReviewPng(dataUrl: string): Uint8Array | null {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX) || dataUrl.length > MAX_PNG_DATA_URL_LENGTH) return null;
  const bytes = Uint8Array.from(Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), "base64"));
  if (bytes.length > MAX_LENS_REVIEW_IMAGE_BYTES || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return null;
  return bytes;
}

export type NewLensReviewRecord = Pick<
  LensReviewRecord,
  "taskId" | "workspaceId" | "lensSessionId" | "annotationId" | "pageUrl" | "viewport" | "before" | "documentId" | "verdict"
>;

/** Task IDs become folder names only through this hash. */
function taskFolder(taskId: string): string {
  return createHash("sha256").update(taskId).digest("hex").slice(0, 24);
}

/**
 * Lens review records: one SQLite row per record (the record as JSON, plus
 * the columns its queries need) and the "after" capture as a PNG file. A task
 * keeps its newest records up to the cap; saving one more drops the oldest,
 * file included. Rows that no longer parse are skipped rather than failing the
 * whole list.
 */
export class LensReviewRecordStore {
  private readonly cap: number;

  constructor(
    private readonly db: LensReviewDatabase,
    private readonly artifactRootDir: string,
    options: { cap?: number } = {},
  ) {
    this.cap = options.cap ?? MAX_LENS_REVIEW_RECORDS_PER_TASK;
    db.exec(`
      CREATE TABLE IF NOT EXISTS lens_review_records (
        id TEXT NOT NULL PRIMARY KEY,
        task_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        annotation_id TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lens_review_records_task
        ON lens_review_records(task_id, captured_at);
      CREATE INDEX IF NOT EXISTS idx_lens_review_records_workspace
        ON lens_review_records(workspace_id);
    `);
  }

  async save(input: NewLensReviewRecord & { afterPng: Uint8Array; now?: Date }): Promise<LensReviewRecord> {
    const id = randomUUID();
    const at = (input.now ?? new Date()).toISOString();
    const afterImagePath = path.posix.join(LENS_REVIEW_IMAGE_DIR, taskFolder(input.taskId), `${id}.png`);
    const { afterPng, now: _now, ...fields } = input;
    const record = LensReviewRecordSchema.parse({
      ...fields,
      id,
      afterImagePath,
      capturedAt: at,
      updatedAt: at,
      ...(input.verdict === "confirmed" ? { confirmedAt: at } : { recheckReason: "reviewer" }),
    });
    const target = this.resolveImage(afterImagePath)!;
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, afterPng);
    await rename(temporary, target);
    try {
      this.db
        .prepare(
          `INSERT INTO lens_review_records (id, task_id, workspace_id, annotation_id, captured_at, record_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(record.id, record.taskId, record.workspaceId, record.annotationId, record.capturedAt, JSON.stringify(record));
    } catch (error) {
      await rm(target, { force: true });
      throw error;
    }
    await this.removeFiles(this.dropOverCap(record.taskId));
    return record;
  }

  /** A task's records, newest first; one annotation's only when `annotationId` is given. */
  list(args: { taskId: string; annotationId?: string }): LensReviewRecord[] {
    const rows = (args.annotationId
      ? this.db
          .prepare("SELECT record_json AS json FROM lens_review_records WHERE task_id = ? AND annotation_id = ? ORDER BY captured_at DESC, rowid DESC")
          .all(args.taskId, args.annotationId)
      : this.db
          .prepare("SELECT record_json AS json FROM lens_review_records WHERE task_id = ? ORDER BY captured_at DESC, rowid DESC")
          .all(args.taskId)) as Array<{ json: string }>;
    return rows.flatMap((row) => parseRecord(row.json) ?? []);
  }

  get(id: string): LensReviewRecord | null {
    const row = this.db.prepare("SELECT record_json AS json FROM lens_review_records WHERE id = ?").get(id) as { json: string } | undefined;
    return row ? parseRecord(row.json) : null;
  }

  /**
   * Confirming records when; marking a re-check keeps when it was last
   * confirmed and says why it needs another look.
   */
  setVerdict(args: { id: string; verdict: LensReviewVerdict; reason?: LensRecheckReason; now?: Date }): LensReviewRecord | null {
    const current = this.get(args.id);
    if (!current) return null;
    const at = (args.now ?? new Date()).toISOString();
    const { recheckReason: _reason, ...rest } = current;
    const next = LensReviewRecordSchema.parse(args.verdict === "confirmed"
      ? { ...rest, verdict: "confirmed", confirmedAt: at, updatedAt: at }
      : { ...rest, verdict: "needs-recheck", recheckReason: args.reason ?? "reviewer", updatedAt: at });
    this.db.prepare("UPDATE lens_review_records SET record_json = ? WHERE id = ?").run(JSON.stringify(next), args.id);
    return next;
  }

  /**
   * A confirmation stands only while the Lens session shows the document it
   * was captured from (`currentDocumentId`, absent when the session is gone).
   * Otherwise the record is kept and marked as needing a re-check.
   */
  reconcileDocument(record: LensReviewRecord, currentDocumentId: string | undefined, now?: Date): LensReviewRecord {
    if (record.verdict !== "confirmed" || currentDocumentId === record.documentId) return record;
    return this.setVerdict({ id: record.id, verdict: "needs-recheck", reason: "page-changed", now }) ?? record;
  }

  /** The capture's bytes; a capture replaced by a link that leaves the captures folder is never read. */
  async readAfterImage(id: string): Promise<Uint8Array | null> {
    const record = this.get(id);
    const file = record ? this.resolveImage(record.afterImagePath) : null;
    if (!file) return null;
    const read = await readContainedFile({ root: path.resolve(this.artifactRootDir, LENS_REVIEW_IMAGE_DIR), filePath: file, maxBytes: MAX_LENS_REVIEW_IMAGE_BYTES });
    return read.ok ? new Uint8Array(read.content) : null;
  }

  async deleteTask(taskId: string): Promise<void> {
    const paths = this.pathsWhere("task_id = ?", taskId);
    this.db.prepare("DELETE FROM lens_review_records WHERE task_id = ?").run(taskId);
    await this.removeFiles(paths);
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    const paths = this.pathsWhere("workspace_id = ?", workspaceId);
    this.db.prepare("DELETE FROM lens_review_records WHERE workspace_id = ?").run(workspaceId);
    await this.removeFiles(paths);
  }

  /** Deletes the task's rows beyond the cap and returns their capture paths. */
  private dropOverCap(taskId: string): string[] {
    const over = this.db
      .prepare(
        `SELECT id, record_json AS json FROM lens_review_records WHERE task_id = ?
         ORDER BY captured_at DESC, rowid DESC LIMIT -1 OFFSET ?`,
      )
      .all(taskId, this.cap) as Array<{ id: string; json: string }>;
    const remove = this.db.prepare("DELETE FROM lens_review_records WHERE id = ?");
    for (const row of over) remove.run(row.id);
    return over.flatMap((row) => parseRecord(row.json)?.afterImagePath ?? []);
  }

  private pathsWhere(condition: string, value: string): string[] {
    const rows = this.db.prepare(`SELECT record_json AS json FROM lens_review_records WHERE ${condition}`).all(value) as Array<{ json: string }>;
    return rows.flatMap((row) => parseRecord(row.json)?.afterImagePath ?? []);
  }

  /** Files go after their rows; a file that cannot be removed only costs disk space. */
  private async removeFiles(paths: readonly string[]): Promise<void> {
    await Promise.all(paths.map(async (relative) => {
      const file = this.resolveImage(relative);
      if (file) await rm(file, { force: true }).catch(() => undefined);
    }));
  }

  /** The capture's absolute path, only when it stays inside the captures folder. */
  private resolveImage(relative: string): string | null {
    const root = path.resolve(this.artifactRootDir, LENS_REVIEW_IMAGE_DIR);
    const file = path.resolve(this.artifactRootDir, relative);
    return file.startsWith(`${root}${path.sep}`) ? file : null;
  }
}

function parseRecord(json: string): LensReviewRecord | null {
  try {
    const parsed = LensReviewRecordSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
