import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { i18n } from "@/i18n";
import type { TarsConversation } from "@/lib/tars/conversation";
import {
  projectTarsScheduleProposals, type TarsScheduleList, type TarsSchedulePreview, type TarsScheduleProposalView, type TarsScheduleRecord, type TarsScheduleRun,
  type TarsScheduleSource, type TarsScheduleView,
} from "@/lib/tars/schedules";
import type { TarsBridgeApi } from "@/lib/tars/types";

const NO_RECORDS: readonly TarsScheduleRecord[] = [];
const NO_RUNS: readonly TarsScheduleRun[] = [];

export type TarsSchedulePreviewState = "loading" | "ready" | "failed";

/** The list of schedules Tars created, as last read from the host. */
export interface TarsScheduleListState {
  state: "loading" | "ready" | "failed";
  value: TarsScheduleList | null;
  reload: () => void;
}

/** What the conversation and the schedules section need to show schedule cards, records, runs and the list. */
export interface TarsScheduleContext {
  proposals: readonly TarsScheduleProposalView[];
  /** Switches the user pressed in the list: records with no proposal, shown where they happened. */
  records: readonly TarsScheduleRecord[];
  /** Runs the schedules started, shown where they started. */
  runs: readonly TarsScheduleRun[];
  previewOf: (requestId: string) => { preview: TarsSchedulePreview | null; state: TarsSchedulePreviewState };
  retryPreview: (requestId: string) => void;
  /** The card or switch whose request is being sent; nothing can be pressed twice. */
  busyId: string | null;
  errors: ReadonlyMap<string, string>;
  declined: ReadonlySet<string>;
  onConfirm: (requestId: string, source: TarsScheduleSource, enable?: boolean) => void;
  onDecline: (requestId: string) => void;
  list: TarsScheduleListState;
  /** Turns a listed schedule on or off: the user's own click, recorded in the conversation. */
  onToggle: (schedule: TarsScheduleView, paused: boolean, source: TarsScheduleSource) => void;
  /** How often Tars asked to show the list (`{operation: "list"}`); the view opens the section when it grows. */
  listRequests: number;
}

/**
 * The schedules of the Tars view. The host reads what a card shows
 * (`previewSchedule`), applies a confirmation (`confirmSchedule`) or a switch
 * (`toggleSchedule`) through Stave's Schedules service, and lists the
 * schedules Tars created (`listSchedules`); this hook only keeps what is on
 * screen. Declining a card is view-only and never recorded.
 */
