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

function currentStep(progress: WorkspaceCreationProgress) {
  return WORKSPACE_CREATION_STEPS.find((key) => progress.steps[key].status === "running")
    ?? WORKSPACE_CREATION_STEPS.find((key) => progress.steps[key].status === "failed")
    ?? WORKSPACE_CREATION_STEPS.find((key) => progress.steps[key].status === "waiting");
}

export function WorkspaceCreationRowStatus({ workspaceId }: { workspaceId: string }) {
  const step = useWorkspaceCreationStore((state) =>
    WORKSPACE_CREATION_STEPS.find((key) => state.byId[workspaceId]?.steps[key].status === "running"),
  );
  const { t } = useTranslation("workspace");
  if (!step) return null;
  const label = t(`creationProgress.steps.${step}`);
  return <span role="status" title={label} className={sx(styles.row)}>{label}</span>;
}

export function WorkspaceCreationPanel({ progress }: { progress: WorkspaceCreationProgress }) {
  const { t } = useTranslation(["workspace", "common"]);
  const [openLogs, setOpenLogs] = useState<WorkspaceCreationStep | null>(null);
  const step = currentStep(progress);
  const state = step ? progress.steps[step] : undefined;
  const failed = state?.status === "failed";
  const detail = failed ? state.detail : undefined;
  const logsVisible = openLogs === step;
  return (
    <section aria-label={t("creationProgress.title")} className={sx(styles.panel)}>
      <div className={sx(styles.content)}>
        <h2 className={sx(styles.title)}>{t("creationProgress.title")}</h2>
        {step && state ? (
          <div className={sx(styles.step)}>
            <p role="status" className={sx(styles.stepHeader)}>
              <span>{t(`creationProgress.steps.${step}`)}</span>
              <span className={sx(styles.status, failed && styles.failed)}>
                {t(`creationProgress.status.${state.status}`)}
              </span>
            </p>
            {detail ? (
              logsVisible
                ? <pre className={sx(styles.log)}>{detail}</pre>
                : <p className={sx(styles.reason)}>{detail.split("\n")[0]}</p>
            ) : null}
            {failed && (state.retry || detail) ? (
              <div className={sx(styles.actions)}>
                {state.retry ? (
                  <Button size="sm" variant="outline" onClick={() => { setOpenLogs(null); void state.retry?.(); }}>
                    {t("common:actions.retry")}
                  </Button>
                ) : null}
                {detail ? (
                  <Button size="sm" variant="ghost" aria-expanded={logsVisible} onClick={() => setOpenLogs(logsVisible ? null : step)}>
                    {t(logsVisible ? "creationProgress.hideLogs" : "creationProgress.openLogs")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {progress.prompt ? (
          <article className={sx(styles.draft)}>
            <h3 className={sx(styles.title)}>{progress.taskTitle}</h3>
            <p className={sx(styles.prompt)}>{progress.prompt}</p>
          </article>
        ) : null}
      </div>
    </section>
  );
}

const styles = stylex.create({
  row: { flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  failed: { color: vars["--aui-color-danger-text"] },
  panel: { display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: vars["--aui-space-24"], boxSizing: "border-box" },
  content: { display: "grid", gap: vars["--aui-space-12"], width: "100%", maxWidth: "36rem", margin: "auto", fontSize: vars["--aui-font-size-body"] },
  title: { margin: 0, fontSize: vars["--aui-font-size-lead"], fontWeight: vars["--aui-font-weight-semibold"] },
  step: { display: "grid", gap: vars["--aui-space-4"], minWidth: 0 },
  stepHeader: { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: vars["--aui-space-8"], margin: 0 },
  actions: { display: "flex", flexWrap: "wrap", gap: vars["--aui-space-8"] },
  draft: { display: "grid", gap: vars["--aui-space-4"], minWidth: 0, paddingBlockStart: vars["--aui-space-12"], borderBlockStart: `1px solid ${vars["--aui-color-border"]}` },
  status: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  reason: { margin: 0, color: vars["--aui-color-text-muted"], overflowWrap: "anywhere" },
  log: { maxHeight: "12em", overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 },
  prompt: { margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
});
