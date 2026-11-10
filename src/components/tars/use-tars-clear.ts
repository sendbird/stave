import { useCallback, useMemo, useRef, useState } from "react";
import { i18n } from "@/i18n";
import { normalizeTarsClearScopes, type TarsClearRecord, type TarsClearScope, type TarsClearSource } from "@/lib/tars/clearing";
import { projectTarsClearProposals, type TarsClearProposalView } from "@/lib/tars/clear-view";
import type { TarsConversation } from "@/lib/tars/conversation";
import type { TarsBridgeApi } from "@/lib/tars/types";
import type { TarsClearCounts } from "./TarsClear";

const NO_CLEARS: readonly TarsClearRecord[] = [];

/** What the conversation and the tray need to clear, show what was cleared and undo it. */
export interface TarsClearContext {
  available: boolean;
  /** A clear or an undo is being sent; nothing can be pressed twice. */
  busy: boolean;
  counts: TarsClearCounts;
  /** The active conversation clear's record, shown first with its Restore. */
  active: TarsClearRecord | null;
  /** Clears the timeline shows where they happened: buttons' clears and restored conversation clears. */
  records: readonly TarsClearRecord[];
  proposals: readonly TarsClearProposalView[];
  errors: ReadonlyMap<string, string>;
  declined: ReadonlySet<string>;
  /** The newest clear of a tray scope that still hides something, for the lane's Undo. */
  latest: (scope: "done" | "outputs") => TarsClearRecord | null;
  clear: (scopes: readonly TarsClearScope[], source: TarsClearSource, requestId?: string) => Promise<boolean>;
  undo: (requestId: string) => Promise<boolean>;
  decline: (requestId: string) => void;
}

/**
 * Clears through the host's one clear path. A button's retry keeps its request
 * id until it succeeds, so a lost reply clears once; a proposal's card always
 * confirms under the proposal's own id. Declining a card is view-only.
 */
export function useTarsClear(args: {
  bridge: TarsBridgeApi | undefined;
  conversation: TarsConversation | null;
  counts: TarsClearCounts;
  /** Reads the snapshot and the conversation again after a clear or an undo. */
  refresh: () => void;
  /** Says the outcome to screen readers. */
  announce?: (text: string) => void;
}): TarsClearContext {
  const { bridge, conversation, counts, refresh, announce } = args;
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [declined, setDeclined] = useState<ReadonlySet<string>>(new Set());
  const pending = useRef(new Map<string, string>());
  const clears = conversation?.clears ?? NO_CLEARS;
  const activeId = conversation?.view?.clearRequestId ?? null;
  const active = useMemo(() => clears.find((record) => record.requestId === activeId) ?? null, [activeId, clears]);
  const records = useMemo(() => clears.filter((record) => record.proposal === null && record.requestId !== activeId), [activeId, clears]);
  const proposals = useMemo(() => projectTarsClearProposals(conversation?.receipts ?? [], clears), [clears, conversation?.receipts]);
  const latest = useCallback((scope: "done" | "outputs") => [...clears].reverse()
    .find((record) => record.status === "applied" && (record[scope]?.length ?? 0) > 0) ?? null, [clears]);
  const setError = (key: string, message: string | null) => setErrors((current) => {
    const next = new Map(current);
    if (message) next.set(key, message); else next.delete(key);
    return next;
  });
  const clear = async (scopes: readonly TarsClearScope[], source: TarsClearSource, proposalId?: string) => {
    if (!bridge?.clear || busy) return false;
    const normalized = normalizeTarsClearScopes(scopes);
    const key = proposalId ?? normalized.join(",");
    const requestId = proposalId ?? pending.current.get(key) ?? `clear-click:${crypto.randomUUID()}`;
    pending.current.set(key, requestId);
    setBusy(true);
    try {
      const record = await bridge.clear({ requestId, scopes: normalized, source });
      pending.current.delete(key);
      setError(key, null);
      announce?.(i18n.t("shell:tars.clear.announce.cleared"));
      return record.status === "applied";
    } catch {
      setError(key, i18n.t("shell:tars.clear.failed"));
      return false;
    } finally { setBusy(false); refresh(); }
  };
  const undo = async (requestId: string) => {
    if (!bridge?.undoClear || busy) return false;
    setBusy(true);
    try {
      await bridge.undoClear({ requestId });
      setError(requestId, null);
      announce?.(i18n.t("shell:tars.clear.announce.restored"));
      return true;
    } catch {
      setError(requestId, i18n.t("shell:tars.clear.failed"));
      return false;
    } finally { setBusy(false); refresh(); }
  };
  const decline = (requestId: string) => setDeclined((current) => new Set(current).add(requestId));
  return { available: Boolean(bridge?.clear && bridge.undoClear), busy, counts, active, records, proposals, errors, declined, latest, clear, undo, decline };
}
