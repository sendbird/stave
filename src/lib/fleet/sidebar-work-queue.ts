import { i18n } from "@/i18n/runtime";
import {
  classifyWorkQueueLane,
  WORK_QUEUE_LANE_ORDER,
  type WorkQueueLane,
  type WorkQueueSignals,
} from "./work-attention-order";

/**
 * Sidebar work queue: the lane model behind the left sidebar's `Work queue`
 * view.
 *
 * used by: `src/components/layout/RepositoryWorkspaceSidebar.tsx` (Work queue
 * view), `tests/fleet-sidebar-work-queue.test.ts`.
 *
 * The sidebar's other view, the project tree, sorts workspaces by where they
 * live and so cannot say why one deserves attention before another — a stalled
 * agent and a workspace you merely visited yesterday look the same. Lanes name
 * the reason. The lanes and the order inside them are the shared rule in
 * `work-attention-order.ts`, which the Fleet board and the Agents surface use
 * too; this module only adds the lane labels and the grouping. It is pure: it
 * takes per-workspace signals that the sidebar already computes and returns
 * grouped entries, so it adds no store subscription, no persistence, and no IPC.
 */
export type SidebarWorkQueueLane = WorkQueueLane;

/** Fixed display order; also the classification priority order. */
export const SIDEBAR_WORK_QUEUE_LANE_ORDER = WORK_QUEUE_LANE_ORDER;

/**
 * The last lane is `idle`, not `done`. Lanes are derived from attention items
 * and task runtime state only — a merged PR and a workspace nobody has touched
 * are both "no pending work" and are indistinguishable here without
 * subscribing this section to PR status. "Idle" is true for both; "Done" would
 * be a claim the data does not support.
 */
export const SIDEBAR_WORK_QUEUE_LANE_LABEL: Record<
  SidebarWorkQueueLane,
  string
> = {
  get "action-required"() { return i18n.t("fleet:sidebarWorkQueue.actionRequired"); },
  get "in-progress"() { return i18n.t("fleet:sidebarWorkQueue.inProgress"); },
  get "in-review"() { return i18n.t("fleet:sidebarWorkQueue.inReview"); },
  get idle() { return i18n.t("fleet:sidebarWorkQueue.idle"); },
};

/** Per-workspace inputs; see `WorkQueueSignals`. */
export type SidebarWorkQueueSignals = WorkQueueSignals;

/** See `classifyWorkQueueLane` for the lane priority. */
export const classifySidebarWorkQueueLane = classifyWorkQueueLane;

export interface SidebarWorkQueueGroup<T> {
  lane: SidebarWorkQueueLane;
  label: string;
  entries: T[];
}

/**
 * Groups already-ranked entries into lanes.
 *
 * Entry selection and ranking stay upstream in `buildSidebarWorkQueueEntries` —
 * this only adds the lane axis, so the two concerns can be tested and changed
 * independently. Input order is preserved inside each lane (callers pass a
 * ranked list), a workspace can appear in exactly one lane, and empty lanes are
 * dropped so the sidebar never renders a bare header.
 */
export function buildSidebarWorkQueueLanes<T extends { workspaceId: string }>(args: {
  entries: readonly T[];
  signalsByWorkspaceId: Record<string, SidebarWorkQueueSignals | undefined>;
}): SidebarWorkQueueGroup<T>[] {
  const entriesByLane = new Map<SidebarWorkQueueLane, T[]>();
  const seen = new Set<string>();

  for (const entry of args.entries) {
    if (seen.has(entry.workspaceId)) {
      continue;
    }
    seen.add(entry.workspaceId);
    const lane = classifySidebarWorkQueueLane(
      args.signalsByWorkspaceId[entry.workspaceId] ?? {},
    );
    const bucket = entriesByLane.get(lane);
    if (bucket) {
      bucket.push(entry);
    } else {
      entriesByLane.set(lane, [entry]);
    }
  }

  return SIDEBAR_WORK_QUEUE_LANE_ORDER.flatMap((lane) => {
    const entries = entriesByLane.get(lane);
    if (!entries?.length) {
      return [];
    }
    return [{ lane, label: SIDEBAR_WORK_QUEUE_LANE_LABEL[lane], entries }];
  });
}

/**
 * The Work queue's sections: the four lanes, then two shelves for workspaces
 * the user (or an automatic rule) set aside. Shelved workspaces still exist
 * exactly as before; see `workspace-settlement.ts`.
 */
export type SidebarWorkQueueSection = SidebarWorkQueueLane | "snoozed" | "settled";

export const SIDEBAR_WORK_QUEUE_SECTION_LABEL: Record<
  "snoozed" | "settled",
  string
> = {
  get snoozed() { return i18n.t("fleet:sidebarWorkQueue.snoozed"); },
  get settled() { return i18n.t("fleet:sidebarWorkQueue.settled"); },
};

/**
 * Sections that start folded: running agents need nothing from the user (the
 * lane count still shows them), and the shelves exist to be out of the way.
 */
export const SIDEBAR_WORK_QUEUE_SECTIONS_COLLAPSED_BY_DEFAULT: ReadonlySet<SidebarWorkQueueSection> =
  new Set<SidebarWorkQueueSection>(["in-progress", "snoozed", "settled"]);

export interface SidebarWorkQueueSectionGroup<T> {
  section: SidebarWorkQueueSection;
  label: string;
  entries: T[];
}

/**
 * Moves shelved entries out of their lanes. A shelved entry keeps its rank
 * order; snoozed entries sort by when they return, settled ones by newest
 * first.
 */
export function buildSidebarWorkQueueSections<T extends { workspaceId: string }>(args: {
  groups: readonly SidebarWorkQueueGroup<T>[];
  shelfOf: (entry: T) => { section: "snoozed" | "settled"; at: string } | null;
}): SidebarWorkQueueSectionGroup<T>[] {
  const snoozed: Array<{ entry: T; at: string }> = [];
  const settled: Array<{ entry: T; at: string }> = [];
  const sections: SidebarWorkQueueSectionGroup<T>[] = [];
  for (const group of args.groups) {
    const kept: T[] = [];
    for (const entry of group.entries) {
      const shelf = args.shelfOf(entry);
      if (shelf?.section === "snoozed") snoozed.push({ entry, at: shelf.at });
      else if (shelf?.section === "settled") settled.push({ entry, at: shelf.at });
      else kept.push(entry);
    }
    if (kept.length > 0) sections.push({ section: group.lane, label: group.label, entries: kept });
  }
  if (snoozed.length > 0) {
    snoozed.sort((left, right) => left.at.localeCompare(right.at));
    sections.push({
      section: "snoozed",
      label: SIDEBAR_WORK_QUEUE_SECTION_LABEL.snoozed,
      entries: snoozed.map((item) => item.entry),
    });
  }
  if (settled.length > 0) {
    settled.sort((left, right) => right.at.localeCompare(left.at));
    sections.push({
      section: "settled",
      label: SIDEBAR_WORK_QUEUE_SECTION_LABEL.settled,
      entries: settled.map((item) => item.entry),
    });
  }
  return sections;
}
