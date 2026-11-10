import { createContext, useContext, useRef, useState } from "react";
import type { TarsActionRecord } from "@/lib/tars/conversation";
import { canUndoTarsAction, type TarsUndoActionRefusal } from "@/lib/tars/action-undo";
import type { TarsBridgeApi } from "@/lib/tars/types";

/** Optional injection for embedded records; normal conversation and side-view rows use the existing host bridge. */
export const TarsActionUndoContext = createContext<Pick<TarsBridgeApi, "undoAction"> | null>(null);

export function useTarsActionUndo(record: TarsActionRecord) {
  const injected = useContext(TarsActionUndoContext);
  const api = injected ?? (typeof window !== "undefined" ? window.api?.tars : undefined);
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<{ requestId: string; record?: TarsActionRecord; refusal?: TarsUndoActionRefusal | "failed" }>();
  const local = outcome?.requestId === record.requestId ? outcome : undefined;
  const current = local?.record && local.record.revision >= record.revision ? local.record : record;
  return {
    available: Boolean(api?.undoAction && canUndoTarsAction(current)),
    undone: Boolean(current.undo?.undoneAt), pending, refusal: current.undo?.undoneAt ? undefined : local?.refusal,
    undo: async () => {
      if (lock.current || !api?.undoAction || !canUndoTarsAction(current)) return;
      lock.current = true; setPending(true);
      try {
        const result = await api.undoAction({ requestId: current.requestId, expectedRevision: current.revision });
        setOutcome({ requestId: current.requestId, ...(result.record ? { record: result.record } : {}), ...(result.refusal ? { refusal: result.refusal } : {}) });
      } catch { setOutcome({ requestId: current.requestId, refusal: "failed" }); }
      finally { lock.current = false; setPending(false); }
    },
  };
}
