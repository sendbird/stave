import {
  ClearFleetAttentionSnoozesArgsSchema,
  FleetAttentionSnoozeSchema,
  SnoozeFleetAttentionArgsSchema,
  isFleetAttentionSnoozeActive,
  type ClearFleetAttentionSnoozesArgs,
  type FleetAttentionSnooze,
  type SnoozeFleetAttentionArgs,
} from "./attention-snooze";

const STORAGE_KEY = "stave:fleet-attention-snoozes:v1";
const listeners = new Set<() => void>();
let revision = 0;
let read: Promise<FleetAttentionSnooze[]> | null = null;

export const subscribeFleetAttentionSnoozes = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getFleetAttentionSnoozeRevision = () => revision;

export function invalidateFleetAttentionSnoozes() {
  revision += 1;
  read = null;
  for (const listener of listeners) listener();
}

/** Browser-only persistence. Desktop failures must never fall back to this. */
function fallbackRows(): FleetAttentionSnooze[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Saved Fleet snoozes could not be read.");
  }
  return parsed.map((row) => FleetAttentionSnoozeSchema.parse(row));
}

function writeFallbackRows(rows: FleetAttentionSnooze[]) {
  const nowMs = Date.now();
  const active = rows.filter((snooze) =>
    isFleetAttentionSnoozeActive({ snooze, nowMs }),
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
  return active;
}

export function listFleetAttentionSnoozes(): Promise<FleetAttentionSnooze[]> {
  const existing = read;
  if (existing) return existing;
  const pending = (async () => {
    const persistence = window.api?.persistence;
    if (persistence?.listFleetAttentionSnoozes) {
      const response = await persistence.listFleetAttentionSnoozes({
        now: new Date().toISOString(),
      });
      if (!response.ok) {
        throw new Error(
          "Could not load snoozed Fleet items. Retry to refresh the rail.",
        );
      }
      return response.snoozes;
    }
    if (persistence) {
      throw new Error(
        "Fleet snooze storage is unavailable. Restart Stave to load the updated bridge.",
      );
    }
    return writeFallbackRows(fallbackRows());
  })().finally(() => {
    if (read === pending) read = null;
  });
  read = pending;
  return pending;
}

export async function snoozeFleetAttention(input: SnoozeFleetAttentionArgs) {
  const args = SnoozeFleetAttentionArgsSchema.parse(input);
  const persistence = window.api?.persistence;
  if (persistence) {
    if (!persistence.snoozeFleetAttention) {
      throw new Error(
        "Fleet snooze storage is unavailable. Restart Stave to load the updated bridge.",
      );
    }
    const response = await persistence.snoozeFleetAttention(args);
    if (!response.ok || !response.snooze) {
      throw new Error("Snooze was not saved. Retry; the item is still listed.");
    }
    invalidateFleetAttentionSnoozes();
    return response.snooze;
  }
  const snooze: FleetAttentionSnooze = {
    ...args,
    createdAt: new Date().toISOString(),
  };
  // Persist before acknowledging; quota failure must stay observable.
  writeFallbackRows([
    ...fallbackRows().filter((row) => row.attentionId !== args.attentionId),
    snooze,
  ]);
  invalidateFleetAttentionSnoozes();
  return snooze;
}

export async function clearFleetAttentionSnoozes(
  input: ClearFleetAttentionSnoozesArgs = {},
) {
  const args = ClearFleetAttentionSnoozesArgsSchema.parse(input);
  const persistence = window.api?.persistence;
  if (persistence) {
    if (!persistence.clearFleetAttentionSnoozes) {
      throw new Error(
        "Fleet snooze storage is unavailable. Restart Stave to load the updated bridge.",
      );
    }
    const response = await persistence.clearFleetAttentionSnoozes(args);
    if (!response.ok) {
      throw new Error("Snoozed items were not restored. Retry.");
    }
    invalidateFleetAttentionSnoozes();
    return response.cleared;
  }
  const rows = fallbackRows();
  const attentionIds = args.attentionIds ? new Set(args.attentionIds) : null;
  const workspaceIds = args.workspaceIds ? new Set(args.workspaceIds) : null;
  const kept = rows.filter(
    (row) =>
      !(
        (!attentionIds || attentionIds.has(row.attentionId)) &&
        (!workspaceIds || workspaceIds.has(row.workspaceId))
      ),
  );
  writeFallbackRows(kept);
  invalidateFleetAttentionSnoozes();
  return rows.length - kept.length;
}
