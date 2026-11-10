import { z } from "zod";
import { isTarsResponsibilityTerminal } from "./attention";
import type { TarsResponsibility } from "./types";

/**
 * Clearing Tars's surfaces hides; it never deletes. A clear is a saved record:
 * - `conversation`: the conversation view and Tars's recent history start
 *   after it. Messages, decisions and records stay saved, because queued work
 *   reads its message's attachments, decisions and receipts point at messages,
 *   and the record is the audit trail. Work that still needs the conversation
 *   (a queued or reasoning message, a waiting decision, words waiting to be
 *   said in a task) stays in view.
 * - `done` / `outputs`: the tray leaves out ended work's Done card or its
 *   outputs. Only ended work, and never work whose draft pull request is not
 *   finished or still waits for the user's confirmation.
 * Each clear can be undone from its record. Retention hides ended work the same
 * way after a number of days, computed on every read, so choosing "Never"
 * shows it again.
 *
 * This module is imported by the responsibility and conversation contracts,
 * so at runtime it imports neither of them.
 */

const IdSchema = z.string().trim().min(1).max(256);
const TimestampSchema = z.iso.datetime();

export const TarsClearScopeSchema = z.enum(["conversation", "done", "outputs"]);
export type TarsClearScope = z.infer<typeof TarsClearScopeSchema>;

export const TarsClearScopesSchema = z.array(TarsClearScopeSchema).min(1).max(3)
  // i18n-ignore: schema diagnostic, not user-facing copy
  .refine((scopes) => new Set(scopes).size === scopes.length, "Each scope is listed once.");

/** Scopes in one order, so the same choice always reads and hashes the same. */
export function normalizeTarsClearScopes(scopes: readonly TarsClearScope[]): TarsClearScope[] {
  return TarsClearScopeSchema.options.filter((scope) => scopes.includes(scope));
}

/** How many days ended work stays in the tray; 0 keeps it until cleared. */
export const TARS_RETENTION_DAYS = [0, 1, 3, 7, 14, 30] as const;
export type TarsRetentionDays = (typeof TARS_RETENTION_DAYS)[number];
/** A week: long enough to come back to finished work, short enough that Done does not grow without end. */
export const TARS_DEFAULT_RETENTION_DAYS: TarsRetentionDays = 7;
export const TarsRetentionDaysSchema = z.number().int()
  // i18n-ignore: schema diagnostic, not user-facing copy
  .refine((days): days is TarsRetentionDays => (TARS_RETENTION_DAYS as readonly number[]).includes(days), "Choose one of the offered retention periods.");

export const TarsViewSettingsSchema = z.object({ retentionDays: TarsRetentionDaysSchema }).strict();
export type TarsViewSettings = z.infer<typeof TarsViewSettingsSchema>;
export const TARS_DEFAULT_VIEW_SETTINGS: TarsViewSettings = Object.freeze({ retentionDays: TARS_DEFAULT_RETENTION_DAYS });

/**
 * The model's proposal to clear. It clears nothing by itself: the host saves
 * it as proposed, and only the user's confirmation on its card clears.
 */
export const TarsClearActionSchema = z.object({
  kind: z.literal("clear"),
  scopes: TarsClearScopesSchema,
}).strict();
export type TarsClearAction = z.infer<typeof TarsClearActionSchema>;

/** A tray or header button (by pointer or keyboard), or Confirm on a Tars proposal's card. */
export const TarsClearSourceSchema = z.enum(["click", "key"]);
export type TarsClearSource = z.infer<typeof TarsClearSourceSchema>;

/** A confirmed proposal's request id, the same from any surface, so a retry joins the first record. */
export function tarsClearProposalRequestId(messageId: string, actionIndex: number) {
  return `clear:${messageId}:${actionIndex}`;
}
export function parseTarsClearProposalRequestId(requestId: string): { messageId: string; actionIndex: number } | null {
  const match = /^clear:(.+):([0-7])$/.exec(requestId);
  return match ? { messageId: match[1]!, actionIndex: Number(match[2]) } : null;
}

/** One clear. Its request id is the retry identity: the same id with other scopes is refused. */
export const TarsClearInputSchema = z.object({
  requestId: IdSchema.regex(/^[A-Za-z0-9._:-]+$/),
  scopes: TarsClearScopesSchema,
  source: TarsClearSourceSchema,
}).strict();
export type TarsClearInput = z.infer<typeof TarsClearInputSchema>;

export const TarsUndoClearInputSchema = z.object({ requestId: IdSchema }).strict();
export type TarsUndoClearInput = z.infer<typeof TarsUndoClearInputSchema>;

/** The most responsibilities one clear names; a longer list is hidden by retention long before it matters. */
export const TARS_CLEAR_MAX_ITEMS = 1_000;

/**
 * What one clear hid, as saved: `hiddenMessages` with the conversation scope,
 * `done` and `outputs` (the responsibilities whose card or outputs it hid)
 * with theirs. `undone` restored all of it. `inProgress`, with the
 * conversation scope, names the messages still queued or being answered when
 * it was saved: they and their replies stay in view and in Tars's history,
 * whatever time the reply lands, because a millisecond clock cannot order a
 * reply saved in the clear's own millisecond. Older records lack it and are
 * read as keeping none.
 */
