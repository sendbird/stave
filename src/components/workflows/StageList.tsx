import { getStageDisplayTitle } from "@/lib/agent-runs/stage-display";
import { i18n, useTranslation } from "@/i18n";
import { useState } from "react";
import { Plus, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { DropdownMenu } from "@/components/ads/components/DropdownMenu";
import { sx } from "@/components/ads/utils/stylex";
import {
  createActionStage,
  createBlankAiStage,
  explainActionUnavailable,
  moveStage,
  setStageSignOff,
  stageAsksFirst,
  uniqueStageId,
} from "@/lib/workflows/library";
import { MAX_WORKFLOW_STAGES, STAVE_ACTION_LABELS, type CheckIns, type WorkflowStage, type StaveActionType } from "@/lib/workflows/schema";
import { STAGE_TEMPLATES } from "@/lib/workflows/stage-templates";
import { StageRow } from "./StageRow";
import { workflowStyles as styles } from "./workflows.styles";
import { agentRunStyles } from "@/components/agent-runs/agent-runs.styles";

const ACTION_TYPES: readonly StaveActionType[] = ["open-draft-pr", "watch-checks", "mark-pr-ready", "run-script"];

/** The stage issues for `index`, keyed by the path inside the stage. */
function stageIssues(issues: ReadonlyMap<string, string>, index: number): Map<string, string> {
  const prefix = `stages.${index}.`;
  const result = new Map<string, string>();
  for (const [path, message] of issues) {
    if (path.startsWith(prefix)) result.set(path.slice(prefix.length), message);
    else if (path === `stages.${index}`) result.set("", message);
  }
  return result;
}

/** What the list edits: ordered stages and the check-ins their sign-offs derive from. */
export interface StageListValue {
  checkIns: CheckIns;
  stages: WorkflowStage[];
}

/**
 * An agent's workflow stages: edit in place, reorder by dragging the handle
 * or with Alt+arrow keys, toggle each stage's sign-off, and add stages from
 * blank, templates or Stave actions. Issues are keyed `stages.<index>.<field>`.
 */
export function StageList<T extends StageListValue>(props: {
  value: T;
  issues: ReadonlyMap<string, string>;
  onChange: (value: T) => void;
}) {
  useTranslation();
  const workflow = props.value;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<{ index: number; position: "before" | "after" } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const stages = workflow.stages;
  const full = stages.length >= MAX_WORKFLOW_STAGES;

  const setStages = (next: WorkflowStage[]) => props.onChange({ ...workflow, stages: next });
  const move = (from: number, to: number) => {
    if (to < 0 || to >= stages.length) return;
    setStages(moveStage(stages, from, to));
    setAnnouncement(i18n.t("agentRuns:stageList.extraCopy206", { value1: stages[from]!.title, value2: to + 1, value3: stages.length }));
  };
  const addStage = (stage: WorkflowStage) => {
    setStages([...stages, stage]);
    if (stage.kind === "ai") setExpandedId(stage.id);
  };
  const takenIds = stages.map((stage) => stage.id);

  return (
    <section className={sx(agentRunStyles.section)} aria-label={i18n.t("agentRuns:stageList.ariaLabel")}>
      {/* With no stages there is nothing to head or count, only the Add stage button. */}
      {stages.length > 0 ? (
        <div className={sx(styles.sectionHeader)}>
          <h3 className={sx(styles.sectionTitle)}>{i18n.t("agentRuns:stageList.stageList")}</h3>
          <span className={sx(styles.sectionAside)}>
            {stages.length} {i18n.t("agentRuns:stageList.stageList2")}{MAX_WORKFLOW_STAGES}
          </span>
        </div>
      ) : null}
      {props.issues.get("stages") ? <p className={sx(styles.fieldError)}>{props.issues.get("stages")}</p> : null}
      {stages.length > 0 ? (
        <ol className={sx(styles.stages)}>
          {stages.map((stage, index) => {
            const issues = stageIssues(props.issues, index);
            return (
              <StageRow
                key={stage.id}
                stage={stage}
                index={index}
                count={stages.length}
                asksFirst={stageAsksFirst(workflow, index)}
                expanded={expandedId === stage.id || issues.size > 0}
                issues={issues}
                dragging={dragFrom === index}
                dropPosition={dropAt?.index === index ? dropAt.position : null}
                onToggleExpanded={() => setExpandedId((current) => (current === stage.id ? null : stage.id))}
                onChange={(next) => setStages(stages.map((candidate, position) => (position === index ? next : candidate)))}
                onToggleSignOff={() =>
                  props.onChange(setStageSignOff(workflow, index, stageAsksFirst(workflow, index) ? "auto" : "ask"))
                }
                onMove={(to) => move(index, to)}
                onDuplicate={() => {
                  if (full || stage.kind !== "ai") return;
                  const copy = { ...stage, id: uniqueStageId(stage.title, takenIds), title: i18n.t("agentRuns:remaining.presentationCopy402", { v1: stage.title }) };
                  setStages([...stages.slice(0, index + 1), copy, ...stages.slice(index + 1)]);
                }}
                onRemove={() => {
                  setStages(stages.filter((_, position) => position !== index));
                  setAnnouncement(i18n.t("agentRuns:stageList.extraCopy207", { value1: stage.title }));
                }}
                dragHandlers={{
                  onDragStart: (event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", stage.id);
                    setDragFrom(index);
                  },
                  onDragEnd: () => {
                    setDragFrom(null);
                    setDropAt(null);
                  },
                  onDragOver: (event) => {
                    if (dragFrom === null) return;
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                    setDropAt((current) =>
                      current?.index === index && current.position === position ? current : { index, position },
                    );
                  },
                  onDrop: (event) => {
                    event.preventDefault();
                    if (dragFrom === null || !dropAt) return;
                    let target = dropAt.position === "before" ? dropAt.index : dropAt.index + 1;
                    if (dragFrom < target) target -= 1;
                    move(dragFrom, target);
                    setDragFrom(null);
                    setDropAt(null);
                  },
                }}
              />
            );
          })}
        </ol>
      ) : null}
      <div className={sx(styles.addRow)}>
        <DropdownMenu
          triggerAsChild
          trigger={
            <Button variant="secondary" size="sm" disabled={full}>
              <Plus aria-hidden />
              {i18n.t("agentRuns:stageList.trigger")}</Button>
          }
          groups={[
            {
              label: i18n.t("agentRuns:stageList.label"),
              items: [
                {
                  label: i18n.t("agentRuns:stageList.label2"),
                  icon: <Sparkles />,
                  onSelect: () => addStage(createBlankAiStage(takenIds)),
                },
                ...STAGE_TEMPLATES.map((template) => ({
                  label: template.label,
                  icon: <Sparkles />,
                  onSelect: () =>
                    addStage({ ...structuredClone(template.stage), id: uniqueStageId(getStageDisplayTitle(template.stage), takenIds) }),
                })),
              ],
            },
            {
              label: "Stave action",
              items: ACTION_TYPES.map((type) => {
                const reason = explainActionUnavailable(workflow, type);
                return {
                  label: STAVE_ACTION_LABELS[type],
                  icon: <Zap />,
                  disabled: reason !== null,
                  onSelect: () => addStage(createActionStage(type, takenIds)),
                };
              }),
            },
          ]}
        />
        {full ? <span className={sx(styles.hint)}>{i18n.t("agentRuns:stageList.sentence58", { value1: MAX_WORKFLOW_STAGES })}</span> : null}
      </div>
      <p className={sx(agentRunStyles.visuallyHidden)} aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
