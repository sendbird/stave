import { i18n, useTranslation } from "@/i18n";
import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import type { AgentRunDoneWhenLine, DoneWhenStatus } from "@/lib/agent-runs/agent-run-status";
import { describeWorkspaceCheckProgress, type WorkspaceCheckProgress } from "@/lib/agent-runs/workspace-check";
import { agentRunStyles as styles } from "./agent-runs.styles";

const PRESENTATION = {
  "met-verified": { icon: CircleCheck, mark: styles.toneDone, label: styles.toneDone },
  "met-reported": { icon: CircleCheck, mark: styles.toneDone, label: styles.muted },
  unmet: { icon: CircleX, mark: styles.toneAttention, label: styles.toneAttention },
  unverified: { icon: CircleDashed, mark: styles.toneIdle, label: styles.toneIdle },
} as const satisfies Record<DoneWhenStatus, unknown>;

/**
 * The Done when lines of an agent run with their status, then the checks Stave
 * itself saw succeed. Only a workspace check criterion reads as checked by Stave.
 */
export function AgentRunDoneWhen({ lines, staveChecks = [] }: {
  lines: readonly AgentRunDoneWhenLine[];
  staveChecks?: readonly string[];
}) {
  useTranslation();
  if (lines.length === 0 && staveChecks.length === 0) return null;
  return (
    <>
    <ul className={sx(styles.checkList)} aria-label={i18n.t("agentRuns:agentRunDoneWhen.ariaLabel")}>
      {lines.map((line) => {
        const presentation = PRESENTATION[line.status];
        const Icon = presentation.icon;
        return (
          <li key={line.text} className={sx(styles.check)}>
            <span className={sx(styles.checkMark)}>
              <Icon aria-hidden className={sx(styles.icon, presentation.mark)} />
            </span>
            <span className={sx(styles.checkText)}>
              {line.text}
              {line.checks ? <CriterionChecksNote checks={line.checks} /> : null}
            </span>
            <span className={sx(styles.checkState, presentation.label)}>{line.label}</span>
          </li>
        );
      })}
    </ul>
    {staveChecks.length > 0 ? (
      <p className={sx(styles.checkNote, styles.inline)} aria-label={i18n.t("agentRuns:agentRunDoneWhen.ariaLabel2")}>
        <CircleCheck aria-hidden className={sx(styles.iconSm, styles.toneDone)} />
        {i18n.t("agentRuns:agentRunDoneWhen.agentRunDoneWhen")} {staveChecks.join(" · ")}
      </p>
    ) : null}
    </>
  );
}

/**
 * Under a workspace check line: how many of its actions passed, and which, and
 * the rule that decides it. A check met by any one of them says so instead of
 * reading as "all checks passed"; one that needs every action says that.
 */
export function CriterionChecksNote({ checks }: { checks: WorkspaceCheckProgress }) {
  useTranslation();
  if (checks.total === 0) return null;
  const rule = checks.mode === "all" ? i18n.t("agentRuns:workspaceCheck.progressAllRequired") : i18n.t("agentRuns:workspaceCheck.progressAnyOne");
  return (
    <span className={sx(styles.checkDetail)}>
      {describeWorkspaceCheckProgress(checks)}
      {checks.total > 1 ? ` · ${rule}` : null}
    </span>
  );
}