export const TarsClearRecordSchema = z.object({
  requestId: IdSchema,
  source: TarsClearSourceSchema,
  scopes: TarsClearScopesSchema,
  proposal: z.object({ messageId: IdSchema, actionIndex: z.number().int().min(0).max(7) }).strict().nullable(),
  status: z.enum(["applied", "undone"]),
  hiddenMessages: z.number().int().min(0).optional(),
  done: z.array(IdSchema).max(TARS_CLEAR_MAX_ITEMS).optional(),
  outputs: z.array(IdSchema).max(TARS_CLEAR_MAX_ITEMS).optional(),
  inProgress: z.array(IdSchema).max(TARS_CLEAR_MAX_ITEMS).optional(),
  revision: z.number().int().min(1),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict().superRefine((record, context) => {
  const has = (scope: TarsClearScope) => record.scopes.includes(scope);
  if (has("conversation") !== (record.hiddenMessages !== undefined) || has("done") !== (record.done !== undefined) || has("outputs") !== (record.outputs !== undefined)
    || (record.inProgress !== undefined && !has("conversation")))
    // i18n-ignore: persisted-state integrity diagnostic, not user-facing copy
    context.addIssue({ code: "custom", message: "A clear records exactly what its scopes hid." });
});
export type TarsClearRecord = z.infer<typeof TarsClearRecordSchema>;

/** A saved record as current code reads it: a conversation clear from before `inProgress` keeps none. */
export function normalizeTarsClearRecord(record: TarsClearRecord): TarsClearRecord {
  return record.scopes.includes("conversation") && !record.inProgress ? { ...record, inProgress: [] } : record;
}

/** Ended work the tray leaves out, by responsibility id: cleared by the user or past the retention window. */
export const TarsTrayClearedSchema = z.object({
  // As unbounded as the responsibilities they name: retention keeps adding ended work over the years.
  done: z.array(IdSchema),
  outputs: z.array(IdSchema),
}).strict();
export type TarsTrayCleared = z.infer<typeof TarsTrayClearedSchema>;
export const TARS_NOTHING_CLEARED: TarsTrayCleared = Object.freeze({ done: [], outputs: [] }) as TarsTrayCleared;

/** What the conversation view knows about clearing: the retention choice and the active conversation clear, if any. */
export const TarsConversationViewSchema = z.object({
  retentionDays: TarsRetentionDaysSchema,
  clearedAt: TimestampSchema.nullable(),
  /** The clear that set `clearedAt`, for its Restore. */
  clearRequestId: IdSchema.nullable(),
}).strict();
export type TarsConversationView = z.infer<typeof TarsConversationViewSchema>;

type TrayRow = Pick<TarsResponsibility, "id" | "state" | "updatedAt" | "publication">;

/**
 * Ended work that must stay in the tray: a draft pull request still on its
 * way (committing, pushed, or failed and waiting for a retry), or one Tars
 * proposed that waits for the user's confirmation (`openPublish`).
 */
export function isTarsTrayPinned(row: TrayRow, openPublish: ReadonlySet<string>) {
  return openPublish.has(row.id) || (row.publication !== undefined && row.publication.state !== "opened");
}

/** Whether ended work has been out of the tray's retention window: last changed more than `days` ago. */
export function isTarsRetentionExpired(row: Pick<TarsResponsibility, "updatedAt">, days: number, now: string) {
  return days > 0 && Date.parse(row.updatedAt) <= Date.parse(now) - days * 86_400_000;
}

/**
 * The ended work the tray leaves out, per scope: archived by a clear or past
 * the retention window, unless pinned. Work that has not ended is never left
 * out, whatever was archived for it.
 */
export function tarsTrayCleared(args: {
  responsibilities: readonly TrayRow[];
  archived: { done: ReadonlySet<string>; outputs: ReadonlySet<string> };
  retentionDays: number;
  openPublish: ReadonlySet<string>;
  now: string;
}): TarsTrayCleared {
  const done: string[] = [];
  const outputs: string[] = [];
  for (const row of args.responsibilities) {
    if (!isTarsResponsibilityTerminal(row) || isTarsTrayPinned(row, args.openPublish)) continue;
    const expired = isTarsRetentionExpired(row, args.retentionDays, args.now);
    if (expired || args.archived.done.has(row.id)) done.push(row.id);
    if (expired || args.archived.outputs.has(row.id)) outputs.push(row.id);
  }
  return { done, outputs };
}

/** What a clear of `scope` would hide now: ended, unpinned work the tray still shows. */
export function tarsClearableIds(scope: "done" | "outputs", args: Parameters<typeof tarsTrayCleared>[0]): string[] {
  const hidden = new Set(tarsTrayCleared(args)[scope]);
  return args.responsibilities.filter((row) => isTarsResponsibilityTerminal(row) && !isTarsTrayPinned(row, args.openPublish) && !hidden.has(row.id))
    .map((row) => row.id).slice(0, TARS_CLEAR_MAX_ITEMS);
}
