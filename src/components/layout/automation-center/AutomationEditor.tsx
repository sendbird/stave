import { CalendarClock, Check, ShieldCheck, SlidersHorizontal, Zap } from "lucide-react";
import { useMemo } from "react";
import { ProviderModelPicker } from "@/components/session/ProviderModelPicker";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@/components/ui";
import { RoutineInformationResourceCreator } from "@/components/layout/RoutineInformationResourceCreator";
import { ChoiceButtons } from "@/components/layout/settings-dialog.shared";
import { WorkspaceInformationReferenceChip } from "@/components/workspace-information-reference-chip";
import {
  clampModelEffort,
  listModelEffortOptions,
  resolveDefaultModelEffort,
} from "@/lib/providers/model-effort";
import {
  CLAUDE_PERMISSION_MODE_OPTIONS,
  CODEX_APPROVAL_POLICY_OPTIONS,
  CODEX_SANDBOX_MODE_OPTIONS,
  CODEX_WEB_SEARCH_OPTIONS,
} from "@/lib/providers/runtime-option-contract";
import {
  applyRoutineCadencePreset,
  applyAutomationTrustPolicyToRuntime,
  automationPermissionModeToTrustPolicy,
  automationTrustPolicyToPermissionMode,
  AUTOMATION_PERMISSION_MODES,
  AUTOMATION_PERMISSION_MODE_PRESENTATION,
  computeNextRoutineRunAt,
  createDefaultRoutineRuntime,
  detectRoutineCadencePreset,
  formatAutomationRuntimePermissions,
  formatRoutineSchedule,
  formatRoutineScheduleTime,
  getRoutineInformationReferenceKey,
  getRoutineScheduleWeekdays,
  ROUTINE_CADENCE_PRESETS,
  ROUTINE_CADENCE_PRESENTATION,
  ROUTINE_WEEKDAY_LABELS,
  type AutomationPermissionMode,
  type RoutineCadencePreset,
  type RoutineRuntimeConfig,
  type RoutineUpsertInput,
} from "@/lib/routines";
import type { WorkspaceInformationReferenceOption } from "@/lib/workspace-information-references";
import { cn } from "@/lib/utils";
import {
  applyRoutineScheduleUnit,
  formatRelativeTime,
  parseRoutineScheduleTime,
  type RoutineEnvironmentOption,
} from "./automation-center.utils";

const PERMISSION_MODE_ICON: Record<
  AutomationPermissionMode,
  typeof ShieldCheck
> = {
  auto: Zap,
  guided: ShieldCheck,
  manual: SlidersHorizontal,
};

function SectionHeading(props: {
  title: string;
  description?: string;
  detail?: string;
}) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {props.title}
        </h3>
        {props.detail ? (
          <span className="text-[10px] text-muted-foreground">
            {props.detail}
          </span>
        ) : null}
      </div>
      {props.description ? (
        <p className="text-[11px] leading-4 text-muted-foreground">
          {props.description}
        </p>
      ) : null}
    </div>
  );
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

function RuntimeSwitch(props: {
  label: string;
  description?: string;
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
      <span className="min-w-0">
        <span className="block text-xs text-foreground">{props.label}</span>
        {props.description ? (
          <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
            {props.description}
          </span>
        ) : null}
      </span>
      <Switch
        aria-label={props.label}
        checked={props.checked}
        onCheckedChange={props.onCheckedChange}
      />
    </div>
  );
}

