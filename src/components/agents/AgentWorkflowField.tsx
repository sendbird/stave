import { i18n, useTranslation } from "@/i18n";
import { useMemo } from "react";
import { Select } from "@/components/ads/components/Select";
import { sx } from "@/components/ads/utils/stylex";
import { AGENT_CHECK_IN_LABELS, DEFAULT_AGENT_CHECK_INS, type AgentConfig } from "@/lib/agents/schema";
import { applyCheckIns } from "@/lib/workflows/library";
import { CHECK_INS, type CheckIns, type WorkflowStage } from "@/lib/workflows/schema";

/** What a run does at each check-in level, read from `deriveStageSignOff`. */
const CHECK_IN_EFFECTS: Readonly<Record<CheckIns, string>> = {
  get "when-stuck"() { return i18n.t("agents:agentWorkflowField.extraCopy25"); },
  get "plan-and-publishing"() { return i18n.t("agents:agentWorkflowField.extraCopy26"); },
  get "every-stage"() { return i18n.t("agents:agentWorkflowField.extraCopy27"); },
};
import { StageList } from "../workflows/StageList";
import { workflowStyles as styles } from "../workflows/workflows.styles";

/** `workflow.2.title` issues as the stage list reads them: `stages.2.title`. */
function stageIssues(issues: Readonly<Record<string, string>>): Map<string, string> {
  const result = new Map<string, string>();
  for (const [path, message] of Object.entries(issues)) {
    if (path === "workflow") result.set("stages", message);
    else if (path.startsWith("workflow.")) result.set(`stages.${path.slice("workflow.".length)}`, message);
  }
  return result;
}

/**
 * The agent editor's Workflow: the stages a run of this agent follows, and
 * when it checks in with the user between them. No stages means a run is one
 * stage that plans its own steps; the check-in choice appears once there is
 * more than one stage to wait between.
 */
export function AgentWorkflowField(props: {
  agent: AgentConfig;
  issues: Readonly<Record<string, string>>;
  onChange: (agent: AgentConfig) => void;
}) {
  useTranslation();
  const { agent } = props;
  const checkIns = agent.checkIns ?? DEFAULT_AGENT_CHECK_INS;
  const value = useMemo(() => ({ checkIns, stages: agent.workflow ?? [] }), [agent.workflow, checkIns]);
  const issues = useMemo(() => stageIssues(props.issues), [props.issues]);
  const apply = (next: { checkIns: CheckIns; stages: WorkflowStage[] }) => {
    const { workflow: _workflow, checkIns: _checkIns, ...rest } = agent;
    props.onChange({
      ...rest,
      ...(next.stages.length > 0 ? { workflow: next.stages } : {}),
      ...(next.stages.length > 0 && next.checkIns !== DEFAULT_AGENT_CHECK_INS ? { checkIns: next.checkIns } : {}),
    });
  };
  return (
    <>
      {value.stages.length === 0 ? (
        <p className={sx(styles.hint)}>{i18n.t("agents:agentWorkflowField.agentWorkflowField")}</p>
      ) : null}
      <StageList value={value} issues={issues} onChange={apply} />
      {value.stages.length > 1 ? (
        <dl className={sx(styles.properties)}>
          <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentWorkflowField.agentWorkflowField2")}</dt>
          <dd className={sx(styles.propertyValue)}>
            <Select
              size="sm"
              aria-label={i18n.t("agents:agentWorkflowField.ariaLabel")}
              value={checkIns}
              options={[...CHECK_INS].reverse().map((level) => ({ value: level, label: AGENT_CHECK_IN_LABELS[level] }))}
              onValueChange={(level) => apply(applyCheckIns(value, String(level) as CheckIns))}
            />
          </dd>
        </dl>
      ) : null}
      {value.stages.length > 1 ? (
        <p className={sx(styles.hint)}>{i18n.t("agents:agentWorkflowField.sentence13", { value1: CHECK_IN_EFFECTS[checkIns] })}</p>
      ) : null}
    </>
  );
}
