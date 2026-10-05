import { getAgentDisplayName } from "@/lib/agents/display";
import { i18n, useTranslation } from "@/i18n";
import { useMemo } from "react";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { Select } from "@/components/ads/components/Select";
import { sx } from "@/components/ads/utils/stylex";
import { listAgents } from "@/lib/agents/library";
import { isUsableAs } from "@/lib/agents/schema";
import type { AiStage, WorkflowStage } from "@/lib/workflows/schema";
import { useAppStore } from "@/store/app.store";
import { workflowStyles as styles } from "./workflows.styles";

const LEAD = "lead";

/**
 * "Done by": the agent run's own task, or another agent the task delegates the
 * stage to. Only agents usable as a delegated task are offered; a stage naming
 * an agent that is gone keeps its id and says so.
 */
export function StageAgentField(props: { stage: AiStage; onChange: (stage: WorkflowStage) => void }) {
  useTranslation();
  const { stage } = props;
  const custom = useAppStore((state) => state.settings.customAgents);
  const agents = useMemo(
    () => listAgents({ custom, activeOnly: true }).filter((agent) => isUsableAs(agent, "delegate")),
    [custom],
  );
  const missing = stage.agentConfigId && !agents.some((agent) => agent.id === stage.agentConfigId);
  return (
    <div className={sx(styles.propertyValue)}>
      <span className={sx(styles.propertyLabel)}>{i18n.t("agentRuns:stageAgentField.stageAgentField")}</span>
      <Select
        size="sm"
        aria-label={i18n.t("agentRuns:stageAgentField.ariaLabel")}
        value={stage.agentConfigId ?? LEAD}
        options={[
          { value: LEAD, label: i18n.t("agentRuns:stageAgentField.label") },
          ...(missing ? [{ value: stage.agentConfigId!, label: i18n.t("agentRuns:stageAgentField.label2", { value1: stage.agentConfigId }) }] : []),
          ...agents.map((agent) => ({ value: agent.id, label: i18n.t("agentRuns:stageAgentField.label3", { value1: getAgentDisplayName(agent) }) })),
        ]}
        onValueChange={(value) => {
          const { agentConfigId: _id, pinCommit: _pin, ...rest } = stage;
          props.onChange(String(value) === LEAD ? rest : { ...rest, agentConfigId: String(value) });
        }}
      />
      {stage.agentConfigId ? (
        <Checkbox
          label={i18n.t("agentRuns:stageAgentField.label4")}
          description={i18n.t("agentRuns:stageAgentField.description")}
          checked={stage.pinCommit === true}
          onCheckedChange={(value) => {
            const { pinCommit: _pin, ...rest } = stage;
            props.onChange(value === true ? { ...rest, pinCommit: true } : rest);
          }}
        />
      ) : null}
      {missing ? (
        <span className={sx(styles.hint, styles.hintWarning)}>{i18n.t("agentRuns:stageAgentField.stageAgentField2")}</span>
      ) : null}
    </div>
  );
}
