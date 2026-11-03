import { i18n, useTranslation } from "@/i18n";
import { useId, useState, type ReactNode } from "react";
import { ListChecks, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { SearchableMultiPicker } from "@/components/layout/settings-searchable-picker";
import type { AiStage, WorkflowStage, WorkspaceCheckMode } from "@/lib/workflows/schema";
import {
  addStageCheck,
  listStageChecks,
  removeStageCheck,
  setStageCheckMode,
  toggleStageCheckScript,
  type StageCheck,
} from "@/lib/workflows/stage-checks";
import { workspaceCheckMode } from "@/lib/agent-runs/workspace-check";
import { SegmentedControl } from "@/components/system/SegmentedControl";
import { readyWorkspaceScripts, useWorkspaceScriptActions, type WorkspaceScriptActions } from "./useWorkspaceScriptActions";
import { stageCheckStyles as styles } from "./stage-checks.styles";
import { workflowStyles } from "./workflows.styles";

/**
 * An AI stage's workspace checks: which of the workspace's action scripts
 * Stave runs itself before the stage can finish, and whether all of them or
 * any one must pass. The scripts are picked from a searchable list.
 */
export function StageChecksField(props: { stage: AiStage; error?: string; onChange: (stage: WorkflowStage) => void }) {
  useTranslation();
  const labelId = useId();
  const scripts = useWorkspaceScriptActions();
  // The check the open Add list created, so later picks extend it.
  const [adding, setAdding] = useState<number | null>(null);
  const checks = listStageChecks(props.stage);
  const addingCheck = adding === null ? undefined : checks.find((check) => check.index === adding);
  const add = (scriptId: string) => {
    if (!addingCheck) {
      const next = addStageCheck(props.stage, scriptId);
      setAdding(next.index);
      props.onChange(next.stage);
      return;
    }
    const next = toggleStageCheckScript(props.stage, addingCheck.index, scriptId);
    if ((next.acceptanceCriteria?.length ?? 0) < (props.stage.acceptanceCriteria?.length ?? 0)) setAdding(null);
    props.onChange(next);
  };
  return (
    <div className={sx(workflowStyles.propertyValue, styles.field)} role="group" aria-labelledby={labelId}>
      <span id={labelId} className={sx(workflowStyles.propertyLabel)}>{i18n.t("agentRuns:stageChecks.label")}</span>
      <p className={sx(workflowStyles.hint)}>
        {checks.length ? i18n.t("agentRuns:stageChecks.description") : i18n.t("agentRuns:stageChecks.none")}
      </p>
      {checks.length ? (
        <ul className={sx(styles.list)}>
          {checks.map((check) => (
            <StageCheckRow key={check.index} check={check} scripts={scripts} stage={props.stage} onChange={props.onChange} />
          ))}
        </ul>
      ) : null}
      <div>
        <ScriptPicker
          scripts={scripts}
          selected={addingCheck?.criterion.scriptIds ?? []}
          onToggle={add}
          onClose={() => setAdding(null)}
          trigger={<><Plus aria-hidden />{i18n.t("agentRuns:stageChecks.add")}</>}
        />
      </div>
      {props.error ? <p className={sx(workflowStyles.fieldError)}>{props.error}</p> : null}
    </div>
  );
}

function StageCheckRow(props: { check: StageCheck; stage: AiStage; scripts: WorkspaceScriptActions; onChange: (stage: WorkflowStage) => void }) {
  useTranslation();
  const { check, stage } = props;
  const ids = check.criterion.scriptIds ?? [];
  const known = new Map(readyWorkspaceScripts(props.scripts).map((script) => [script.id, script]));
  const mode = workspaceCheckMode(check.criterion);
  const name = check.criterion.text;
  return (
    <li className={sx(styles.check)} aria-label={name}>
      <div className={sx(styles.head)}>
        <span className={sx(styles.name)}>{name}</span>
        <ScriptPicker
          scripts={props.scripts}
          selected={ids}
          onToggle={(scriptId) => props.onChange(toggleStageCheckScript(stage, check.index, scriptId))}
          trigger={<><ListChecks aria-hidden />{i18n.t("agentRuns:stageChecks.editScripts")}</>}
          triggerLabel={i18n.t("agentRuns:stageChecks.editScriptsAria", { check: name })}
        />
        <Button
          variant="quiet"
          size="xs"
          iconOnly
          aria-label={i18n.t("agentRuns:stageChecks.removeCheck", { check: name })}
          onClick={() => props.onChange(removeStageCheck(stage, check.index))}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      {ids.length ? (
        <ul className={sx(styles.scripts)} aria-label={i18n.t("agentRuns:stageChecks.scriptsAria", { check: name })}>
          {ids.map((id) => {
            const script = known.get(id);
            const unknown = props.scripts.available && props.scripts.state.status === "ready" && !script;
            return (
              <li key={id} className={sx(styles.script, unknown && styles.scriptUnknown)} title={unknown ? i18n.t("agentRuns:stageChecks.unknownScript") : script?.description || id}>
                <span className={sx(styles.scriptLabel)}>
                  {unknown ? i18n.t("agentRuns:stageChecks.unknownScriptLabel", { script: id }) : script?.label ?? id}
                </span>
                <Button
                  variant="quiet"
                  size="xs"
                  iconOnly
                  press="none"
                  xstyle={styles.removeScript}
                  aria-label={i18n.t("agentRuns:stageChecks.removeScript", { script: script?.label ?? id })}
                  onClick={() => props.onChange(toggleStageCheckScript(stage, check.index, id))}
                >
                  <X aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {ids.length > 1 ? (
        <SegmentedControl<WorkspaceCheckMode>
          aria-label={i18n.t("agentRuns:stageChecks.modeAria", { check: name })}
          value={mode}
          options={[
            { value: "all", label: i18n.t("agentRuns:stageChecks.modeAll"), title: i18n.t("agentRuns:stageChecks.modeAllDescription") },
            { value: "any", label: i18n.t("agentRuns:stageChecks.modeAny"), title: i18n.t("agentRuns:stageChecks.modeAnyDescription") },
          ]}
          onValueChange={(next) => props.onChange(setStageCheckMode(stage, check.index, next))}
        />
      ) : null}
      {check.criterion.required === false ? <p className={sx(workflowStyles.hint)}>{i18n.t("agentRuns:stageChecks.optional")}</p> : null}
    </li>
  );
}

/** A searchable multi-select of the workspace's action scripts; picking keeps the list open. */
function ScriptPicker(props: {
  scripts: WorkspaceScriptActions;
  selected: readonly string[];
  onToggle: (scriptId: string) => void;
  onClose?: () => void;
  trigger: ReactNode;
  /** An accessible name that starts with the visible label, when the label alone is ambiguous. */
  triggerLabel?: string;
}) {
  useTranslation();
  const state = props.scripts.available ? props.scripts.state : null;
  const list = readyWorkspaceScripts(props.scripts);
  const options = list.map((script) => ({
    value: script.id,
    label: script.label,
    detail: [script.label !== script.id ? script.id : null, script.description || null].filter(Boolean).join(" · ") || undefined,
    keywords: [script.id, script.description],
  }));
  return (
    <SearchableMultiPicker
      trigger={<Button variant="quiet" size="xs" />}
      triggerContent={props.trigger}
      aria-label={props.triggerLabel}
      options={options}
      selected={props.selected}
      onChange={(next) => {
        // One pick or unpick at a time: hand the changed script back.
        const changed = next.find((id) => !props.selected.includes(id))
          ?? props.selected.find((id) => !next.includes(id));
        if (changed) props.onToggle(changed);
      }}
      popupXstyle={styles.popup}
      onOpenChange={(open) => {
        if (!open) props.onClose?.();
      }}
      loading={state?.status === "pending"}
      searchPlaceholder={i18n.t("agentRuns:stageChecks.search")}
      emptyText={
        !state
          ? i18n.t("agentRuns:stageChecks.noWorkspace")
          : state.status === "error"
            ? i18n.t("agentRuns:stageChecks.readFailed")
            : list.length === 0
              ? i18n.t("agentRuns:stageChecks.noScripts")
              : i18n.t("agentRuns:stageChecks.noMatch")
      }
    />
  );
}
