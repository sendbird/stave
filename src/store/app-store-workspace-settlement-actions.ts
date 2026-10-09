import type { StoreApi } from "zustand";
import {
  settleWorkspaceRecord,
  snoozeWorkspaceRecord,
  unsettleWorkspaceRecord,
  type WorkspaceSettlementRecord,
} from "@/lib/fleet/workspace-settlement";
import type { AppState } from "@/store/app-store.types";

type WorkspaceSettlementActionKey =
  | "settleWorkspaces"
  | "unsettleWorkspace"
  | "snoozeWorkspace"
  | "setWorkspaceAutoSettle"
  | "restoreWorkspaceSettlements";

type WorkspaceSettlementActions = Pick<AppState, WorkspaceSettlementActionKey>;
type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

/**
 * Work queue settling. These only edit `workspaceSettlementById`; nothing here
 * touches a workspace's worktree, branch, tasks or conversation.
 */
export function createWorkspaceSettlementActions(args: {
  set: StoreSet;
  get: StoreGet;
}): WorkspaceSettlementActions {
  const { set, get } = args;

  function update(
    workspaceId: string,
    change: (record: WorkspaceSettlementRecord | undefined) => WorkspaceSettlementRecord | undefined,
  ) {
    const previous = get().workspaceSettlementById[workspaceId];
    set((state) => {
      const next = { ...state.workspaceSettlementById };
      const record = change(next[workspaceId]);
      if (record && Object.keys(record).length > 0) {
        next[workspaceId] = record;
      } else {
        delete next[workspaceId];
      }
      return { workspaceSettlementById: next };
    });
    return previous;
  }

  return {
    settleWorkspaces: ({ settlements }) => {
      const at = new Date().toISOString();
      const previous: Record<string, WorkspaceSettlementRecord | undefined> = {};
      const current = get().workspaceSettlementById;
      for (const { workspaceId } of settlements) previous[workspaceId] = current[workspaceId];
      if (settlements.length === 0) return previous;
      set((state) => {
        const next = { ...state.workspaceSettlementById };
        for (const { workspaceId, reason } of settlements) {
          next[workspaceId] = settleWorkspaceRecord(next[workspaceId], reason, at);
        }
        return { workspaceSettlementById: next };
      });
      return previous;
    },
    unsettleWorkspace: ({ workspaceId }) =>
      update(workspaceId, (record) => unsettleWorkspaceRecord(record, new Date().toISOString())),
    snoozeWorkspace: ({ workspaceId, until }) =>
      update(workspaceId, (record) => snoozeWorkspaceRecord(record, until, new Date().toISOString())),
    setWorkspaceAutoSettle: ({ workspaceId, enabled }) => {
      update(workspaceId, (record) => {
        const { autoSettleDisabled: _disabled, ...rest } = record ?? {};
        return enabled ? rest : { ...rest, autoSettleDisabled: true };
      });
    },
    restoreWorkspaceSettlements: ({ records }) => {
      const at = new Date().toISOString();
      set((state) => {
        const next = { ...state.workspaceSettlementById };
        for (const [workspaceId, record] of Object.entries(records)) {
          // Keep the newest message stamp: an undo restores the settle state,
          // not the past.
          const lastMessageAt = next[workspaceId]?.lastMessageAt;
          const restored = record ? { ...record } : {};
          if (lastMessageAt && (!restored.lastMessageAt || restored.lastMessageAt < lastMessageAt)) {
            restored.lastMessageAt = lastMessageAt;
          }
          // Undoing back into the queue counts as bringing it back, so an
          // automatic rule cannot settle it again the moment the undo lands.
          if (!restored.settledAt && !restored.snoozedUntil) {
            restored.unsettledAt = at;
          }
          if (Object.keys(restored).length > 0) {
            next[workspaceId] = restored;
          } else {
            delete next[workspaceId];
          }
        }
        return { workspaceSettlementById: next };
      });
    },
  };
}
