import {
  AlertCircle,
  Clock3,
  Copy,
  ListChecks,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  SquareTerminal,
  Trash2,
  Workflow,
} from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ProviderModelPicker } from "@/components/session/ProviderModelPicker";
import {
  Badge,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  toast,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { RoutineInformationResourceCreator } from "@/components/layout/RoutineInformationResourceCreator";
import { WorkspaceInformationReferenceChip } from "@/components/workspace-information-reference-chip";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  AUTOMATION_TRUST_POLICIES,
  createDefaultRoutineRuntime,
  formatRoutineSchedule,
  formatRoutineScheduleTime,
  getRoutineInformationReferenceKey,
  ROUTINE_WEEKDAY_LABELS,
  RoutineUpsertInputSchema,
  type AutomationTrustPolicy,
  type RoutineEnvironmentInput,
  type RoutineRun,
  type RoutineRuntimeConfig,
  type RoutineSchedule,
  type RoutineSnapshot,
  type RoutineSpec,
  type RoutineUpsertInput,
} from "@/lib/routines";
import type { WorkspaceInformationReferenceOption } from "@/lib/workspace-information-references";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  resolveCurrentProjectDefaultWorkspaceId,
  type RecentProjectState,
} from "@/store/project.utils";
import { useAppStore } from "@/store/app.store";
import { cn } from "@/lib/utils";
import { WORKSPACE_TOOLS_LABEL } from "@/lib/workspace-scripts/constants";

interface RoutineEnvironmentOption {
  value: string;
  workspaceId: string;
  path: string;
  projectPath: string;
  label: string;
}

type RoutineProjectSource = Pick<
  RecentProjectState,
  | "projectPath"
  | "projectName"
  | "workspaces"
  | "workspacePathById"
  | "workspaceDefaultById"
>;

function getRoutineErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function buildEnvironmentOptions(args: {
  recentProjects: RecentProjectState[];
  activeProject: RoutineProjectSource | null;
}) {
  const options = new Map<string, RoutineEnvironmentOption>();
  const addProject = (project: RoutineProjectSource) => {
    const workspaceId = resolveCurrentProjectDefaultWorkspaceId({
      projectPath: project.projectPath,
      workspaces: project.workspaces,
      workspaceDefaultById: project.workspaceDefaultById,
      workspacePathById: project.workspacePathById,
    });
    options.set(project.projectPath, {
      value: `repository:${project.projectPath}`,
      workspaceId,
      path: project.projectPath,
      projectPath: project.projectPath,
      label: project.projectName,
    });
  };
  args.recentProjects.forEach(addProject);
  if (args.activeProject) {
    addProject(args.activeProject);
  }
  return [...options.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

function createRoutineDraft(
  environment: RoutineEnvironmentInput | null,
): RoutineUpsertInput {
  return {
    name: "",
    prompt: "",
    enabled: true,
    schedule: {
      every: 1,
      unit: "days",
    },
    environment: environment ?? {
      kind: "repository",
      workspaceId: "",
      path: "",
      projectPath: "",
      label: "",
    },
    runtime: createDefaultRoutineRuntime("codex"),
    trustPolicy: "review-required",
    maxConcurrentRuns: 1,
    informationReferences: [],
  };
}

const ROUTINE_ANY_WEEKDAY = "any";
const DEFAULT_ROUTINE_START_TIME = { hour: 9, minute: 0 } as const;

function parseRoutineScheduleTime(value: string) {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return { hour, minute };
}

function applyRoutineScheduleUnit(
  schedule: RoutineSchedule,
  unit: RoutineSchedule["unit"],
): RoutineSchedule {
  if (unit === "minutes" || unit === "hours") {
    return { every: schedule.every, unit };
  }
  if (unit === "days") {
    return {
      every: schedule.every,
      unit,
      ...(schedule.at ? { at: schedule.at } : {}),
    };
  }
  return {
    every: schedule.every,
    unit,
    ...(schedule.at ? { at: schedule.at } : {}),
    ...(schedule.at && schedule.weekday !== undefined
      ? { weekday: schedule.weekday }
      : {}),
  };
}

function routineToDraft(routine: RoutineSpec): RoutineUpsertInput {
  return {
    name: routine.name,
    prompt: routine.prompt,
    enabled: routine.enabled,
    schedule: routine.schedule,
    environment: routine.environment,
    runtime: routine.runtime,
    trustPolicy: routine.trustPolicy,
    maxConcurrentRuns: routine.maxConcurrentRuns,
    informationReferences: routine.informationReferences,
  };
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getRunStatusPresentation(status: RoutineRun["status"]) {
  switch (status) {
    case "completed":
      return {
        label: "Completed",
        className: "border-success/40 bg-success/10 text-success",
      };
    case "failed":
      return {
        label: "Failed",
        className: "border-destructive/40 bg-destructive/10 text-destructive",
      };
    case "waiting":
      return {
        label: "Waiting",
        className: "border-warning/50 bg-warning/10 text-warning",
      };
    case "skipped":
      return {
        label: "Skipped",
        className: "border-border bg-muted text-muted-foreground",
      };
    default:
      return {
        label: "Running",
        className: "border-primary/40 bg-primary/10 text-primary",
      };
  }
}

const AUTOMATION_TRUST_PRESENTATION: Record<
  AutomationTrustPolicy,
  { label: string; description: string }
> = {
  "review-required": {
    label: "Review required",
    description:
      "Sensitive provider actions use the strict approval path and can wait for you.",
  },
  "workspace-trusted": {
    label: "Workspace policy",
    description:
      "Inherit the provider permissions configured for this automation.",
  },
  unattended: {
    label: "Unattended",
    description:
      "Avoid interactive approval prompts while preserving the configured sandbox and file access.",
  },
};

function formatAutomationTrustPolicy(policy: AutomationTrustPolicy) {
  return AUTOMATION_TRUST_PRESENTATION[policy].label;
}

function FormLabel(props: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-foreground">{props.label}</span>
      {props.description ? (
        <span className="text-[11px] leading-4 text-muted-foreground">
          {props.description}
        </span>
      ) : null}
      {props.children}
    </label>
  );
}

function RuntimeFields(props: {
  runtime: RoutineRuntimeConfig;
  onChange: (runtime: RoutineRuntimeConfig) => void;
}) {
  const { runtime } = props;
  return (
    <div className="grid gap-3">
      <ProviderModelPicker
        selectedProvider={runtime.provider}
        selectedModel={runtime.model}
        onProviderChange={(provider) =>
          props.onChange(createDefaultRoutineRuntime(provider))
        }
        onModelChange={(model) =>
          props.onChange({ ...runtime, model } as RoutineRuntimeConfig)
        }
        providerSelectClassName="w-[118px] shrink-0"
      />

      {runtime.provider === "claude-code" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <FormLabel label="Effort">
              <Select
                value={runtime.effort}
                onValueChange={(effort) =>
                  props.onChange({
                    ...runtime,
                    effort: effort as typeof runtime.effort,
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["low", "medium", "high", "xhigh", "max"].map((effort) => (
                    <SelectItem key={effort} value={effort}>
                      {effort}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormLabel>
            <FormLabel label="Permission">
              <Select
                value={runtime.permissionMode}
                onValueChange={(permissionMode) =>
                  props.onChange({
                    ...runtime,
                    permissionMode:
                      permissionMode as typeof runtime.permissionMode,
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "default",
                    "acceptEdits",
                    "bypassPermissions",
                    "plan",
                    "dontAsk",
                    "auto",
                  ].map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {mode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormLabel>
          </div>
          <RuntimeSwitch
            label="Sandbox"
            checked={runtime.sandboxEnabled}
            onCheckedChange={(sandboxEnabled) =>
              props.onChange({ ...runtime, sandboxEnabled })
            }
          />
          <RuntimeSwitch
            label="Allow unsandboxed commands"
            checked={runtime.allowUnsandboxedCommands}
            onCheckedChange={(allowUnsandboxedCommands) =>
              props.onChange({ ...runtime, allowUnsandboxedCommands })
            }
          />
          <RuntimeSwitch
            label="Dangerously skip permissions"
            checked={runtime.allowDangerouslySkipPermissions}
            onCheckedChange={(allowDangerouslySkipPermissions) =>
              props.onChange({
                ...runtime,
                allowDangerouslySkipPermissions,
              })
            }
            warning
          />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <FormLabel label="Effort">
              <Select
                value={runtime.effort}
                onValueChange={(effort) =>
                  props.onChange({
                    ...runtime,
                    effort: effort as typeof runtime.effort,
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["low", "medium", "high", "xhigh", "max", "ultra"].map(
                    (effort) => (
                      <SelectItem key={effort} value={effort}>
                        {effort}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </FormLabel>
            <FormLabel label="Approvals">
              <Select
                value={runtime.approvalPolicy}
                onValueChange={(approvalPolicy) =>
                  props.onChange({
                    ...runtime,
                    approvalPolicy:
                      approvalPolicy as typeof runtime.approvalPolicy,
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["never", "on-request", "on-failure", "untrusted"].map(
                    (policy) => (
                      <SelectItem key={policy} value={policy}>
                        {policy}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </FormLabel>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FormLabel label="File access">
              <Select
                value={runtime.fileAccess}
                onValueChange={(fileAccess) =>
                  props.onChange({
                    ...runtime,
                    fileAccess: fileAccess as typeof runtime.fileAccess,
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["read-only", "workspace-write", "danger-full-access"].map(
                    (access) => (
                      <SelectItem key={access} value={access}>
                        {access}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </FormLabel>
            <FormLabel label="Web search">
              <Select
                value={runtime.webSearch}
                onValueChange={(webSearch) =>
                  props.onChange({
                    ...runtime,
                    webSearch: webSearch as typeof runtime.webSearch,
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["disabled", "cached", "live"].map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {mode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormLabel>
          </div>
          <RuntimeSwitch
            label="Network access"
            checked={runtime.networkAccess}
            onCheckedChange={(networkAccess) =>
              props.onChange({ ...runtime, networkAccess })
            }
          />
        </>
      )}
    </div>
  );
}

function RuntimeSwitch(props: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  warning?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border border-border/70 px-2.5 py-2",
        props.warning && props.checked && "border-warning/50 bg-warning/10",
      )}
    >
      <span className="text-xs text-foreground">{props.label}</span>
      <Switch
        aria-label={props.label}
        checked={props.checked}
        onCheckedChange={props.onCheckedChange}
      />
    </div>
  );
}

function RoutineEditor(props: {
  routineId: string | null;
  draft: RoutineUpsertInput;
  environmentOptions: RoutineEnvironmentOption[];
  informationOptions: WorkspaceInformationReferenceOption[];
  informationLoading: boolean;
  saving: boolean;
  onDraftChange: (draft: RoutineUpsertInput) => void;
  onInformationCreated: (option: WorkspaceInformationReferenceOption) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const environmentValue = props.draft.environment.projectPath
    ? `repository:${props.draft.environment.projectPath}`
    : "";
  const selectedReferenceKeys = new Set(
    props.draft.informationReferences.map(getRoutineInformationReferenceKey),
  );
  const informationOptionByKey = new Map(
    props.informationOptions.map((option) => [
      getRoutineInformationReferenceKey(option.reference),
      option,
    ]),
  );

  function attachInformationOption(
    option: WorkspaceInformationReferenceOption,
  ) {
    if (option.reference.section === "lens") {
      return;
    }
    const targetKey = getRoutineInformationReferenceKey(option.reference);
    if (selectedReferenceKeys.has(targetKey)) {
      return;
    }
    const reference = {
      ...option.reference,
      section: option.reference.section,
    } satisfies RoutineUpsertInput["informationReferences"][number];
    props.onDraftChange({
      ...props.draft,
      informationReferences: [...props.draft.informationReferences, reference],
    });
  }

  function removeInformationReference(
    reference: RoutineUpsertInput["informationReferences"][number],
  ) {
    const targetKey = getRoutineInformationReferenceKey(reference);
    props.onDraftChange({
      ...props.draft,
      informationReferences: props.draft.informationReferences.filter(
        (candidate) =>
          getRoutineInformationReferenceKey(candidate) !== targetKey,
      ),
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-foreground">
            {props.routineId ? "Edit automation" : "New automation"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Runs in a fresh task while the Stave desktop app is open.
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={props.onCancel}
            disabled={props.saving}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={props.onSave}
            disabled={props.saving}
          >
            {props.saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid gap-5">
          <section className="grid gap-3">
            <SectionHeading title="Task" />
            <FormLabel label="Name">
              <Input
                value={props.draft.name}
                onChange={(event) =>
                  props.onDraftChange({
                    ...props.draft,
                    name: event.target.value,
                  })
                }
                placeholder="Daily repository review"
                className="h-8 text-xs"
              />
            </FormLabel>
            <FormLabel
              label="Instructions"
              description="The complete prompt sent on every run."
            >
              <Textarea
                value={props.draft.prompt}
                onChange={(event) =>
                  props.onDraftChange({
                    ...props.draft,
                    prompt: event.target.value,
                  })
                }
                placeholder="Review changes since the last run and summarize risks."
                className="min-h-28 resize-y text-xs"
              />
            </FormLabel>
          </section>

          <section className="grid gap-3">
            <SectionHeading title="Schedule" />
            <RuntimeSwitch
              label="Scheduled runs"
              checked={props.draft.enabled}
              onCheckedChange={(enabled) =>
                props.onDraftChange({ ...props.draft, enabled })
              }
            />
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2">
              <FormLabel label="Every">
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={props.draft.schedule.every}
                  onChange={(event) =>
                    props.onDraftChange({
                      ...props.draft,
                      schedule: {
                        ...props.draft.schedule,
                        every: Math.max(
                          1,
                          Math.min(999, Number(event.target.value) || 1),
                        ),
                      },
                    })
                  }
                  className="h-8 text-xs"
                />
              </FormLabel>
              <FormLabel label="Unit">
                <Select
                  value={props.draft.schedule.unit}
                  onValueChange={(unit) =>
                    props.onDraftChange({
                      ...props.draft,
                      schedule: applyRoutineScheduleUnit(
                        props.draft.schedule,
                        unit as RoutineUpsertInput["schedule"]["unit"],
                      ),
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["minutes", "hours", "days", "weeks"].map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormLabel>
            </div>
            {props.draft.schedule.unit === "days" ||
            props.draft.schedule.unit === "weeks" ? (
              <div className="grid grid-cols-2 gap-2">
                {props.draft.schedule.unit === "weeks" ? (
                  <FormLabel label="Start day">
                    <Select
                      value={
                        props.draft.schedule.weekday !== undefined
                          ? String(props.draft.schedule.weekday)
                          : ROUTINE_ANY_WEEKDAY
                      }
                      onValueChange={(value) => {
                        const schedule = { ...props.draft.schedule };
                        if (value === ROUTINE_ANY_WEEKDAY) {
                          delete schedule.weekday;
                        } else {
                          schedule.weekday = Number(value);
                          schedule.at =
                            schedule.at ?? DEFAULT_ROUTINE_START_TIME;
                        }
                        props.onDraftChange({ ...props.draft, schedule });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ROUTINE_ANY_WEEKDAY}>
                          Any day
                        </SelectItem>
                        {ROUTINE_WEEKDAY_LABELS.map((label, weekday) => (
                          <SelectItem key={label} value={String(weekday)}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormLabel>
                ) : null}
                <FormLabel
                  label="Start time"
                  description="Optional. Runs at this local time."
                >
                  <Input
                    type="time"
                    value={
                      props.draft.schedule.at
                        ? formatRoutineScheduleTime(props.draft.schedule.at)
                        : ""
                    }
                    onChange={(event) => {
                      const at = parseRoutineScheduleTime(event.target.value);
                      const schedule = { ...props.draft.schedule };
                      if (at) {
                        schedule.at = at;
                      } else {
                        // Clearing the time also clears the day anchor —
                        // a weekday without a time is not a valid schedule.
                        delete schedule.at;
                        delete schedule.weekday;
                      }
                      props.onDraftChange({ ...props.draft, schedule });
                    }}
                    className="h-8 text-xs"
                  />
                </FormLabel>
              </div>
            ) : null}
          </section>

          <section className="grid gap-3">
            <SectionHeading title="Execution policy" />
            <FormLabel
              label="Trust policy"
              description={
                AUTOMATION_TRUST_PRESENTATION[props.draft.trustPolicy]
                  .description
              }
            >
              <Select
                value={props.draft.trustPolicy}
                onValueChange={(trustPolicy) =>
                  props.onDraftChange({
                    ...props.draft,
                    trustPolicy: trustPolicy as AutomationTrustPolicy,
                  })
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTOMATION_TRUST_POLICIES.map((policy) => (
                    <SelectItem key={policy} value={policy}>
                      {formatAutomationTrustPolicy(policy)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormLabel>
            <FormLabel
              label="Concurrent runs"
              description="Maximum active executions for this automation. Scheduled occurrences beyond the limit are recorded as skipped."
            >
              <Input
                type="number"
                min={1}
                max={8}
                value={props.draft.maxConcurrentRuns}
                onChange={(event) =>
                  props.onDraftChange({
                    ...props.draft,
                    maxConcurrentRuns: Math.max(
                      1,
                      Math.min(8, Number(event.target.value) || 1),
                    ),
                  })
                }
                className="h-9 text-xs"
              />
            </FormLabel>
          </section>

          <section className="grid gap-3">
            <SectionHeading title="Repository" />
            <FormLabel
              label="Repository"
              description="The provider always runs from this repository root in its Default Workspace."
            >
              <Select
                value={environmentValue}
                onValueChange={(value) => {
                  const selected = props.environmentOptions.find(
                    (option) => option.value === value,
                  );
                  if (!selected) {
                    return;
                  }
                  props.onDraftChange({
                    ...props.draft,
                    environment: {
                      kind: "repository",
                      workspaceId: selected.workspaceId,
                      path: selected.path,
                      projectPath: selected.projectPath,
                      label: selected.label,
                    },
                    informationReferences: [],
                  });
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select a repository" />
                </SelectTrigger>
                <SelectContent>
                  {props.environmentOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormLabel>
            {props.draft.environment.path ? (
              <div className="truncate rounded-md bg-muted/60 px-2.5 py-2 font-mono text-[10px] text-muted-foreground">
                {props.draft.environment.path}
              </div>
            ) : null}
          </section>

          <section className="grid gap-3">
            <SectionHeading title="Model and permissions" />
            <RuntimeFields
              runtime={props.draft.runtime}
              onChange={(runtime) =>
                props.onDraftChange({ ...props.draft, runtime })
              }
            />
          </section>

          <section className="grid gap-3">
            <SectionHeading
              title="Information resources"
              detail={`${props.draft.informationReferences.length} attached`}
            />
            <p className="text-[11px] leading-4 text-muted-foreground">
              Create each resource in the repository&apos;s Default Workspace.
              It is attached to this automation immediately and resolved again
              on every run.
            </p>
            {!props.draft.environment.workspaceId ? (
              <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                Select a repository before attaching Information.
              </div>
            ) : (
              <>
                <RoutineInformationResourceCreator
                  workspaceId={props.draft.environment.workspaceId}
                  repositoryLabel={props.draft.environment.label}
                  disabled={props.saving}
                  onCreated={(option) => {
                    props.onInformationCreated(option);
                    attachInformationOption(option);
                  }}
                />
                {props.informationLoading ? (
                  <div className="text-[10px] text-muted-foreground">
                    Refreshing Information resources…
                  </div>
                ) : null}
                {props.draft.informationReferences.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                    No Information attached yet. Add a resource above to create
                    its Default Workspace entry and attach it.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {props.draft.informationReferences.map((reference) => {
                      const key = getRoutineInformationReferenceKey(reference);
                      const option = informationOptionByKey.get(key);
                      return (
                        <div
                          key={key}
                          className="rounded-md border border-border/70 bg-muted/20 p-2.5"
                        >
                          <WorkspaceInformationReferenceChip
                            reference={reference}
                            compact
                            onRemove={() =>
                              removeInformationReference(reference)
                            }
                          />
                          <p className="mt-2 break-words text-[10px] leading-4 text-muted-foreground">
                            {option?.description ??
                              `Injects ${reference.label} into each run.`}
                          </p>
                          <div className="mt-1 break-all font-mono text-[9px] text-muted-foreground/80">
                            {reference.token}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function SectionHeading(props: { title: string; detail?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {props.title}
      </h3>
      {props.detail ? (
        <span className="text-[10px] text-muted-foreground">
          {props.detail}
        </span>
      ) : null}
    </div>
  );
}

function AutomationRunCard(props: {
  run: RoutineRun;
  automation?: RoutineSpec;
  onOpen: (run: RoutineRun) => void;
}) {
  const presentation = getRunStatusPresentation(props.run.status);
  return (
    <article className="rounded-lg border border-border/70 bg-background p-3 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {props.automation ? (
            <p className="truncate text-xs font-semibold text-foreground">
              {props.automation.name}
            </p>
          ) : null}
          <div className="mt-1 flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn("h-5 px-1.5 text-[9px]", presentation.className)}
            >
              {presentation.label}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {formatDateTime(props.run.startedAt)}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => void copyTextToClipboard(props.run.id)}
          aria-label="Copy execution ID"
          title="Copy execution ID"
        >
          <Copy className="size-3.5" />
        </Button>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-y border-border/60 py-2 text-[10px]">
        <Detail label="Execution">
          <span className="font-mono" title={props.run.id}>
            {props.run.id.slice(0, 8)}
          </span>
        </Detail>
        <Detail label="Config">
          <span className="font-mono">{props.run.configHash ?? "legacy"}</span>
        </Detail>
        <Detail label="Trust">
          {formatAutomationTrustPolicy(props.run.trustPolicy)}
        </Detail>
        <Detail label="Trigger">
          {props.run.trigger === "scheduled" ? "Schedule" : "Manual"}
        </Detail>
      </dl>

      {props.run.error ? (
        <p
          className={cn(
            "mt-3 text-[11px] leading-4",
            props.run.status === "skipped"
              ? "text-muted-foreground"
              : "text-destructive",
          )}
        >
          {props.run.error}
        </p>
      ) : props.run.resultPreview ? (
        <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-[11px] leading-4 text-foreground">
          {props.run.resultPreview}
        </p>
      ) : (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {props.run.status === "completed"
            ? "Completed without a text response. Open the task to inspect its tool output."
            : props.run.status === "waiting"
              ? "Waiting for approval or user input."
              : "The task is still running."}
        </p>
      )}
      {props.run.taskId ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 h-7 px-2 text-[10px]"
          onClick={() => props.onOpen(props.run)}
        >
          Open task result
        </Button>
      ) : null}
    </article>
  );
}

export function WorkspaceRoutinesPanel(props: { onRequestClose?: () => void }) {
  const [
    recentProjects,
    projectPath,
    projectName,
    workspaces,
    workspacePathById,
    workspaceDefaultById,
    activeWorkspaceId,
    flushActiveWorkspaceSnapshot,
    focusTaskAttention,
    setLayout,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.recentProjects,
          state.projectPath,
          state.projectName,
          state.workspaces,
          state.workspacePathById,
          state.workspaceDefaultById,
          state.activeWorkspaceId,
          state.flushActiveWorkspaceSnapshot,
          state.focusTaskAttention,
          state.setLayout,
        ] as const,
    ),
  );
  const [snapshot, setSnapshot] = useState<RoutineSnapshot>({
    routines: [],
    runs: [],
  });
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(
    null,
  );
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>();
  const [draft, setDraft] = useState<RoutineUpsertInput | null>(null);
  const [informationOptions, setInformationOptions] = useState<
    WorkspaceInformationReferenceOption[]
  >([]);
  const [informationLoading, setInformationLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyRoutineId, setBusyRoutineId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [deleteRoutine, setDeleteRoutine] = useState<RoutineSpec | null>(null);
  const [activeView, setActiveView] = useState<"automations" | "runs">(
    "automations",
  );

  const activeProject = useMemo(
    () =>
      projectPath && projectName
        ? {
            projectPath,
            projectName,
            workspaces,
            workspacePathById,
            workspaceDefaultById,
          }
        : null,
    [
      projectName,
      projectPath,
      workspaceDefaultById,
      workspacePathById,
      workspaces,
    ],
  );
  const environmentOptions = useMemo(
    () =>
      buildEnvironmentOptions({
        recentProjects,
        activeProject,
      }),
    [activeProject, recentProjects],
  );
  const defaultEnvironment = useMemo<RoutineEnvironmentInput | null>(() => {
    const active =
      environmentOptions.find((option) => option.projectPath === projectPath) ??
      environmentOptions[0];
    return active
      ? {
          kind: "repository",
          workspaceId: active.workspaceId,
          path: active.path,
          projectPath: active.projectPath,
          label: active.label,
        }
      : null;
  }, [environmentOptions, projectPath]);

  const loadSnapshot = useCallback(async (options?: { quiet?: boolean }) => {
    const list = window.api?.routines?.list;
    if (!list) {
      setLoading(false);
      setError("Automations are available in the Stave desktop app.");
      return;
    }
    if (!options?.quiet) {
      setLoading(true);
    }
    try {
      const result = await list();
      if (!result.ok) {
        setError(result.message ?? "Failed to load automations.");
        return;
      }
      setSnapshot(result.snapshot);
      setError("");
      setSelectedRoutineId((current) => {
        if (
          current &&
          result.snapshot.routines.some((routine) => routine.id === current)
        ) {
          return current;
        }
        return result.snapshot.routines[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(
        getRoutineErrorMessage(loadError, "Failed to load automations."),
      );
    } finally {
      if (!options?.quiet) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
    const interval = window.setInterval(() => {
      void loadSnapshot({ quiet: true });
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [loadSnapshot]);

  const informationWorkspaceId = draft?.environment.workspaceId ?? null;
  useEffect(() => {
    let cancelled = false;
    const listReferences = window.api?.routines?.listInformationReferences;
    if (!informationWorkspaceId || !listReferences) {
      setInformationOptions([]);
      setInformationLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setInformationLoading(true);
    void (async () => {
      if (informationWorkspaceId === activeWorkspaceId) {
        await flushActiveWorkspaceSnapshot({ sync: true });
      }
      return listReferences({ workspaceId: informationWorkspaceId });
    })()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setInformationOptions(result.ok ? result.options : []);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setInformationOptions([]);
          setError(
            getRoutineErrorMessage(
              loadError,
              "Failed to load Information resources.",
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInformationLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, flushActiveWorkspaceSnapshot, informationWorkspaceId]);

  const selectedRoutine =
    snapshot.routines.find((routine) => routine.id === selectedRoutineId) ??
    null;
  const selectedRuns = selectedRoutine
    ? snapshot.runs.filter((run) => run.routineId === selectedRoutine.id)
    : [];
  const selectedRoutineActiveRunCount = selectedRuns.filter(
    (run) => run.status === "running" || run.status === "waiting",
  ).length;
  const selectedRoutineHasActiveRun = selectedRoutineActiveRunCount > 0;
  const selectedRoutineAtConcurrencyLimit = selectedRoutine
    ? selectedRoutineActiveRunCount >= selectedRoutine.maxConcurrentRuns
    : false;

  function startCreate() {
    setActiveView("automations");
    setEditingRoutineId(null);
    setDraft(createRoutineDraft(defaultEnvironment));
  }

  function openCommandsAndProcesses() {
    setLayout({
      patch: {
        sidebarOverlayVisible: true,
        sidebarOverlayTab: "scripts",
      },
    });
    props.onRequestClose?.();
  }

  function startEdit(routine: RoutineSpec) {
    setEditingRoutineId(routine.id);
    setDraft(routineToDraft(routine));
  }

  function cancelEdit() {
    setEditingRoutineId(undefined);
    setDraft(null);
  }

  async function saveDraft() {
    if (!draft) {
      return;
    }
    const parsed = RoutineUpsertInputSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid automation.");
      return;
    }
    const api = window.api?.routines;
    if (
      (editingRoutineId && !api?.update) ||
      (!editingRoutineId && !api?.create)
    ) {
      toast.error("Automation service is unavailable.");
      return;
    }
    setSaving(true);
    try {
      const result = editingRoutineId
        ? await api!.update!({
            id: editingRoutineId,
            input: parsed.data,
          })
        : await api!.create!(parsed.data);
      if (!result.ok || !result.routine) {
        toast.error(result.message ?? "Failed to save automation.");
        return;
      }
      setSelectedRoutineId(result.routine.id);
      cancelEdit();
      await loadSnapshot();
      toast.success(
        editingRoutineId ? "Automation updated" : "Automation created",
      );
    } catch (saveError) {
      toast.error(
        getRoutineErrorMessage(saveError, "Failed to save automation."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function runNow(routine: RoutineSpec) {
    const api = window.api?.routines?.runNow;
    if (!api) {
      toast.error("Automation service is unavailable.");
      return;
    }
    setBusyRoutineId(routine.id);
    try {
      if (routine.environment.workspaceId === activeWorkspaceId) {
        await flushActiveWorkspaceSnapshot({ sync: true });
      }
      const result = await api({ id: routine.id });
      if (!result.ok || !result.run) {
        toast.error(result.message ?? "Failed to start automation.");
        return;
      }
      await loadSnapshot({ quiet: true });
      if (result.run.status === "failed") {
        toast.error(result.run.error ?? "Failed to start automation.");
        return;
      }
      toast.success("Automation started");
    } catch (runError) {
      toast.error(
        getRoutineErrorMessage(runError, "Failed to start automation."),
      );
    } finally {
      setBusyRoutineId(null);
    }
  }

  async function toggleEnabled(routine: RoutineSpec) {
    const api = window.api?.routines?.setEnabled;
    if (!api) {
      toast.error("Automation service is unavailable.");
      return;
    }
    setBusyRoutineId(routine.id);
    try {
      const result = await api({
        id: routine.id,
        enabled: !routine.enabled,
      });
      if (!result.ok) {
        toast.error(result.message ?? "Failed to update automation.");
        return;
      }
      await loadSnapshot({ quiet: true });
    } catch (updateError) {
      toast.error(
        getRoutineErrorMessage(updateError, "Failed to update automation."),
      );
    } finally {
      setBusyRoutineId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteRoutine) {
      return;
    }
    const api = window.api?.routines?.remove;
    if (!api) {
      toast.error("Automation service is unavailable.");
      return;
    }
    setBusyRoutineId(deleteRoutine.id);
    try {
      const result = await api({ id: deleteRoutine.id });
      if (!result.ok) {
        toast.error(result.message ?? "Failed to delete automation.");
        return;
      }
      setDeleteRoutine(null);
      await loadSnapshot();
      toast.success("Automation deleted");
    } catch (deleteError) {
      toast.error(
        getRoutineErrorMessage(deleteError, "Failed to delete automation."),
      );
    } finally {
      setBusyRoutineId(null);
    }
  }

  async function openRunResult(run: RoutineRun) {
    const routine = snapshot.routines.find(
      (candidate) => candidate.id === run.routineId,
    );
    if (!routine || !run.taskId) {
      return;
    }
    try {
      await focusTaskAttention({
        taskId: run.taskId,
        workspaceId: run.workspaceId,
        projectPath: run.projectPath,
        refreshFromPersistence: true,
      });
      const opened = useAppStore
        .getState()
        .tasks.some((task) => task.id === run.taskId);
      if (!opened) {
        // selectTask silently no-ops when the task is gone (for example runs
        // recorded before the task was persisted). Surface that instead of
        // leaving the click without any feedback.
        toast.error("This automation's task conversation could not be found.");
        return;
      }
      props.onRequestClose?.();
    } catch (openError) {
      toast.error(
        getRoutineErrorMessage(openError, "Failed to open task result."),
      );
    }
  }

  if (draft) {
    return (
      <RoutineEditor
        routineId={editingRoutineId ?? null}
        draft={draft}
        environmentOptions={environmentOptions}
        informationOptions={informationOptions}
        informationLoading={informationLoading}
        saving={saving}
        onDraftChange={setDraft}
        onInformationCreated={(option) => {
          const key = getRoutineInformationReferenceKey(option.reference);
          setInformationOptions((current) => [
            ...current.filter(
              (candidate) =>
                getRoutineInformationReferenceKey(candidate.reference) !== key,
            ),
            option,
          ]);
        }}
        onCancel={cancelEdit}
        onSave={() => void saveDraft()}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
        <div
          className="flex min-w-0 items-center gap-1"
          role="tablist"
          aria-label="Automation control views"
        >
          <Button
            variant={activeView === "automations" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            role="tab"
            aria-selected={activeView === "automations"}
            onClick={() => setActiveView("automations")}
          >
            <Workflow className="size-3.5" />
            Automations
            <span className="tabular-nums text-muted-foreground">
              {snapshot.routines.length}
            </span>
          </Button>
          <Button
            variant={activeView === "runs" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            role="tab"
            aria-selected={activeView === "runs"}
            onClick={() => setActiveView("runs")}
          >
            <ListChecks className="size-3.5" />
            Runs
            <span className="tabular-nums text-muted-foreground">
              {snapshot.runs.length}
            </span>
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={openCommandsAndProcesses}
            aria-label={`Open ${WORKSPACE_TOOLS_LABEL}`}
            title={WORKSPACE_TOOLS_LABEL}
          >
            <SquareTerminal className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => void loadSnapshot()}
            aria-label="Refresh automations"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
          {activeView === "automations" ? (
            <Button
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-xs"
              onClick={startCreate}
            >
              <Plus className="size-3.5" />
              New
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="m-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {loading &&
      snapshot.routines.length === 0 &&
      snapshot.runs.length === 0 ? (
        <div
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center"
          role="status"
          aria-live="polite"
        >
          <div className="grid size-20 place-items-center rounded-full bg-muted/45 ring-1 ring-border/70">
            <ThinkingOrb
              state="searching"
              size={64}
              theme="auto"
              aria-label="Loading automation center"
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Loading automation center
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Restoring workflows, execution policy, and run history.
            </p>
          </div>
        </div>
      ) : activeView === "runs" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {snapshot.runs.length === 0 ? (
            <Empty className="h-full border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListChecks />
                </EmptyMedia>
                <EmptyTitle>No automation runs yet</EmptyTitle>
                <EmptyDescription>
                  Every manual or scheduled execution appears here with its
                  immutable ID, config hash, trust policy, and result.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-2">
              {snapshot.runs.map((run) => (
                <AutomationRunCard
                  key={run.id}
                  run={run}
                  automation={snapshot.routines.find(
                    (routine) => routine.id === run.routineId,
                  )}
                  onOpen={(target) => void openRunResult(target)}
                />
              ))}
            </div>
          )}
        </div>
      ) : !loading && snapshot.routines.length === 0 ? (
        <Empty className="flex-1 border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Clock3 />
            </EmptyMedia>
            <EmptyTitle>No automations yet</EmptyTitle>
            <EmptyDescription>
              Schedule fresh-context agent work with its own model, trust
              policy, repository, and Information resources.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={startCreate}>
              <Plus className="size-4" />
              Create automation
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-2 border-b border-border/70 p-3">
            {snapshot.routines.map((routine) => {
              const active = routine.id === selectedRoutineId;
              const latestRun = snapshot.runs.find(
                (run) => run.routineId === routine.id,
              );
              return (
                <button
                  key={routine.id}
                  type="button"
                  onClick={() => setSelectedRoutineId(routine.id)}
                  className={cn(
                    "w-full rounded-md border p-2.5 text-left transition-colors",
                    active
                      ? "border-primary/50 bg-primary/8"
                      : "border-border/70 hover:bg-muted/60",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        routine.enabled ? "bg-success" : "bg-muted-foreground",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                      {routine.name}
                    </span>
                    {latestRun &&
                    (latestRun.status === "running" ||
                      latestRun.status === "waiting") ? (
                      <Badge
                        variant="outline"
                        className="h-5 px-1.5 text-[9px]"
                      >
                        {getRunStatusPresentation(latestRun.status).label}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>{formatRoutineSchedule(routine.schedule)}</span>
                    <span className="truncate">{routine.runtime.model}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedRoutine ? (
            <div className="grid gap-5 p-3">
              <section className="grid gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {selectedRoutine.name}
                    </h3>
                    <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                      {selectedRoutine.prompt}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => void runNow(selectedRoutine)}
                      disabled={
                        busyRoutineId === selectedRoutine.id ||
                        selectedRoutineAtConcurrencyLimit
                      }
                      aria-label="Run now"
                    >
                      <Play className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => startEdit(selectedRoutine)}
                      aria-label="Edit automation"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-md border border-border/70 p-2.5 text-[11px]">
                  <Detail label="Status">
                    {selectedRoutine.enabled ? "Scheduled" : "Paused"}
                  </Detail>
                  <Detail label="Next run">
                    {formatDateTime(selectedRoutine.nextRunAt)}
                  </Detail>
                  <Detail label="Repository">
                    {selectedRoutine.environment.label}
                  </Detail>
                  <Detail label="Resources">
                    {selectedRoutine.informationReferences.length}
                  </Detail>
                  <Detail label="Provider">
                    {selectedRoutine.runtime.provider === "codex"
                      ? "Codex"
                      : "Claude"}
                  </Detail>
                  <Detail label="Effort">
                    {selectedRoutine.runtime.effort}
                  </Detail>
                  <Detail label="Trust">
                    {formatAutomationTrustPolicy(selectedRoutine.trustPolicy)}
                  </Detail>
                  <Detail label="Concurrency">
                    {selectedRoutineActiveRunCount}/
                    {selectedRoutine.maxConcurrentRuns}
                  </Detail>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 gap-1.5 text-xs"
                    onClick={() => void toggleEnabled(selectedRoutine)}
                    disabled={busyRoutineId === selectedRoutine.id}
                  >
                    {selectedRoutine.enabled ? (
                      <>
                        <Pause className="size-3.5" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="size-3.5" />
                        Resume
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
                    onClick={() => setDeleteRoutine(selectedRoutine)}
                    disabled={selectedRoutineHasActiveRun}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </div>
              </section>

              <section className="grid gap-2">
                <SectionHeading
                  title="Run history"
                  detail={`${selectedRuns.length} runs`}
                />
                {selectedRuns.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                    No runs yet. Use Run now or wait for the next schedule.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {selectedRuns.map((run) => (
                      <AutomationRunCard
                        key={run.id}
                        run={run}
                        onOpen={(target) => void openRunResult(target)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteRoutine)}
        title="Delete automation"
        description={
          deleteRoutine
            ? `Delete "${deleteRoutine.name}" and its saved run history? Created task conversations remain in their workspaces.`
            : ""
        }
        confirmLabel="Delete"
        loading={Boolean(deleteRoutine && busyRoutineId === deleteRoutine.id)}
        onCancel={() => setDeleteRoutine(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function Detail(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
        {props.label}
      </div>
      <div className="truncate text-foreground">{props.children}</div>
    </div>
  );
}
