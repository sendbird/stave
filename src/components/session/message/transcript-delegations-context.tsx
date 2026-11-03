import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAppStore } from "@/store/app.store";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { selectDelegatedTaskBlockedKinds, type DelegatedTaskBlockedKind } from "@/lib/runs/delegated-task-view";
import { useDelegatedTasks } from "../useDelegatedTasks";

const EMPTY = { children: [] as readonly DelegatedTaskSummary[], blocked: {} as Readonly<Record<string, DelegatedTaskBlockedKind>> };
const Context = createContext(EMPTY);
export const useTranscriptDelegations = () => useContext(Context);

/** One ledger subscription for the transcript, never one request per message. */
export function TranscriptDelegationsProvider({ taskId, children }: { taskId: string; children: ReactNode }) {
  const listing = useDelegatedTasks({ parentTaskId: taskId });
  const notifications = useAppStore((state) => state.notifications);
  const value = useMemo(() => ({
    children: listing.children,
    blocked: selectDelegatedTaskBlockedKinds({ children: listing.children, notifications }),
  }), [listing.children, notifications]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
