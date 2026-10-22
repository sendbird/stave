import { z } from "zod";
import {
  HANDOFF_AUTHORS,
  HANDOFF_SECTION_MAX_CHARS,
  type TaskHandoffRecord,
} from "./handoff-record";

/** A task's handoff record, read and saved in the main process. */
export const TASK_HANDOFF_READ_IPC = "persistence:read-task-handoff";
export const TASK_HANDOFF_SAVE_IPC = "persistence:save-task-handoff";

const IdSchema = z.string().min(1).max(200);
const SectionTextSchema = z.string().max(HANDOFF_SECTION_MAX_CHARS * 2);
const AuthorSchema = z.enum(HANDOFF_AUTHORS);

export const ReadTaskHandoffArgsSchema = z
  .object({ workspaceId: IdSchema, taskId: IdSchema })
  .strict();
export type ReadTaskHandoffArgs = z.infer<typeof ReadTaskHandoffArgsSchema>;

export const SaveTaskHandoffArgsSchema = z
  .object({
    workspaceId: IdSchema,
    taskId: IdSchema,
    /** The revision editing started from; a different stored revision is a conflict. */
    baseRevision: z.number().int().min(0),
    draft: z
      .object({
        goal: SectionTextSchema,
        decisions: SectionTextSchema,
        verified: SectionTextSchema,
        remaining: SectionTextSchema,
        cautions: SectionTextSchema,
      })
      .strict(),
    authors: z
      .object({
        goal: AuthorSchema.optional(),
        decisions: AuthorSchema.optional(),
        verified: AuthorSchema.optional(),
        remaining: AuthorSchema.optional(),
        cautions: AuthorSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type SaveTaskHandoffArgs = z.infer<typeof SaveTaskHandoffArgsSchema>;

export type ReadTaskHandoffResponse =
  | { ok: true; record: TaskHandoffRecord }
  | { ok: false; message: string };

export type SaveTaskHandoffResponse =
  | { ok: true; record: TaskHandoffRecord }
  /** The record changed since editing began; `record` is what is stored now. */
  | { ok: false; conflict: true; record: TaskHandoffRecord }
  /** `missingTask`: the workspace has no stored task with this id (deleted, or not saved yet). */
  | { ok: false; conflict?: false; missingTask?: true; message: string };
