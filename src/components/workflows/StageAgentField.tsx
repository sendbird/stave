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
  const { stage } = props;
  const custom = useAppStore((state) => state.settings.customAgents);
  const agents = useMemo(
    () => listAgents({ custom, activeOnly: true }).filter((agent) => isUsableAs(agent, "delegate")),
    [custom],
  );
  const missing = stage.agentConfigId && !agents.some((agent) => agent.id === stage.agentConfigId);
  return (
    <div className={sx(styles.propertyValue)}>
      <span className={sx(styles.propertyLabel)}>Done by</span>
      <Select
        size="sm"
        aria-label="Done by"
        value={stage.agentConfigId ?? LEAD}
        options={[
          { value: LEAD, label: "This run's task" },
          ...(missing ? [{ value: stage.agentConfigId!, label: `${stage.agentConfigId} (not found)` }] : []),
          ...agents.map((agent) => ({ value: agent.id, label: `${agent.name} · delegated task` })),
        ]}
        onValueChange={(value) => {
          const { agentConfigId: _id, pinCommit: _pin, ...rest } = stage;
          props.onChange(String(value) === LEAD ? rest : { ...rest, agentConfigId: String(value) });
        }}
      />
      {stage.agentConfigId ? (
        <Checkbox
          label="Work on the commit checked out when it starts"
          description="Stave refuses to start it if the workspace has moved. Use it for review stages."
          checked={stage.pinCommit === true}
          onCheckedChange={(value) => {
            const { pinCommit: _pin, ...rest } = stage;
            props.onChange(value === true ? { ...rest, pinCommit: true } : rest);
          }}
        />
      ) : null}
      {missing ? (
        <span className={sx(styles.hint, styles.hintWarning)}>No agent usable as a delegated task has this id.</span>
      ) : null}
    </div>
  );
}
