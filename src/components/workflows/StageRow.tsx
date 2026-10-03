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
  "open-draft-pr":
    "Stave commits what is left, pushes the branch and opens a draft pull request. An open pull request for the branch is reused.",
  "watch-checks":
    "Stave watches the pull request's checks. When one fails, the agent gets a repair turn and Stave pushes the fix.",
  "mark-pr-ready": "Stave marks the draft pull request ready for review, which notifies reviewers.",
  "run-script":
    "Stave runs an action from the workspace's scripts (Settings → Repositories → Scripts) and waits for it. It fails the stage when the script exits with an error; the last web address it prints, such as a preview URL, becomes evidence.",
} as const;

const ROLE_OPTIONS = [
  { value: "none", label: "Regular", description: "An ordinary stage." },
  { value: "plan", label: "Plans", description: "Writes the plan; the next stage can wait for your sign-off." },
  { value: "publish", label: "Publishes", description: "Writes outside the repository, such as a message or a ticket." },
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
        text: `Stave action · ${repairAttempts ? `up to ${repairAttempts} ${repairAttempts === 1 ? "repair" : "repairs"}` : "no repairs"} · ${timeoutMinutes}m timeout`,
        missing: false,
      };
    }
    if (stage.action.type === "run-script") {
      return { text: `Stave action · runs “${stage.action.scriptId}”`, missing: false };
    }
    return { text: "Stave action", missing: false };
  }
  if (!stage.instruction.trim()) return { text: "Add an instruction", missing: true };
  return { text: stage.instruction, missing: false };
}

/** Issue paths a stage's own fields show beside themselves; the row lists every other one. */
function placedIssuePaths(stage: WorkflowStage): ReadonlySet<string> {
  if (stage.kind === "ai") return new Set(["title", "instruction", "doneWhen"]);
  return new Set(stage.action.type === "run-script" ? ["title", "action.scriptId"] : ["title"]);
}

export function StageRow(props: StageRowProps) {
  const { stage, index, count } = props;
  const bodyId = useId();
  const preview = previewOf(stage);
  const placed = placedIssuePaths(stage);
  // Stage-wide issues (order, duplicate id) and fields without a control of their own.
  const rowIssues = [...props.issues].filter(([path]) => !placed.has(path));
  const first = index === 0;
  const askLabel = first
    ? "The first stage starts with the run"
    : props.asksFirst
      ? "Asks you before it starts — click to start automatically"
      : "Starts automatically — click to ask you first";
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
      aria-label={`Stage ${index + 1}: ${stage.title}`}
    >
      <div className={sx(styles.stageHead)}>
        <Button
          variant="quiet"
          size="iconSm"
          iconOnly
          press="none"
          aria-label={`Reorder ${stage.title}. Alt plus arrow keys move it.`}
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
        <span className={sx(styles.kind, stage.kind === "action" && styles.kindAction)} title={stage.kind === "ai" ? "AI stage" : "Stave action"}>
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
            aria-label={`Stage ${index + 1} name`}
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
              aria-label={first ? "Starts with the run" : "Ask me before this stage"}
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
            aria-label={props.expanded ? `Collapse ${stage.title}` : `Edit ${stage.title}`}
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
              <Button variant="quiet" size="iconSm" iconOnly aria-label={`More actions for ${stage.title}`}>
                <Ellipsis aria-hidden />
              </Button>
            }
            groups={[
              {
                items: [
                  { label: "Move up", icon: <ArrowUp />, disabled: index === 0, onSelect: () => props.onMove(index - 1) },
                  {
                    label: "Move down",
                    icon: <ArrowDown />,
                    disabled: index === count - 1,
                    onSelect: () => props.onMove(index + 1),
                  },
                  ...(stage.kind === "ai" ? [{ label: "Duplicate", icon: <Copy />, onSelect: props.onDuplicate }] : []),
                ],
              },
              {
                items: [
                  {
                    label: "Delete stage",
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
  const { stage } = props;
  const role: RoleValue = stage.role ?? "none";
  return (
    <>
      <Textarea
        label="Instruction"
        description="What the agent does in this stage."
        value={stage.instruction}
        maxLength={WORKFLOW_LIMITS.instruction}
        autoResize
        maxRows={10}
        size="sm"
        error={props.issues.get("instruction")}
        onChange={(event) => props.onChange({ ...stage, instruction: event.target.value })}
      />
      <Textarea
        label="Done when"
        description="A condition the agent can check before it reports the stage done."
        value={stage.doneWhen}
        maxLength={WORKFLOW_LIMITS.doneWhen}
        autoResize
        maxRows={6}
        size="sm"
        error={props.issues.get("doneWhen")}
        onChange={(event) => props.onChange({ ...stage, doneWhen: event.target.value })}
      />
      <div className={sx(styles.propertyValue)}>
        <span className={sx(styles.propertyLabel)}>Role</span>
        <Segmented
          aria-label="Stage role"
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
  const scripts = useWorkspaceScriptActions();
  const set = (scriptId: string) => props.onChange({ ...props.stage, action: { ...props.action, scriptId } });
  return (
    <div className={sx(styles.propertyValue)}>
      <TextField
        size="sm"
        label="Script"
        description="The id of a script action, such as “preview”. Each workspace runs its own .stave/scripts.json."
        value={props.action.scriptId}
        maxLength={120}
        error={props.error}
        onChange={(event) => set(event.target.value)}
      />
      {scripts.length > 0 ? (
        <span className={sx(styles.chips)}>
          <span className={sx(styles.hint)}>In this workspace:</span>
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
  const { stage } = props;
  const action = stage.action;
  return (
    <>
      <p className={sx(styles.hint)}>{ACTION_DESCRIPTIONS[action.type]}</p>
      {action.type === "watch-checks" ? (
        <div className={sx(styles.properties)}>
          <span className={sx(styles.propertyLabel)}>Repairs</span>
          <div className={sx(styles.propertyValue)}>
            <Segmented
              aria-label="Repair attempts"
              size="xs"
              value={String(action.repairAttempts) as "0" | "1" | "2" | "3"}
              options={[
                { value: "0", label: "None" },
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
            <p className={sx(styles.hint)}>Each repair is an agent turn and counts toward the run's turn limit.</p>
          </div>
          <span className={sx(styles.propertyLabel)}>Give up after</span>
          <div className={sx(styles.propertyValue)}>
            <Segmented
              aria-label="Checks timeout"
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
            <p className={sx(styles.hint)}>A check still pending after this stops the run with a note.</p>
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
