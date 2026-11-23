import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/aui/utils/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { Button } from "@/components/ui";
import { useState } from "react";
import { useTranslation } from "@/i18n";
import {
  WORKSPACE_CREATION_STEPS,
  useWorkspaceCreationStore,
  type WorkspaceCreationProgress,
  type WorkspaceCreationStep,
} from "@/store/workspace-creation-progress";

export function WorkspaceCreationRowStatus({ workspaceId }: { workspaceId: string }) {
  const progress = useWorkspaceCreationStore((state) => state.byId[workspaceId]);
  const { t } = useTranslation(["workspace", "common"]);
  if (!progress) return null;
  const step = WORKSPACE_CREATION_STEPS.find((key) => progress.steps[key].status === "running")
    ?? WORKSPACE_CREATION_STEPS.find((key) => progress.steps[key].status === "failed")
    ?? WORKSPACE_CREATION_STEPS.find((key) => progress.steps[key].status === "waiting");
  if (!step) return null;
  const failed = progress.steps[step].status === "failed";
  const label = failed
    ? t("creationProgress.failedRow", { step: t(`creationProgress.steps.${step}`) })
    : t(`creationProgress.steps.${step}`);
  return <span role="status" title={label} className={sx(styles.row, failed && styles.failed)}>{label}</span>;
}

export function WorkspaceCreationPanel({ progress, showPrompt }: {
  progress: WorkspaceCreationProgress;
  showPrompt: boolean;
}) {
  const { t } = useTranslation(["workspace", "common"]);
  const [openLogs, setOpenLogs] = useState<WorkspaceCreationStep | null>(null);
  return (
    <section aria-label={t("creationProgress.title")} className={sx(styles.panel, showPrompt && styles.preview)}>
      <h2 className={sx(styles.title)}>{t("creationProgress.title")}</h2>
      <ol className={sx(styles.steps)} aria-live="polite">
        {WORKSPACE_CREATION_STEPS.map((key) => {
          const { status, detail, retry } = progress.steps[key];
          return (
            <li key={key} className={sx(styles.step)}>
              <div className={sx(styles.stepHeader)}>
                <span>{t(`creationProgress.steps.${key}`)}</span>
                <span className={sx(styles.status, status === "failed" && styles.failed)}>
                  {t(`creationProgress.status.${status}`)}
                </span>
                {status === "failed" && retry ? <Button size="sm" variant="outline" onClick={() => void retry()}>{t("common:actions.retry")}</Button> : null}
                {status === "failed" && detail ? (
                  <Button size="sm" variant="ghost" aria-expanded={openLogs === key} onClick={() => setOpenLogs(openLogs === key ? null : key)}>
                    {t(openLogs === key ? "creationProgress.hideLogs" : "creationProgress.openLogs")}
                  </Button>
                ) : null}
              </div>
              {status === "failed" && detail ? (
                openLogs === key
                  ? <pre className={sx(styles.log)}>{detail}</pre>
                  : <p className={sx(styles.reason)}>{detail.split("\n")[0]}</p>
              ) : null}
            </li>
          );
        })}
      </ol>
      {showPrompt && progress.prompt ? (
        <article className={sx(styles.step)}>
          <h3 className={sx(styles.title)}>{progress.taskTitle}</h3>
          <p className={sx(styles.prompt)}>{progress.prompt}</p>
        </article>
      ) : null}
    </section>
  );
}

const styles = stylex.create({
  row: { flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  failed: { color: vars["--aui-color-danger-text"] },
  panel: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], padding: vars["--aui-space-16"], borderBlockEnd: `1px solid ${vars["--aui-color-border"]}`, fontSize: vars["--aui-font-size-body"] },
  preview: { height: "100%", overflowY: "auto", borderBlockEnd: 0, boxSizing: "border-box" },
  title: { margin: 0, fontSize: vars["--aui-font-size-lead"], fontWeight: vars["--aui-font-weight-semibold"] },
  steps: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], margin: 0, padding: 0, listStyle: "none" },
  step: { display: "grid", gap: vars["--aui-space-4"], minWidth: 0 },
  stepHeader: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: vars["--aui-space-8"] },
  status: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  reason: { margin: 0, color: vars["--aui-color-text-muted"], overflowWrap: "anywhere" },
  log: { maxHeight: "12em", overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 },
  prompt: { margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
});
