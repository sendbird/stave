import {
  TARS_DEFAULT_RETENTION_DAYS, TarsClearRecordSchema, TarsViewSettingsSchema, normalizeTarsClearScopes, parseTarsClearProposalRequestId, tarsClearableIds, tarsTrayCleared,
  type TarsClearInput, type TarsClearRecord, type TarsTrayCleared, type TarsViewSettings,
} from "@/lib/tars/clearing";
import { filterTarsConversationView, tarsClearKeeps } from "@/lib/tars/clear-view";
import type { TarsConversation } from "@/lib/tars/conversation";
import { projectTarsDecisions } from "@/lib/tars/decisions";
import type { TarsSnapshot } from "@/lib/tars/types";

interface PreviewViewState {
  settings: TarsViewSettings;
  clears: TarsClearRecord[];
  archived: Array<{ scope: "done" | "outputs"; responsibilityId: string; requestId: string }>;
}

/**
 * The host's clear path against the preview's saved state: the same eligibility
 * (`tarsClearableIds`), the same view filter and the same record shapes, kept in
 * session storage so a reload behaves like a restart. Retention is judged at
 * the fixtures' clock, so the gallery's ended work does not age out between runs.
 */
export function createPreviewClearBridge(args: {
  storageKey: string;
  /** The fixtures' clock: retention and new records are dated from it. */
  now: string;
  retentionDays?: number;
  getSnapshot: () => TarsSnapshot;
  getConversation: () => TarsConversation;
  /** Called after each write so the preview announces the change, as the host does. */
  changed: () => void;
}) {
  const saved = JSON.parse(sessionStorage.getItem(args.storageKey) ?? "null") as PreviewViewState | null;
  const state: PreviewViewState = saved ?? { settings: TarsViewSettingsSchema.parse({ retentionDays: args.retentionDays ?? TARS_DEFAULT_RETENTION_DAYS }), clears: [], archived: [] };
  const save = () => sessionStorage.setItem(args.storageKey, JSON.stringify(state));
  const openPublish = () => new Set(args.getConversation().receipts.filter((receipt) => receipt.action.kind === "publish" && receipt.status === "proposed")
    .flatMap((receipt) => receipt.action.kind === "publish" ? [receipt.action.responsibilityId] : []));
  const archived = () => ({
    done: new Set(state.archived.filter((entry) => entry.scope === "done").map((entry) => entry.responsibilityId)),
    outputs: new Set(state.archived.filter((entry) => entry.scope === "outputs").map((entry) => entry.responsibilityId)),
  });
  const tray = () => ({ responsibilities: args.getSnapshot().responsibilities, archived: archived(), retentionDays: state.settings.retentionDays, openPublish: openPublish(), now: args.now });
  /** One second after everything already saved, as the host's clock would be. */
  const nextAt = () => {
    const conversation = args.getConversation();
    const times = [args.now, ...conversation.messages.map((entry) => entry.createdAt), ...conversation.records.map((entry) => entry.createdAt),
      ...conversation.activity.map((entry) => entry.createdAt), ...(conversation.publications ?? []).map((entry) => entry.createdAt),
      ...(conversation.events ?? []).map((entry) => entry.processedAt ?? entry.createdAt), ...state.clears.map((entry) => entry.updatedAt)];
    return new Date(Math.max(...times.map((time) => Date.parse(time))) + 1_000).toISOString();
  };
  const active = () => [...state.clears].reverse().find((record) => record.status === "applied" && record.scopes.includes("conversation")) ?? null;
  const keeps = (conversation: TarsConversation) => tarsClearKeeps({ receipts: conversation.receipts, decisions: projectTarsDecisions({ messages: conversation.messages,
    receipts: conversation.receipts, records: conversation.records, answers: conversation.answers ?? [], activity: conversation.activity,
    responsibilities: args.getSnapshot().responsibilities }) });
  return {
    cleared(): TarsTrayCleared { return tarsTrayCleared(tray()); },
    /** The conversation as the host would return it: clears, the view state and the conversation clear's filter. */
    view(conversation: TarsConversation): TarsConversation {
      const current = active();
      const withView: TarsConversation = { ...conversation, clears: state.clears.filter((record) => !current || record.createdAt >= current.createdAt).map((record) => structuredClone(record)),
        view: { retentionDays: state.settings.retentionDays, clearedAt: current?.createdAt ?? null, clearRequestId: current?.requestId ?? null } };
      return current ? filterTarsConversationView(withView, { clearedAt: current.createdAt, keeps: keeps(conversation) }) : withView;
    },
    async clear(input: TarsClearInput): Promise<TarsClearRecord> {
      const existing = state.clears.find((record) => record.requestId === input.requestId);
      if (existing) return structuredClone(existing);
      const scopes = normalizeTarsClearScopes(input.scopes);
      const proposal = parseTarsClearProposalRequestId(input.requestId);
      const conversation = args.getConversation();
      const at = nextAt();
      const previous = active()?.createdAt ?? null;
      const kept = keeps(conversation).messageIds;
      const hidden = conversation.messages.filter((message) => message.state !== "queued" && message.state !== "reasoning" && !kept.has(message.id)
        && (!previous || message.createdAt > previous)).length;
      const ids = (scope: "done" | "outputs") => scopes.includes(scope) ? tarsClearableIds(scope, tray()) : undefined;
      const done = ids("done");
      const outputs = ids("outputs");
      const record = TarsClearRecordSchema.parse({ requestId: input.requestId, source: input.source, scopes, proposal, status: "applied",
        ...(scopes.includes("conversation") ? { hiddenMessages: hidden } : {}), ...(done ? { done } : {}), ...(outputs ? { outputs } : {}),
        revision: 1, createdAt: at, updatedAt: at });
      for (const id of done ?? []) state.archived.push({ scope: "done", responsibilityId: id, requestId: record.requestId });
      for (const id of outputs ?? []) state.archived.push({ scope: "outputs", responsibilityId: id, requestId: record.requestId });
      state.clears.push(record);
      // A confirmed proposal settles with its clear, as the host does in one transaction.
      const receipt = proposal ? conversation.receipts.find((entry) => entry.messageId === proposal.messageId && entry.actionIndex === proposal.actionIndex) : undefined;
      if (receipt?.status === "proposed") Object.assign(receipt, { status: "applied", revision: receipt.revision + 1 });
      save(); args.changed();
      return structuredClone(record);
    },
    async undoClear({ requestId }: { requestId: string }): Promise<TarsClearRecord> {
      const record = state.clears.find((entry) => entry.requestId === requestId);
      if (!record) throw new Error("The clear was not found.");
      if (record.status === "applied") {
        Object.assign(record, { status: "undone", revision: record.revision + 1, updatedAt: nextAt() });
        state.archived = state.archived.filter((entry) => entry.requestId !== requestId);
        save(); args.changed();
      }
      return structuredClone(record);
    },
    async configureView(input: TarsViewSettings): Promise<TarsViewSettings> {
      state.settings = TarsViewSettingsSchema.parse(input);
      save(); args.changed();
      return structuredClone(state.settings);
    },
  };
}
