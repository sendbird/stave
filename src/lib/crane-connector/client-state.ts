import { useSyncExternalStore } from "react";
import type {
  CraneConnectorPublicStatus,
  CraneDispatchApprovalRequest,
  CraneDispatchJobUpdate,
} from "./types";

interface CraneConnectorClientSnapshot {
  status: CraneConnectorPublicStatus | null;
  approval: CraneDispatchApprovalRequest | null;
  lastJobUpdate: CraneDispatchJobUpdate | null;
}

let snapshot: CraneConnectorClientSnapshot = {
  status: null,
  approval: null,
  lastJobUpdate: null,
};
const listeners = new Set<() => void>();

function publish(next: CraneConnectorClientSnapshot) {
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

export function setCraneConnectorClientStatus(
  status: CraneConnectorPublicStatus,
) {
  publish({ ...snapshot, status });
}

export function enqueueCraneDispatchApproval(
  approval: CraneDispatchApprovalRequest,
) {
  if (snapshot.approval?.job.id === approval.job.id) {
    return;
  }
  publish({ ...snapshot, approval });
}

export function applyCraneDispatchJobUpdate(
  update: CraneDispatchJobUpdate,
) {
  publish({
    ...snapshot,
    approval:
      snapshot.approval?.job.id === update.jobId &&
      ["declined", "running", "completed", "failed", "cancelled"].includes(
        update.state,
      )
        ? null
        : snapshot.approval,
    lastJobUpdate: update,
  });
}

export function dismissCraneDispatchApproval(jobId: string) {
  if (snapshot.approval?.job.id !== jobId) {
    return;
  }
  publish({ ...snapshot, approval: null });
}

export function getCraneConnectorClientSnapshot() {
  return snapshot;
}

export function useCraneConnectorClientState() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getCraneConnectorClientSnapshot,
    getCraneConnectorClientSnapshot,
  );
}
