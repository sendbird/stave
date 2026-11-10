import type { SqliteStore } from "../persistence/sqlite-store";
import {
  TARS_USAGE_MAX_REPLIES, TARS_USAGE_MAX_TURNS, TARS_USAGE_MAX_WORKS, aggregateTarsUsage, type TarsUsageInput, type TarsUsageReport,
} from "../../src/lib/tars/usage";

interface UsagePorts {
  tars: Pick<SqliteStore["tars"], "snapshot">;
  usageStatistics: Pick<SqliteStore["usageStatistics"], "readTaskTurns">;
  tarsConversations: Pick<SqliteStore["tarsConversations"], "answeredTimes">;
}

/**
 * What Tars's work spent in the asked period, read on demand (`tars:get-usage`).
 * Only work that has a task can have turns; the most recently changed
 * `TARS_USAGE_MAX_WORKS` are read and the rest counted. Each work's turns are
 * those of its own task in its execution workspace: the turns its run took and
 * any the user took there. Reading changes nothing.
 */
export function readTarsUsageReport(store: UsagePorts, period: TarsUsageInput, generatedAt: string): TarsUsageReport {
  const withTask = store.tars.snapshot().responsibilities.filter((row) => row.taskId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  const works = withTask.slice(0, TARS_USAGE_MAX_WORKS);
  const { turns, truncated } = store.usageStatistics.readTaskTurns({
    tasks: works.map((row) => ({ key: row.id, workspaceId: row.executionWorkspaceId ?? row.workspaceId, taskId: row.taskId! })),
    from: period.thirtyDaysStart, until: period.until, limit: TARS_USAGE_MAX_TURNS,
  });
  let replies: string[] | null = null;
  // The reply count is a side note: a conversation that cannot be read is reported as unread, never as zero, and does not hide the work's usage.
  try { replies = store.tarsConversations.answeredTimes({ from: period.thirtyDaysStart, until: period.until, limit: TARS_USAGE_MAX_REPLIES }); }
  catch { /* Reported as unread. */ }
  return aggregateTarsUsage({ period, works, replies, truncated, omittedWorks: withTask.length - works.length, generatedAt,
    turns: turns.map(({ key, ...turn }) => ({ responsibilityId: key, ...turn })) });
}
