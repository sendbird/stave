import { useTranslation } from "@/i18n";
import { sx } from "@/components/aui/utils/stylex";
import { tarsGoalNext } from "@/lib/tars/completion";
import type { TarsResponsibility } from "@/lib/tars/types";
import { tarsSideViewStyles as styles } from "./tars-side-view.styles";

/** Endpoint and next action belong to the goal; a frozen run report describes one execution. */
export function TarsGoalSummary({ row }: { row: TarsResponsibility }) {
  const { t } = useTranslation(["shell"]);
  return <p className={sx(styles.meta)} data-tars-goal={row.completionGoal ?? "unspecified"}>
    {t("shell:tars.goal.target", { goal: t(`shell:tars.goal.kind.${row.completionGoal ?? "unspecified"}`) })}
    {" · "}{t(`shell:tars.goal.next.${tarsGoalNext(row)}`)}
  </p>;
}
