import { i18n, useTranslation } from "@/i18n";
import { useId, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/aui/components/Button";
import { sx } from "@/components/aui/utils/stylex";
import { SearchableMultiPicker, type SearchablePickerOption } from "@/components/layout/settings-searchable-picker";
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
  // A saved ID the ready workspace does not list: kept as a chip, marked, so
  // the reader sees why a run here would refuse to start.
  const settled = props.scripts.available && props.scripts.state.status === "ready";
  const mode = workspaceCheckMode(check.criterion);
  const name = check.criterion.text;
  return (
    <li className={sx(styles.check)} aria-label={name}>
      <div className={sx(styles.head)}>
        <span className={sx(styles.name)}>{name}</span>
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
      {/* The check's scripts are chips in a field: remove one with its own
          button or Backspace, search and add more in place. */}
      <ScriptPicker
        scripts={props.scripts}
        selected={ids}
        fieldLabel={i18n.t("agentRuns:stageChecks.scriptsAria", { check: name })}
        missingOption={(id) =>
          settled
            ? { value: id, label: i18n.t("agentRuns:stageChecks.unknownScriptLabel", { script: id }), detail: i18n.t("agentRuns:stageChecks.unknownScript"), stale: true }
            : { value: id, label: id }
        }
        onSet={(next) => {
          // Apply every difference in turn, additions first: removing the last
          // script removes the check (as the trash button does), so nothing
          // may follow that on the same index.
          let nextStage = stage;
          const changed = [...next.filter((id) => !ids.includes(id)), ...ids.filter((id) => !next.includes(id))];
          for (const id of changed) nextStage = toggleStageCheckScript(nextStage, check.index, id);
          if (changed.length) props.onChange(nextStage);
        }}
      />
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

/**
 * A searchable multi-select of the workspace's action scripts; picking keeps
 * the list open. With `trigger` it opens from that button (adding a check);
 * without it the chosen scripts are chips in the field (editing a check).
 */
function ScriptPicker(props: {
  scripts: WorkspaceScriptActions;
  selected: readonly string[];
  /** Trigger form: one pick or unpick at a time. */
  onToggle?: (scriptId: string) => void;
  /** Chip field form: the whole new set, so Clear can empty it at once. */
  onSet?: (scriptIds: string[]) => void;
  onClose?: () => void;
  trigger?: ReactNode;
  /** An accessible name that starts with the visible label, when the label alone is ambiguous. */
  triggerLabel?: string;
  /** Chip field: what the field holds, read with its input. */
  fieldLabel?: string;
  missingOption?: (scriptId: string) => SearchablePickerOption & { stale?: boolean };
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
      trigger={props.trigger ? <Button variant="quiet" size="xs" /> : undefined}
      triggerContent={props.trigger}
      aria-label={props.trigger ? props.triggerLabel : props.fieldLabel}
      options={options}
      selected={props.selected}
      onChange={(next) => {
        if (props.onSet) {
          props.onSet(next);
          return;
        }
        // One pick or unpick at a time: hand the changed script back.
        const changed = next.find((id) => !props.selected.includes(id))
          ?? props.selected.find((id) => !next.includes(id));
        if (changed) props.onToggle?.(changed);
      }}
      missingOption={props.missingOption}
      removeLabel={(script) => i18n.t("agentRuns:stageChecks.removeScript", { script })}
      // A list opened from a small button gets its own width; a chip field's
      // list follows the field.
      popupXstyle={props.trigger ? styles.popup : undefined}
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
