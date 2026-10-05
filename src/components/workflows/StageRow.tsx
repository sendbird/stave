import { i18n, useTranslation } from "@/i18n";
import { useEffect, useId, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Copy,
  Ellipsis,
  GripVertical,
  Hand,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { DropdownMenu } from "@/components/ads/components/DropdownMenu";
import { TextField } from "@/components/ads/components/TextField";
import { Textarea } from "@/components/ads/components/Textarea";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { sx } from "@/components/ads/utils/stylex";
import {
  AI_STAGE_ROLES,
  DEFAULT_WATCH_CHECKS,
  WORKFLOW_LIMITS,
  WATCH_CHECKS_TIMEOUT_MINUTES,
  type AiStage,
  type WorkflowStage,
} from "@/lib/workflows/schema";
import { useAppStore } from "@/store/app.store";
import { Segmented } from "./Segmented";
import { StageAgentField } from "./StageAgentField";
import { workflowStyles as styles } from "./workflows.styles";

const ACTION_DESCRIPTIONS = {
  get "open-draft-pr"() { return i18n.t("agentRuns:stageRow.openDraftPr"); },
  get "watch-checks"() { return i18n.t("agentRuns:stageRow.watchChecks"); },
  get "mark-pr-ready"() { return i18n.t("agentRuns:stageRow.markPrReady"); },
  get "run-script"() { return i18n.t("agentRuns:stageRow.runScript"); },
} as const;

const ROLE_OPTIONS = [
  { value: "none", get label() { return i18n.t("agentRuns:stageRow.label"); }, get description() { return i18n.t("agentRuns:stageRow.description"); } },
  { value: "plan", get label() { return i18n.t("agentRuns:stageRow.label2"); }, get description() { return i18n.t("agentRuns:stageRow.description2"); } },
  { value: "publish", get label() { return i18n.t("agentRuns:stageRow.label3"); }, get description() { return i18n.t("agentRuns:stageRow.description3"); } },
] as const;

type RoleValue = (typeof ROLE_OPTIONS)[number]["value"];

export interface StageRowProps {
  stage: WorkflowStage;
  index: number;
  count: number;
  asksFirst: boolean;
  expanded: boolean;
  /** Field issues keyed by the stage-relative path ("title", "instruction"). */
  issues: ReadonlyMap<string, string>;
  dragging?: boolean;
  dropPosition?: "before" | "after" | null;
  onToggleExpanded: () => void;
  onChange: (stage: WorkflowStage) => void;
  onToggleSignOff: () => void;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  dragHandlers: {
    onDragStart: (event: React.DragEvent) => void;
    onDragEnd: () => void;
    onDragOver: (event: React.DragEvent) => void;
    onDrop: (event: React.DragEvent) => void;
  };
}

function previewOf(stage: WorkflowStage): { text: string; missing: boolean } {
  if (stage.kind === "action") {
    if (stage.action.type === "watch-checks") {
      const { repairAttempts, timeoutMinutes } = stage.action;
      return {
        text: i18n.t("agentRuns:stageRow.text", { value1: repairAttempts ? i18n.t("agentRuns:stageRow.extraCopy208", { value1: repairAttempts, count: repairAttempts }) : i18n.t("agentRuns:stageRow.extraCopy209"), value2: timeoutMinutes }),
        missing: false,
      };
    }
    if (stage.action.type === "run-script") {
      return { text: i18n.t("agentRuns:stageRow.text2", { value1: stage.action.scriptId }), missing: false };
    }
    return { text: "Stave action", missing: false };
  }
  if (!stage.instruction.trim()) return { text: i18n.t("agentRuns:stageRow.text3"), missing: true };
  return { text: stage.instruction, missing: false };
}

/** Issue paths a stage's own fields show beside themselves; the row lists every other one. */
function placedIssuePaths(stage: WorkflowStage): ReadonlySet<string> {
  if (stage.kind === "ai") return new Set(["title", "instruction", "doneWhen"]);
  return new Set(stage.action.type === "run-script" ? ["title", "action.scriptId"] : ["title"]);
}

export function StageRow(props: StageRowProps) {
  useTranslation();
  const { stage, index, count } = props;
  const bodyId = useId();
  const preview = previewOf(stage);
  const placed = placedIssuePaths(stage);
  // Stage-wide issues (order, duplicate id) and fields without a control of their own.
  const rowIssues = [...props.issues].filter(([path]) => !placed.has(path));
  const first = index === 0;
  const askLabel = first
    ? i18n.t("agentRuns:stageRow.askLabel")
    : props.asksFirst
      ? i18n.t("agentRuns:stageRow.askLabel2")
      : i18n.t("agentRuns:stageRow.askLabel3");
  return (
    <li
      className={sx(
        styles.stage,
        props.dragging && styles.stageDragging,
        props.dropPosition === "before" && styles.dropBefore,
        props.dropPosition === "after" && styles.dropAfter,
      )}
      onDragOver={props.dragHandlers.onDragOver}
      onDrop={props.dragHandlers.onDrop}
      aria-label={i18n.t("agentRuns:stageRow.ariaLabel", { value1: index + 1, value2: stage.title })}
    >
      <div className={sx(styles.stageHead)}>
        <Button
          variant="quiet"
          size="iconSm"
          iconOnly
          press="none"
          aria-label={i18n.t("agentRuns:stageRow.ariaLabel2", { value1: stage.title })}
          xstyle={styles.handle}
          draggable
          onDragStart={props.dragHandlers.onDragStart}
          onDragEnd={props.dragHandlers.onDragEnd}
          onKeyDown={(event) => {
            if (!event.altKey) return;
            const to = event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1 : null;
            if (to === null || to < 0 || to > count - 1) return;
            event.preventDefault();
            // Reordering moves this row's element, which drops focus; keep it
            // on the handle so the next Alt+arrow keeps moving the same stage.
            const handle = event.currentTarget;
            props.onMove(to);
            requestAnimationFrame(() => {
              if (handle.isConnected && document.activeElement !== handle) handle.focus();
            });
          }}
        >
          <GripVertical aria-hidden />
        </Button>
        <span className={sx(styles.number)} aria-hidden>
          {index + 1}
        </span>
        <span className={sx(styles.kind, stage.kind === "action" && styles.kindAction)} title={stage.kind === "ai" ? i18n.t("agentRuns:stageRow.title") : i18n.t("agentRuns:stageRow.title2")}>
          {stage.kind === "ai" ? (
            <Sparkles aria-hidden className={sx(styles.kindIcon)} />
          ) : (
            <Zap aria-hidden className={sx(styles.kindIcon)} />
          )}
        </span>
        <div className={sx(styles.titleCell)}>
          <input
            className={sx(styles.titleInput)}
            value={stage.title}
            maxLength={WORKFLOW_LIMITS.stageTitle}
            aria-label={i18n.t("agentRuns:stageRow.ariaLabel3", { value1: index + 1 })}
            aria-invalid={props.issues.has("title") || undefined}
            onChange={(event) => props.onChange({ ...stage, title: event.target.value })}
          />
          {props.expanded ? null : (
            <span className={sx(styles.preview, preview.missing && styles.previewMissing)} title={preview.text}>
              {preview.text}
            </span>
          )}
        </div>
        <div className={sx(styles.stageActions)}>
          <Tooltip content={askLabel}>
            <Button
              variant="quiet"
              size="iconSm"
              iconOnly
              press="none"
              aria-label={first ? i18n.t("agentRuns:stageRow.ariaLabel4") : i18n.t("agentRuns:stageRow.ariaLabel5")}
              aria-pressed={props.asksFirst}
              disabled={first}
              xstyle={[styles.askToggle, props.asksFirst && styles.askToggleOn]}
              onClick={props.onToggleSignOff}
            >
              <Hand aria-hidden />
            </Button>
          </Tooltip>
          <Button
            variant="quiet"
            size="iconSm"
            iconOnly
            press="none"
            aria-label={props.expanded ? i18n.t("agentRuns:stageRow.ariaLabel6", { value1: stage.title }) : i18n.t("agentRuns:stageRow.ariaLabel7", { value1: stage.title })}
            aria-expanded={props.expanded}
            aria-controls={bodyId}
            onClick={props.onToggleExpanded}
          >
            <ChevronRight aria-hidden className={sx(styles.chevron, props.expanded && styles.chevronOpen)} />
          </Button>
          <DropdownMenu
            placement="bottom-end"
            triggerAsChild
            trigger={
              <Button variant="quiet" size="iconSm" iconOnly aria-label={i18n.t("agentRuns:stageRow.ariaLabel8", { value1: stage.title })}>
                <Ellipsis aria-hidden />
              </Button>
            }
            groups={[
              {
                items: [
                  { label: i18n.t("agentRuns:stageRow.label4"), icon: <ArrowUp />, disabled: index === 0, onSelect: () => props.onMove(index - 1) },
                  {
                    label: i18n.t("agentRuns:stageRow.label5"),
                    icon: <ArrowDown />,
                    disabled: index === count - 1,
                    onSelect: () => props.onMove(index + 1),
                  },
                  ...(stage.kind === "ai" ? [{ label: i18n.t("agentRuns:stageRow.label6"), icon: <Copy />, onSelect: props.onDuplicate }] : []),
                ],
              },
              {
                items: [
                  {
                    label: i18n.t("agentRuns:stageRow.label7"),
                    icon: <Trash2 />,
                    tone: "danger" as const,
                    disabled: count === 1,
                    onSelect: props.onRemove,
                  },
                ],
              },
            ]}
          />
        </div>
      </div>
      {props.expanded ? (
        <div id={bodyId} className={sx(styles.stageBody)}>
          {props.issues.get("title") ? <p className={sx(styles.fieldError)}>{props.issues.get("title")}</p> : null}
          {rowIssues.map(([path, message]) => (
            <p key={path || "stage"} className={sx(styles.fieldError)}>
              {message}
            </p>
          ))}
          {stage.kind === "ai" ? (
            <AiStageFields stage={stage} issues={props.issues} onChange={props.onChange} />
          ) : (
            <ActionStageFields stage={stage} issues={props.issues} onChange={props.onChange} />
          )}
        </div>
      ) : null}
    </li>
  );
}

function AiStageFields(props: {
  stage: AiStage;
  issues: ReadonlyMap<string, string>;
  onChange: (stage: WorkflowStage) => void;
}) {
  useTranslation();
  const { stage } = props;
  const role: RoleValue = stage.role ?? "none";
  return (
    <>
      <Textarea
        label={i18n.t("agentRuns:stageRow.label8")}
        description={i18n.t("agentRuns:stageRow.description4")}
        value={stage.instruction}
        maxLength={WORKFLOW_LIMITS.instruction}
        autoResize
        maxRows={10}
        size="sm"
        error={props.issues.get("instruction")}
        onChange={(event) => props.onChange({ ...stage, instruction: event.target.value })}
      />
      <Textarea
        label={i18n.t("agentRuns:stageRow.label9")}
        description={i18n.t("agentRuns:stageRow.description5")}
        value={stage.doneWhen}
        maxLength={WORKFLOW_LIMITS.doneWhen}
        autoResize
        maxRows={6}
        size="sm"
        error={props.issues.get("doneWhen")}
        onChange={(event) => props.onChange({ ...stage, doneWhen: event.target.value })}
      />
      <div className={sx(styles.propertyValue)}>
        <span className={sx(styles.propertyLabel)}>{i18n.t("agentRuns:stageRow.aiStageFields")}</span>
        <Segmented
          aria-label={i18n.t("agentRuns:stageRow.ariaLabel9")}
          size="xs"
          value={role}
          options={ROLE_OPTIONS}
          onChange={(next) => {
            const { role: _previous, ...rest } = stage;
            props.onChange(next === "none" ? rest : { ...rest, role: next as (typeof AI_STAGE_ROLES)[number] });
          }}
        />
      </div>
      <StageAgentField stage={stage} onChange={props.onChange} />
    </>
  );
}

/** The script actions of the workspace in view, to pick a Run script stage's script from. */
function useWorkspaceScriptActions(): Array<{ id: string; label: string }> {
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const workspacePath = useAppStore((state) => state.workspacePathById[state.activeWorkspaceId] ?? null);
  const [actions, setActions] = useState<Array<{ id: string; label: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    const getConfig = window.api?.scripts?.getConfig;
    if (!getConfig || !repositoryPath || !workspacePath) return;
    void getConfig({ repositoryPath, workspacePath })
      .then((result) => {
        if (!cancelled && result.ok && result.config) {
          setActions(result.config.actions.map((entry) => ({ id: entry.id, label: entry.label || entry.id })));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [repositoryPath, workspacePath]);
  return actions;
}

function RunScriptField(props: {
  stage: Extract<WorkflowStage, { kind: "action" }>;
  action: Extract<Extract<WorkflowStage, { kind: "action" }>["action"], { type: "run-script" }>;
  error?: string;
  onChange: (stage: WorkflowStage) => void;
}) {
  useTranslation();
  const scripts = useWorkspaceScriptActions();
  const set = (scriptId: string) => props.onChange({ ...props.stage, action: { ...props.action, scriptId } });
  return (
    <div className={sx(styles.propertyValue)}>
      <TextField
        size="sm"
        label={i18n.t("agentRuns:stageRow.label10")}
        description={i18n.t("agentRuns:stageRow.description6")}
        value={props.action.scriptId}
        maxLength={120}
        error={props.error}
        onChange={(event) => set(event.target.value)}
      />
      {scripts.length > 0 ? (
        <span className={sx(styles.chips)}>
          <span className={sx(styles.hint)}>{i18n.t("agentRuns:stageRow.runScriptField")}</span>
          {scripts.map((script) => (
            <Button
              key={script.id}
              size="xs"
              variant={script.id === props.action.scriptId ? "secondary" : "quiet"}
              aria-pressed={script.id === props.action.scriptId}
              onClick={() => set(script.id)}
            >
              {script.label}
            </Button>
          ))}
        </span>
      ) : null}
    </div>
  );
}

function ActionStageFields(props: {
  stage: Extract<WorkflowStage, { kind: "action" }>;
  issues: ReadonlyMap<string, string>;
  onChange: (stage: WorkflowStage) => void;
}) {
  useTranslation();
  const { stage } = props;
  const action = stage.action;
  return (
    <>
      <p className={sx(styles.hint)}>{ACTION_DESCRIPTIONS[action.type]}</p>
      {action.type === "watch-checks" ? (
        <div className={sx(styles.properties)}>
          <span className={sx(styles.propertyLabel)}>{i18n.t("agentRuns:stageRow.actionStageFields")}</span>
          <div className={sx(styles.propertyValue)}>
            <Segmented
              aria-label={i18n.t("agentRuns:stageRow.ariaLabel10")}
              size="xs"
              value={String(action.repairAttempts) as "0" | "1" | "2" | "3"}
              options={[
                { value: "0", label: i18n.t("agentRuns:stageRow.label11") },
                { value: "1", label: "1" },
                { value: "2", label: "2" },
                { value: "3", label: "3" },
              ]}
              onChange={(next) =>
                props.onChange({
                  ...stage,
                  action: { ...action, repairAttempts: Number(next) as 0 | 1 | 2 | 3 },
                })
              }
            />
            <p className={sx(styles.hint)}>{i18n.t("agentRuns:stageRow.actionStageFields2")}</p>
          </div>
          <span className={sx(styles.propertyLabel)}>{i18n.t("agentRuns:stageRow.actionStageFields3")}</span>
          <div className={sx(styles.propertyValue)}>
            <Segmented
              aria-label={i18n.t("agentRuns:stageRow.ariaLabel11")}
              size="xs"
              value={String(action.timeoutMinutes)}
              options={[15, 30, 60, 120]
                .filter((minutes) => minutes >= WATCH_CHECKS_TIMEOUT_MINUTES.min && minutes <= WATCH_CHECKS_TIMEOUT_MINUTES.max)
                .concat(
                  [15, 30, 60, 120].includes(action.timeoutMinutes) ? [] : [action.timeoutMinutes],
                )
                .map((minutes) => ({
                  value: String(minutes),
                  label: minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`,
                }))}
              onChange={(next) =>
                props.onChange({
                  ...stage,
                  action: { ...action, timeoutMinutes: Number(next) || DEFAULT_WATCH_CHECKS.timeoutMinutes },
                })
              }
            />
            <p className={sx(styles.hint)}>{i18n.t("agentRuns:stageRow.actionStageFields4")}</p>
          </div>
        </div>
      ) : null}
      {action.type === "run-script" ? (
        <RunScriptField
          stage={stage}
          action={action}
          error={props.issues.get("action.scriptId")}
          onChange={props.onChange}
        />
      ) : null}
    </>
  );
}