function CadenceSection(props: {
  draft: RoutineUpsertInput;
  onDraftChange: (draft: RoutineUpsertInput) => void;
}) {
  const { draft } = props;
  const preset = detectRoutineCadencePreset({
    schedule: draft.schedule,
    enabled: draft.enabled,
  });
  const weekdays = getRoutineScheduleWeekdays(draft.schedule);
  const showTime =
    draft.enabled &&
    (draft.schedule.unit === "days" || draft.schedule.unit === "weeks");
  const showWeekdayPicker =
    draft.enabled &&
    draft.schedule.unit === "weeks" &&
    (preset === "weekly" || preset === "custom");
  const showIntervalFields = draft.enabled && preset === "custom";
  const nextRunAt = useMemo(() => {
    if (!draft.enabled) {
      return null;
    }
    try {
      return computeNextRoutineRunAt({
        schedule: draft.schedule,
        after: new Date(),
      });
    } catch {
      return null;
    }
  }, [draft.enabled, draft.schedule]);

  function selectPreset(next: RoutineCadencePreset) {
    const applied = applyRoutineCadencePreset({
      preset: next,
      schedule: draft.schedule,
      enabled: draft.enabled,
    });
    props.onDraftChange({
      ...draft,
      schedule: applied.schedule,
      enabled: applied.enabled,
    });
  }

  function toggleWeekday(weekday: number) {
    const at = draft.schedule.at ?? { hour: 9, minute: 0 };
    const next = weekdays.includes(weekday)
      ? weekdays.filter((candidate) => candidate !== weekday)
      : [...weekdays, weekday].sort((left, right) => left - right);
    if (next.length === 0) {
      // A week schedule with no day anchor falls back to a plain interval.
      const { weekday: _weekday, weekdays: _weekdays, ...rest } = draft.schedule;
      props.onDraftChange({ ...draft, schedule: { ...rest, at } });
      return;
    }
    props.onDraftChange({
      ...draft,
      schedule: {
        every: draft.schedule.every,
        unit: "weeks",
        at,
        weekdays: next,
      },
    });
  }

  return (
    <section className="grid gap-3">
      <SectionHeading
        title="Cadence"
        description="Pick a common rhythm, or switch to Custom for an exact interval."
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cadence">
        {ROUTINE_CADENCE_PRESETS.map((candidate) => {
          const active = candidate === preset;
          return (
            <Button
              key={candidate}
              type="button"
              size="sm"
              variant={active ? "secondary" : "ghost"}
              aria-pressed={active}
              title={ROUTINE_CADENCE_PRESENTATION[candidate].detail}
              className={cn(
                "h-7 rounded-full border border-transparent px-2.5 text-[11px]",
                active
                  ? "border-primary/45 bg-primary/10 text-foreground"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
              onClick={() => selectPreset(candidate)}
            >
              {active ? <Check className="size-3" aria-hidden="true" /> : null}
              {ROUTINE_CADENCE_PRESENTATION[candidate].label}
            </Button>
          );
        })}
      </div>

      {showIntervalFields ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2">
          <FormLabel label="Every">
            <Input
              type="number"
              min={1}
              max={999}
              value={draft.schedule.every}
              onChange={(event) =>
                props.onDraftChange({
                  ...draft,
                  schedule: {
                    ...draft.schedule,
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
              value={draft.schedule.unit}
              onValueChange={(unit) =>
                props.onDraftChange({
                  ...draft,
                  schedule: applyRoutineScheduleUnit(
                    draft.schedule,
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
      ) : null}

      {showWeekdayPicker ? (
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-foreground">Days</span>
          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label="Run days"
          >
            {ROUTINE_WEEKDAY_LABELS.map((label, weekday) => {
              const active = weekdays.includes(weekday);
              return (
                <Button
                  key={label}
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-pressed={active}
                  aria-label={label}
                  className={cn(
                    "h-7 w-10 border px-0 text-[11px]",
                    active
                      ? "border-primary/45 bg-primary/10 text-foreground"
                      : "border-border/60 text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => toggleWeekday(weekday)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}

      {showTime ? (
        <FormLabel
          label="Start time"
          description="Local wall-clock time. Runs keep this time across daylight saving changes."
        >
          <Input
            type="time"
            value={
              draft.schedule.at
                ? formatRoutineScheduleTime(draft.schedule.at)
                : ""
            }
            onChange={(event) => {
              const at = parseRoutineScheduleTime(event.target.value);
              if (at) {
                props.onDraftChange({
                  ...draft,
                  schedule: { ...draft.schedule, at },
                });
                return;
              }
              // Clearing the time also clears day anchors — a weekday without a
              // time is not a valid schedule.
              const {
                at: _at,
                weekday: _weekday,
                weekdays: _weekdays,
                ...rest
              } = draft.schedule;
              props.onDraftChange({ ...draft, schedule: rest });
            }}
            className="h-8 w-40 text-xs"
          />
        </FormLabel>
      ) : null}

      <div className="flex items-start gap-2 rounded-md border border-border/60 bg-surface/40 px-2.5 py-2 text-[11px] text-muted-foreground">
        <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {draft.enabled ? (
            <>
              <span className="text-foreground">
                {formatRoutineSchedule(draft.schedule)}
              </span>
              {nextRunAt ? ` · next run ${formatRelativeTime(nextRunAt)}` : ""}
            </>
          ) : (
            <span className="text-foreground">
              Manual only — this automation runs when you press Run now.
            </span>
          )}
        </span>
      </div>
    </section>
  );
}

function PermissionSection(props: {
  draft: RoutineUpsertInput;
  onDraftChange: (draft: RoutineUpsertInput) => void;
}) {
  const { draft } = props;
  const mode = automationTrustPolicyToPermissionMode(draft.trustPolicy);
  const runtime = draft.runtime;

  function selectMode(next: AutomationPermissionMode) {
    const trustPolicy = automationPermissionModeToTrustPolicy(next);
    props.onDraftChange({
      ...draft,
      trustPolicy,
      runtime: applyAutomationTrustPolicyToRuntime(draft.runtime, trustPolicy),
    });
  }

  function updateRuntime(next: RoutineRuntimeConfig) {
    props.onDraftChange({
      ...draft,
      runtime: applyAutomationTrustPolicyToRuntime(next, draft.trustPolicy),
    });
  }

  return (
    <section className="grid gap-3">
      <SectionHeading
        title="Permissions"
        description="How much this automation may do on its own while it runs unattended."
      />
      <div className="grid gap-1.5" role="radiogroup" aria-label="Permissions">
        {AUTOMATION_PERMISSION_MODES.map((candidate) => {
          const presentation =
            AUTOMATION_PERMISSION_MODE_PRESENTATION[candidate];
          const Icon = PERMISSION_MODE_ICON[candidate];
          const active = candidate === mode;
          return (
            <button
              key={candidate}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => selectMode(candidate)}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors",
                active
                  ? "border-primary/50 bg-primary/8"
                  : "border-border/70 hover:bg-muted/60",
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {presentation.label}
                  </span>
                  <Badge
                    variant="outline"
                    className="h-4 border-border/70 px-1 text-[9px] font-normal text-muted-foreground"
                  >
                    {presentation.summary}
                  </Badge>
                  {candidate === "guided" ? (
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                      Recommended
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                  {presentation.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {mode === "manual" ? (
        <div className="grid gap-2 rounded-md border border-border/70 bg-surface/30 p-2.5">
          {runtime.provider === "claude-code" ? (
            <>
              <FormLabel label="Permission mode">
                <Select
                  value={runtime.permissionMode}
                  onValueChange={(permissionMode) =>
                    updateRuntime({
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
                    {CLAUDE_PERMISSION_MODE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormLabel>
              <RuntimeSwitch
                label="Sandbox"
                checked={runtime.sandboxEnabled}
                onCheckedChange={(sandboxEnabled) =>
                  updateRuntime({ ...runtime, sandboxEnabled })
                }
              />
              <RuntimeSwitch
                label="Allow unsandboxed commands"
                checked={runtime.allowUnsandboxedCommands}
                onCheckedChange={(allowUnsandboxedCommands) =>
                  updateRuntime({ ...runtime, allowUnsandboxedCommands })
                }
              />
              <RuntimeSwitch
                label="Dangerously skip permissions"
                description="Removes every Claude permission check for this automation."
                checked={runtime.allowDangerouslySkipPermissions}
                onCheckedChange={(allowDangerouslySkipPermissions) =>
                  updateRuntime({
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
                <FormLabel label="Approvals">
                  <Select
                    value={runtime.approvalPolicy}
                    onValueChange={(approvalPolicy) =>
                      updateRuntime({
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
                      {CODEX_APPROVAL_POLICY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormLabel>
                <FormLabel label="File access">
                  <Select
                    value={runtime.fileAccess}
                    onValueChange={(fileAccess) =>
                      updateRuntime({
                        ...runtime,
                        fileAccess: fileAccess as typeof runtime.fileAccess,
                      })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CODEX_SANDBOX_MODE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormLabel>
              </div>
              <FormLabel label="Web search">
                <Select
                  value={runtime.webSearch}
                  onValueChange={(webSearch) =>
                    updateRuntime({
                      ...runtime,
                      webSearch: webSearch as typeof runtime.webSearch,
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CODEX_WEB_SEARCH_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormLabel>
              <RuntimeSwitch
                label="Network access"
                checked={runtime.networkAccess}
                onCheckedChange={(networkAccess) =>
                  updateRuntime({ ...runtime, networkAccess })
                }
              />
            </>
          )}
        </div>
      ) : null}

      <p className="rounded-md bg-muted/40 px-2.5 py-2 font-mono text-[10px] leading-4 text-muted-foreground">
        {formatAutomationRuntimePermissions(runtime)}
      </p>
    </section>
  );
}

export function AutomationEditor(props: {
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
  const runtime = props.draft.runtime;
  // Same source of truth the settings dialog and every launcher use, so the
  // labels read "X-High" instead of "xhigh" and a model that caps below the
  // top tier (e.g. GPT-5.6 Luna has no "ultra") never offers it here.
  const effortOptions = listModelEffortOptions({
    providerId: runtime.provider,
    model: runtime.model,
  });

  function applyModel(model: string) {
    props.onDraftChange({
      ...props.draft,
      runtime: {
        ...runtime,
        model,
        // A carried-over effort can be unsupported by the incoming model, so
        // step it down instead of persisting a value the runtime would reject.
        effort: clampModelEffort({
          providerId: runtime.provider,
          model,
          effort: runtime.effort,
          fallback: resolveDefaultModelEffort({
            providerId: runtime.provider,
            model,
          }),
        }),
      } as RoutineRuntimeConfig,
    });
  }

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
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-5 py-3">
        <div className="min-w-0">
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

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto grid max-w-3xl gap-6">
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

          <CadenceSection
            draft={props.draft}
            onDraftChange={props.onDraftChange}
          />

          <PermissionSection
            draft={props.draft}
            onDraftChange={props.onDraftChange}
          />

          <section className="grid gap-3">
            <SectionHeading title="Model" />
            <ProviderModelPicker
              selectedProvider={runtime.provider}
              selectedModel={runtime.model}
              onProviderChange={(provider) =>
                props.onDraftChange({
                  ...props.draft,
                  runtime: applyAutomationTrustPolicyToRuntime(
                    createDefaultRoutineRuntime(provider),
                    props.draft.trustPolicy,
                  ),
                })
              }
              onModelChange={applyModel}
              providerSelectClassName="w-[118px] shrink-0"
            />
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">
                Effort
              </span>
              <span className="text-[11px] leading-4 text-muted-foreground">
                Higher effort spends more model budget on reasoning and
                increases each run&apos;s latency.
              </span>
              <ChoiceButtons
                aria-label="Effort"
                value={runtime.effort}
                options={effortOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={(effort) =>
                  props.onDraftChange({
                    ...props.draft,
                    runtime: {
                      ...runtime,
                      effort,
                    } as RoutineRuntimeConfig,
                  })
                }
              />
            </div>
            <FormLabel
              label="Concurrent runs"
              description="Occurrences beyond the limit are recorded as skipped."
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
                className="h-8 w-28 text-xs"
              />
            </FormLabel>
          </section>

          <section className="grid gap-3">
            <SectionHeading
              title="Repository"
              description="The provider always runs from this repository root in its Default Workspace."
            />
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
            {props.draft.environment.path ? (
              <div className="truncate rounded-md bg-muted/60 px-2.5 py-2 font-mono text-[10px] text-muted-foreground">
                {props.draft.environment.path}
              </div>
            ) : null}
          </section>

          <section className="grid gap-3">
            <SectionHeading
              title="Information resources"
              detail={`${props.draft.informationReferences.length} attached`}
              description="Each resource is created in the repository's Default Workspace, attached immediately, and resolved again on every run."
            />
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
