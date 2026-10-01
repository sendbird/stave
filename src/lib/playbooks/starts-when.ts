/**
 * What saved playbooks' start conditions watch. Their editor retired with the
 * Playbooks tab; conditions saved before keep proposing work in Issues →
 * Proposed until projects and playbooks are removed.
 */
import { SCHEDULE_LABELS } from "@/lib/schedules";
import type { Playbook, PlaybookStartsWhen } from "./schema";

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
function describeStartsWhen(startsWhen: PlaybookStartsWhen | undefined): string | null {
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
