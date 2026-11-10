import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import type { TarsDecisionView } from "@/lib/tars/decisions";
import { tarsFleetTarget } from "@/lib/tars/flow-model";
import { tarsControlsFor } from "@/lib/tars/tray-model";
import type { TarsResponsibility } from "@/lib/tars/types";
import type { TarsDecisionAnswerHandler } from "./TarsConversation";
import { TarsDecisionCard, type TarsDecisionCardProps } from "./TarsDecisionCard";
import type { TarsTrayActions } from "./TarsTray";
import { tarsSideViewStyles as styles } from "./tars-side-view.styles";

const CONTROL_LABEL = { resume: "shell:tars.resume", takeover: "shell:tars.takeOver", cancel: "shell:tars.cancel" } as const;

/**
 * What a blocked responsibility admits next, from its report. An unverified
 * completion offers its waiting decision card, answered like the one in the
 * conversation; any other block offers the controls its state admits
 * (`tarsControlsFor`), through the same host path as the tray's buttons.
 * Show in Fleet stays beside them.
 */
export function TarsBlockedNextSteps({ row, decision, actions, onAnswer, titleOf, rowOf, workspaceNameOf }: {
  row: TarsResponsibility;
  /** The unverified-completion decision waiting for this revision, when there is one. */
  decision: TarsDecisionView | undefined;
  actions: TarsTrayActions;
  onAnswer?: TarsDecisionAnswerHandler;
  titleOf?: (responsibilityId: string) => string | undefined;
  rowOf?: TarsDecisionCardProps["rowOf"];
  workspaceNameOf?: TarsDecisionCardProps["workspaceNameOf"];
}) {
  const { t } = useTranslation(["shell"]);
  if (row.state !== "blocked") return null;
  const fleet = tarsFleetTarget(row);
  const controls = row.detailCode === "unverifiedCompletion" ? []
    : tarsControlsFor(row).filter((operation): operation is keyof typeof CONTROL_LABEL => operation in CONTROL_LABEL);
  return <div className={sx(styles.section)} data-tars-next-steps={row.id}>
    {decision ? <TarsDecisionCard decision={decision} titleOf={titleOf} rowOf={rowOf} workspaceNameOf={workspaceNameOf} busy={actions.busy} onAnswer={onAnswer} /> : null}
    <div className={sx(styles.row)} role="group" aria-label={t("shell:tars.tray.controls", { title: row.title })}>
      {controls.map((operation) => <Button key={operation} size="xs" variant={operation === "resume" ? "default" : "outline"} disabled={actions.busy}
        data-tars-action={operation} onClick={() => actions.onAct(row, operation)}>{t(CONTROL_LABEL[operation])}</Button>)}
      {/* One row, one height: every next step here is on the 28px decision rung, so the row reads as one set of choices. */}
      {row.taskId ? <Button size="xs" variant="outline" onClick={() => actions.onOpenTask(row)}>{t("shell:tars.openTask")}</Button> : null}
      {fleet ? <Button size="xs" variant="ghost" onClick={() => actions.onShowInFleet(fleet)}>{t("shell:tars.tray.showInFleet")}</Button> : null}
    </div>
  </div>;
}