export function useTarsSchedules(args: {
  bridge: TarsBridgeApi | undefined;
  conversation: TarsConversation | null;
  /** Reads the conversation again after a confirmation or a switch. */
  refresh: () => void;
  focusComposer?: () => void;
}): { context: TarsScheduleContext; available: boolean } {
  const { bridge, conversation, refresh, focusComposer } = args;
  const available = Boolean(bridge?.previewSchedule && bridge.confirmSchedule && bridge.listSchedules);
  const [previews, setPreviews] = useState<ReadonlyMap<string, { preview: TarsSchedulePreview | null; state: TarsSchedulePreviewState }>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [declined, setDeclined] = useState<ReadonlySet<string>>(new Set());
  const [list, setList] = useState<{ state: TarsScheduleListState["state"]; value: TarsScheduleList | null }>({ state: "loading", value: null });
  const requested = useRef(new Set<string>());
  // A retried switch keeps its request id until it succeeds, so a lost reply switches once.
  const switches = useRef(new Map<string, string>());
  const all = conversation?.schedules ?? NO_RECORDS;
  const runs = conversation?.scheduleRuns ?? NO_RUNS;
  const receipts = conversation?.receipts;
  const proposals = useMemo(() => projectTarsScheduleProposals(receipts ?? [], all), [all, receipts]);
  const records = useMemo(() => all.filter((record) => record.proposal === null), [all]);
  const listRequests = useMemo(() => (receipts ?? []).filter((receipt) => receipt.status === "applied" && receipt.action.kind === "schedule" && receipt.action.operation === "list").length, [receipts]);
  const setError = (key: string, message: string | null) => setErrors((current) => {
    const next = new Map(current);
    if (message) next.set(key, message); else next.delete(key);
    return next;
  });

  // Each waiting card reads once what it would create or change.
  const waiting = useMemo(() => proposals.filter((view) => view.state === "waiting" && !declined.has(view.requestId)).map((view) => view.requestId), [declined, proposals]);
  const loadPreview = useCallback((requestId: string) => {
    if (!bridge?.previewSchedule) return;
    requested.current.add(requestId);
    setPreviews((current) => new Map(current).set(requestId, { preview: current.get(requestId)?.preview ?? null, state: "loading" }));
    void bridge.previewSchedule({ requestId })
      .then((preview) => setPreviews((current) => new Map(current).set(requestId, { preview, state: "ready" })))
      .catch(() => setPreviews((current) => new Map(current).set(requestId, { preview: null, state: "failed" })));
  }, [bridge]);
  useEffect(() => {
    for (const requestId of waiting) if (!requested.current.has(requestId)) loadPreview(requestId);
  }, [loadPreview, waiting]);
  const previewOf = useCallback((requestId: string) => previews.get(requestId)
    ?? { preview: null, state: bridge?.previewSchedule ? "loading" as const : "failed" as const }, [bridge, previews]);

  // The list is read when the view opens and again whenever a schedule record or a run changes.
  const listKey = `${all.map((record) => `${record.requestId}:${record.revision}`).join(",")}|${runs.map((run) => `${run.runId}:${run.status}`).join(",")}`;
  const reads = useRef(0);
  const reload = useCallback(() => {
    if (!bridge?.listSchedules) return;
    const read = ++reads.current;
    void bridge.listSchedules()
      // A slower, older read never replaces a newer one.
      .then((value) => { if (read === reads.current) setList({ state: "ready", value }); })
      .catch(() => { if (read === reads.current) setList((current) => ({ state: "failed", value: current.value })); });
  }, [bridge]);
  useEffect(() => { reload(); }, [listKey, reload]);

  const onDecline = useCallback((requestId: string) => {
    setDeclined((current) => new Set(current).add(requestId));
    focusComposer?.();
  }, [focusComposer]);
  const onConfirm = useCallback((requestId: string, source: TarsScheduleSource, enable?: boolean) => {
    if (!bridge?.confirmSchedule || busyId) return;
    setBusyId(requestId);
    void bridge.confirmSchedule({ requestId, source, ...(enable ? { enable: true } : {}) })
      .then(() => setError(requestId, null))
      .catch(() => setError(requestId, i18n.t("shell:tars.schedule.card.failed")))
      .finally(() => { setBusyId(null); refresh(); reload(); });
  }, [bridge, busyId, refresh, reload]);
  const onToggle = useCallback((schedule: TarsScheduleView, paused: boolean, source: TarsScheduleSource) => {
    if (!bridge?.toggleSchedule || busyId) return;
    const key = `${schedule.id}:${paused ? "pause" : "resume"}`;
    const requestId = switches.current.get(key) ?? `schedule-switch:${crypto.randomUUID()}`;
    switches.current.set(key, requestId);
    setBusyId(schedule.id);
    void bridge.toggleSchedule({ requestId, scheduleId: schedule.id, paused, source })
      .then(() => { switches.current.delete(key); setError(schedule.id, null); })
      .catch(() => setError(schedule.id, i18n.t("shell:tars.schedule.section.switchFailed")))
      .finally(() => { setBusyId(null); refresh(); reload(); });
  }, [bridge, busyId, refresh, reload]);

  const context: TarsScheduleContext = { proposals, records, runs, previewOf, retryPreview: loadPreview, busyId, errors, declined, onConfirm, onDecline,
    list: { ...list, reload }, onToggle, listRequests };
  return { context, available };
}
