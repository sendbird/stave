import { Button } from "@/components/ui";
import { Checkbox } from "@/components/aui/components/Checkbox";
import { sx } from "@/components/aui/utils/stylex";
import { formatResourceBytes } from "@/lib/performance/resource-manager";
import type { SubAgentWorktreeRemoveResult, SubAgentWorktreeRow, WorkspaceCleanupApi } from "@/lib/workspace-cleanup-contract";
import { useTranslation } from "@/i18n";
import { cleanupStyles as styles } from "./workspace-cleanup-center.styles";
import { workspaceCleanupReasonText } from "./workspace-cleanup-reasons";

/**
 * The cleanup dialog's "Left by sub-agents" section: worktrees Claude Code
 * sub-agents left under `<project>/.claude/worktrees`. Rows are selected here
 * and removed only through the dialog's confirmation; the host checks each
 * one again first, never forces the removal and keeps the branch.
 */
export const subAgentRowKey = (row: Pick<SubAgentWorktreeRow, "repositoryPath" | "path">) => `${row.repositoryPath}\n${row.path}`;
export const subAgentRowReady = (row: SubAgentWorktreeRow) => row.blockers.length === 0;
export const subAgentRowMatches = (row: SubAgentWorktreeRow, query: string) =>
  `${row.name} ${row.branch ?? ""} ${row.path} ${row.repositoryName}`.toLowerCase().includes(query.toLowerCase());

export interface SubAgentRemoval extends SubAgentWorktreeRemoveResult { name: string }

/** Removes the confirmed worktrees one at a time; one refusal does not stop the rest. */
export async function removeSubAgentWorktrees(api: WorkspaceCleanupApi | undefined, rows: readonly SubAgentWorktreeRow[]): Promise<SubAgentRemoval[]> {
  const results: SubAgentRemoval[] = [];
  for (const row of rows) {
    let result: SubAgentWorktreeRemoveResult;
    try {
      if (!api?.removeSubAgentWorktree) throw new Error();
      result = await api.removeSubAgentWorktree({ repositoryPath: row.repositoryPath, path: row.path });
    } catch { result = { ok: false, path: row.path, reason: "unavailable" }; }
    results.push({ ...result, name: row.name });
  }
  return results;
}

export function SubAgentWorktreeSection(props: { rows: readonly SubAgentWorktreeRow[]; selected: ReadonlySet<string>; busy: boolean; onToggle: (row: SubAgentWorktreeRow) => void }) {
  const { t } = useTranslation(["workspace"]);
  if (props.rows.length === 0) return null;
  return <section aria-label={t("cleanupCenter.subAgents.title")} data-cleanup-subagents="">
    <div className={sx(styles.heading)}>
      {t("cleanupCenter.subAgents.title")}
      <p className={sx(styles.muted, styles.headingNote)}>{t("cleanupCenter.subAgents.description")}</p>
    </div>
    {props.rows.map((row) => {
      const key = subAgentRowKey(row);
      const blocked = !subAgentRowReady(row);
      const checked = props.selected.has(key);
      const reasonId = `cleanup-subagent-reason-${encodeURIComponent(key)}`;
      const reasonLine = blocked ? row.blockers.map(workspaceCleanupReasonText).join(" · ") : t("cleanupDialog.row.ready");
      const identity = <>
        <span className={sx(styles.truncate)}>{row.name} · {row.repositoryName}</span>
        <span className={sx(styles.muted, styles.truncate)}>{row.branch ?? t("cleanupCenter.subAgents.detached")} · {row.path}</span>
        <span className={sx(styles.muted)}>{reasonLine}</span>
      </>;
      return <div key={key} className={sx(styles.row, checked && styles.selected)} data-testid={`cleanup-subagent-row-${row.name}`}>
        <Checkbox controlOnly xstyle={styles.checkbox} aria-label={t("cleanupDialog.row.select", { name: row.name })} aria-describedby={blocked ? reasonId : undefined}
          checked={checked} disabled={props.busy || blocked} onCheckedChange={() => props.onToggle(row)} />
        {blocked
          ? <div className={sx(styles.identity, styles.identityStatic)}>{identity}<span id={reasonId} className={sx(styles.srOnly)}>{t("cleanupDialog.row.blocked", { reasons: reasonLine })}</span></div>
          : <Button variant="ghost" layout="host" xstyle={styles.identity} onClick={() => props.onToggle(row)} aria-pressed={checked}>{identity}</Button>}
        <span className={sx(styles.size)}>{row.bytes === null ? t("cleanupDialog.row.notScanned") : formatResourceBytes(row.bytes)}</span>
      </div>;
    })}
  </section>;
}

/** One line per confirmed worktree: removed with its branch kept, or why it was kept. */
export function SubAgentRemovalResults(props: { results: readonly SubAgentRemoval[] }) {
  const { t } = useTranslation(["workspace"]);
  if (props.results.length === 0) return null;
  return <div className={sx(styles.recent)} data-cleanup-subagent-results="">
    {props.results.map((result) => <p key={result.path} className={sx(styles.status)}>
      {result.name} · {result.ok ? t("cleanupCenter.subAgents.removed") : workspaceCleanupReasonText(result.reason ?? "unavailable")}
    </p>)}
  </div>;
}
