/**
 * Editing a playbook's start conditions: each one is stamped with when it was
 * turned on, so only what happens afterwards proposes a mission, and a
 * playbook with no condition left carries no `startsWhen` at all.
 */
import { SCHEDULE_LABELS, type Schedule } from "@/lib/schedules";
import type { Playbook, PlaybookStartsWhen } from "./schema";

export type StartsWhenPatch = {
  issueAssigned?: { filter: string } | null;
  pullRequest?: { checksFailed: boolean; changesRequested: boolean } | null;
  schedule?: { schedule: Schedule; workspaceId: string; workspaceName: string } | null;
  autoStart?: boolean;
};

export function applyStartsWhen(playbook: Playbook, patch: StartsWhenPatch, now: Date): Playbook {
  const current = playbook.startsWhen ?? {};
  const next: PlaybookStartsWhen = { ...current };
  const stamp = now.toISOString();

  if (patch.issueAssigned === null) delete next.issueAssigned;
  else if (patch.issueAssigned) {
    const filter = patch.issueAssigned.filter.slice(0, 80);
    // A new filter starts counting from now, so issues it newly matches are not all news.
    const since = current.issueAssigned && current.issueAssigned.filter === filter ? current.issueAssigned.since : stamp;
    next.issueAssigned = { filter, since };
  }

  if (patch.pullRequest === null) delete next.pullRequest;
  else if (patch.pullRequest) {
    const { checksFailed, changesRequested } = patch.pullRequest;
    if (checksFailed || changesRequested) next.pullRequest = { checksFailed, changesRequested };
    else delete next.pullRequest;
  }

  if (patch.schedule === null || patch.schedule?.schedule === "off") delete next.schedule;
  else if (patch.schedule) {
    const unchanged =
      current.schedule?.schedule === patch.schedule.schedule && current.schedule.workspaceId === patch.schedule.workspaceId;
    // A new schedule or workspace starts counting from now, never from a slot already past.
    next.schedule = { ...patch.schedule, since: unchanged ? current.schedule!.since : stamp };
  }

  if (patch.autoStart !== undefined) next.autoStart = patch.autoStart;
  const { startsWhen: _previous, ...rest } = playbook;
  const watching = Boolean(next.issueAssigned || next.pullRequest || next.schedule);
  if (!watching) return rest;
  // Auto-start means nothing without a condition it can start from.
  if (!next.pullRequest && !next.schedule) delete next.autoStart;
  return { ...rest, startsWhen: next };
}

/**
 * Whether turning on a schedule also turns on auto-start: only when it can
 * safely start and pull requests are not watched, since the flag is shared
 * and theirs was already chosen.
 */
export function newScheduleStartsOnItsOwn(startsWhen: PlaybookStartsWhen | undefined, canAutoStart: boolean): boolean {
  return canAutoStart && !startsWhen?.schedule && !startsWhen?.pullRequest;
}

/**
 * What the playbooks watch, for an empty Proposed list: "2 playbooks — assigned
 * issues, a schedule", or null when none has a start condition.
 */
export function summarizeWatching(playbooks: readonly Pick<Playbook, "startsWhen">[]): string | null {
  const watching = playbooks.filter((playbook) => describeStartsWhen(playbook.startsWhen) !== null);
  if (watching.length === 0) return null;
  const count = (predicate: (startsWhen: PlaybookStartsWhen) => boolean) =>
    watching.filter((playbook) => predicate(playbook.startsWhen!)).length;
  const schedules = count((startsWhen) => Boolean(startsWhen.schedule));
  const conditions = [
    count((startsWhen) => Boolean(startsWhen.issueAssigned)) > 0 ? "assigned issues" : null,
    count((startsWhen) => Boolean(startsWhen.pullRequest)) > 0 ? "pull requests in the open repository" : null,
    schedules > 1 ? `${schedules} schedules` : schedules === 1 ? "a schedule" : null,
  ].filter(Boolean);
  return `${watching.length} ${watching.length === 1 ? "playbook" : "playbooks"} — ${conditions.join(", ")}`;
}

/** "Assigned issues · PR checks fail · Weekdays at 09:00", or null when nothing is watched. */
export function describeStartsWhen(startsWhen: PlaybookStartsWhen | undefined): string | null {
  if (!startsWhen) return null;
  const pr = startsWhen.pullRequest;
  const parts = [
    startsWhen.issueAssigned
      ? startsWhen.issueAssigned.filter
        ? `Issues matching “${startsWhen.issueAssigned.filter}”`
        : "Assigned issues"
      : null,
    pr
      ? pr.checksFailed && pr.changesRequested
        ? "PR checks fail or changes requested"
        : pr.checksFailed
          ? "PR checks fail"
          : "PR changes requested"
      : null,
    startsWhen.schedule ? SCHEDULE_LABELS[startsWhen.schedule.schedule] : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
