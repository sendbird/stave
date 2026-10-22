import { i18n, useTranslation } from "@/i18n";
import { useId, useState, type ReactNode } from "react";
import { ListChecks, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { AsyncBoundary } from "@/components/system/AsyncBoundary";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
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
import { Segmented } from "./Segmented";
import { readyWorkspaceScripts, useWorkspaceScriptActions, type WorkspaceScriptActions, type WorkspaceScriptOption } from "./useWorkspaceScriptActions";
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
        <Segmented<WorkspaceCheckMode>
          aria-label={i18n.t("agentRuns:stageChecks.modeAria", { check: name })}
          size="xs"
          value={mode}
          options={[
            { value: "all", label: i18n.t("agentRuns:stageChecks.modeAll"), description: i18n.t("agentRuns:stageChecks.modeAllDescription") },
            { value: "any", label: i18n.t("agentRuns:stageChecks.modeAny"), description: i18n.t("agentRuns:stageChecks.modeAnyDescription") },
          ]}
          onChange={(next) => props.onChange(setStageCheckMode(stage, check.index, next))}
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
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) props.onClose?.();
      }}
    >
      <PopoverTrigger render={<Button variant="quiet" size="xs" aria-label={props.triggerLabel} />}>{props.trigger}</PopoverTrigger>
      <PopoverContent align="start" density="flush" xstyle={styles.popup}>
        {open ? <ScriptOptions {...props} /> : null}
      </PopoverContent>
    </Popover>
  );
}

function ScriptOptions(props: { scripts: WorkspaceScriptActions; selected: readonly string[]; onToggle: (scriptId: string) => void }) {
  useTranslation();
  if (!props.scripts.available) return <p role="status" className={sx(styles.note)}>{i18n.t("agentRuns:stageChecks.noWorkspace")}</p>;
  return (
    <div className={sx(styles.boundary)}>
      <AsyncBoundary
        state={props.scripts.state}
        onRetry={props.scripts.refresh}
        describeError={() => i18n.t("agentRuns:stageChecks.readFailed")}
        isEmpty={(list: WorkspaceScriptOption[]) => list.length === 0}
        empty={<p role="status" className={sx(styles.note)}>{i18n.t("agentRuns:stageChecks.noScripts")}</p>}
      >
        {(list) => (
          <Command>
            <CommandInput autoFocus aria-label={i18n.t("agentRuns:stageChecks.search")} placeholder={i18n.t("agentRuns:stageChecks.search")} />
            <CommandList className={sx(styles.options)}>
              <CommandEmpty>{i18n.t("agentRuns:stageChecks.noMatch")}</CommandEmpty>
              {list.map((script) => {
                const checked = props.selected.includes(script.id);
                return (
                  <CommandItem
                    key={script.id}
                    value={script.id}
                    keywords={[script.label, script.id, script.description]}
                    data-checked={checked}
                    aria-checked={checked}
                    onSelect={() => props.onToggle(script.id)}
                  >
                    <span className={sx(styles.option)}>
                      <span>{script.label}</span>
                      {script.label !== script.id ? <span className={sx(styles.optionDetail)}>{script.id}</span> : null}
                      {script.description ? <span className={sx(styles.optionDetail)}>{script.description}</span> : null}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        )}
      </AsyncBoundary>
    </div>
  );
}
