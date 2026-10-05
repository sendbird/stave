import { formatAutomationSchedule, formatAutomationRuntimePermissions, formatAutomationWeekday, getAutomationCadencePresetKeys, getAutomationPermissionModeKeys } from "@/lib/automation-presentation";
import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
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
import { AutomationInformationResourceCreator } from "@/components/layout/AutomationInformationResourceCreator";
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
  applyAutomationCadencePreset,
  applyAutomationTrustPolicyToRuntime,
  automationPermissionModeToTrustPolicy,
  automationTrustPolicyToPermissionMode,
  AUTOMATION_PERMISSION_MODES,
  computeNextAutomationRunAt,
  createDefaultAutomationRuntime,
  detectAutomationCadencePreset,
  formatAutomationScheduleTime,
  getAutomationInformationReferenceKey,
  getAutomationScheduleWeekdays,
  AUTOMATION_CADENCE_PRESETS,
  type AutomationPermissionMode,
  type AutomationCadencePreset,
  type AutomationRuntimeConfig,
  type AutomationUpsertInput,
} from "@/lib/automations";
import type { WorkspaceInformationReferenceOption } from "@/lib/workspace-information-references";
import { editorStyles } from "./automation-editor.styles";
import {
  applyAutomationScheduleUnit,
  formatRelativeTime,
  parseAutomationScheduleTime,
  type AutomationEnvironmentOption,
} from "./automation-center.utils";

const PERMISSION_MODE_ICON: Record<
  AutomationPermissionMode,
  typeof ShieldCheck
> = {
  auto: Zap,
  guided: ShieldCheck,
  manual: SlidersHorizontal,
};

export function SectionHeading(props: {
  title: string;
  description?: string;
  detail?: string;
}) {
  return (
    <div className={sx(editorStyles.sectionHeading)}>
      <div className={sx(editorStyles.sectionHeadingRow)}>
        <h3 className={sx(editorStyles.sectionTitle)}>{props.title}</h3>
        {props.detail ? (
          <span className={sx(editorStyles.sectionDetail)}>{props.detail}</span>
        ) : null}
      </div>
      {props.description ? (
        <p className={sx(editorStyles.sectionDescription)}>
          {props.description}
        </p>
      ) : null}
    </div>
  );
}

export function FormLabel(props: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={sx(editorStyles.formLabel)}>
      <span className={sx(editorStyles.formLabelText)}>{props.label}</span>
      {props.description ? (
        <span className={sx(editorStyles.formLabelDescription)}>
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
      className={sx(
        editorStyles.runtimeSwitch,
        props.warning && props.checked && editorStyles.runtimeSwitchWarning,
      )}
    >
      <span className={sx(editorStyles.runtimeSwitchText)}>
        <span className={sx(editorStyles.runtimeSwitchLabel)}>
          {props.label}
        </span>
        {props.description ? (
          <span className={sx(editorStyles.runtimeSwitchDescription)}>
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

type CadenceDraft = Pick<AutomationUpsertInput, "schedule" | "enabled">;

/** The "When" of a schedule. `manual` offers "Manual only" (start-a-task schedules). */
export function CadenceSection<T extends CadenceDraft>(props: {
  draft: T;
  onDraftChange: (draft: T) => void;
  manual?: boolean;
  /** Hide the "When" heading when the caller already shows one. */
  heading?: boolean;
}) {
  const { t: tI18n } = useTranslation(["automation"]);
  const { draft } = props;
  const manual = props.manual ?? true;
  const preset = detectAutomationCadencePreset({
    schedule: draft.schedule,
    enabled: draft.enabled,
  });
  const weekdays = getAutomationScheduleWeekdays(draft.schedule);
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
      return computeNextAutomationRunAt({
        schedule: draft.schedule,
        after: new Date(),
      });
    } catch {
      return null;
    }
  }, [draft.enabled, draft.schedule, i18n.resolvedLanguage]);

  function selectPreset(next: AutomationCadencePreset) {
    const applied = applyAutomationCadencePreset({
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
    <section className={sx(editorStyles.section)}>
      {props.heading === false ? null : (
        <SectionHeading
          title={tI18n("automation:automationEditor.when")}
          description={tI18n("automation:automationEditor.runsOnlyWhileStaveIsOpenA")}
        />
      )}
      <div className={sx(editorStyles.chipRow)} role="group" aria-label={tI18n("automation:automationEditor.when")}>
        {AUTOMATION_CADENCE_PRESETS.filter((candidate) => manual || candidate !== "manual").map((candidate) => {
          const active = candidate === preset;
          return (
            <Button
              key={candidate}
              type="button"
              size="sm"
              variant={active ? "secondary" : "ghost"}
              aria-pressed={active}
              title={tI18n(getAutomationCadencePresetKeys(candidate).detailKey)}
              xstyle={[
                editorStyles.cadenceChip,
                active
                  ? editorStyles.cadenceChipActive
                  : editorStyles.cadenceChipIdle,
              ]}
              onClick={() => selectPreset(candidate)}
            >
              {active ? (
                <Check className={sx(editorStyles.checkIcon)} aria-hidden="true" />
              ) : null}
              {tI18n(getAutomationCadencePresetKeys(candidate).labelKey)}
            </Button>
          );
        })}
      </div>

      {showIntervalFields ? (
        <div className={sx(editorStyles.intervalGrid)}>
          <FormLabel label={tI18n("automation:automationEditor.every")}>
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
              xstyle={editorStyles.compactControl}
            />
          </FormLabel>
          <FormLabel label={tI18n("automation:automationEditor.unit")}>
            <Select
              value={draft.schedule.unit}
              onValueChange={(unit) =>
                props.onDraftChange({
                  ...draft,
                  schedule: applyAutomationScheduleUnit(
                    draft.schedule,
                    unit as AutomationUpsertInput["schedule"]["unit"],
                  ),
                })
              }
            >
              <SelectTrigger className={sx(editorStyles.compactControl)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["minutes", "hours", "days", "weeks"] as const).map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {tI18n(`automation:editor.units.${unit}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormLabel>
        </div>
      ) : null}

      {showWeekdayPicker ? (
        <div className={sx(editorStyles.weekdayGroup)}>
          <span className={sx(editorStyles.formLabelText)}>{tI18n("automation:automationEditor.days")}</span>
          <div
            className={sx(editorStyles.weekdayRow)}
            role="group"
            aria-label={tI18n("automation:automationEditor.runDays")}
          >
            {Array.from({ length: 7 }, (_, weekday) => formatAutomationWeekday(weekday)).map((label, weekday) => {
              const active = weekdays.includes(weekday);
              return (
                <Button
                  key={label}
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-pressed={active}
                  aria-label={label}
                  xstyle={[
                    editorStyles.weekdayChip,
                    active
                      ? editorStyles.cadenceChipActive
                      : editorStyles.cadenceChipIdle,
                  ]}
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
          label={tI18n("automation:automationEditor.startTime")}
          description={tI18n("automation:automationEditor.localWallClockTimeRunsKeepThis")}
        >
          <Input
            type="time"
            value={
              draft.schedule.at
                ? formatAutomationScheduleTime(draft.schedule.at)
                : ""
            }
            onChange={(event) => {
              const at = parseAutomationScheduleTime(event.target.value);
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
            xstyle={editorStyles.timeControl}
          />
        </FormLabel>
      ) : null}

      <div className={sx(editorStyles.summaryRow)}>
        <CalendarClock
          className={sx(editorStyles.summaryIcon)}
          aria-hidden="true"
        />
        <span>
          {draft.enabled ? (
            <>
              <span className={sx(editorStyles.summaryStrong)}>
                {formatAutomationSchedule(draft.schedule)}
              </span>
              {nextRunAt ? tI18n("automation:automationEditor.nextRunValue", { value1: formatRelativeTime(nextRunAt) }) : ""}
            </>
          ) : (
            <span className={sx(editorStyles.summaryStrong)}>
              {tI18n("automation:automationEditor.manualOnlyThisScheduleRunsWhenYou")}</span>
          )}
        </span>
      </div>
    </section>
  );
}

function PermissionSection(props: {
  draft: AutomationUpsertInput;
  onDraftChange: (draft: AutomationUpsertInput) => void;
}) {
  const { t: tI18n } = useTranslation(["automation"]);
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

  function updateRuntime(next: AutomationRuntimeConfig) {
    props.onDraftChange({
      ...draft,
      runtime: applyAutomationTrustPolicyToRuntime(next, draft.trustPolicy),
    });
  }

  return (
    <section className={sx(editorStyles.section)}>
      <SectionHeading
        title={tI18n("automation:automationEditor.permissions")}
        description={tI18n("automation:automationEditor.howMuchThisAutomationMayDoOn")}
      />
      <div className={sx(editorStyles.modeList)} role="radiogroup" aria-label={tI18n("automation:automationEditor.permissions")}>
        {AUTOMATION_PERMISSION_MODES.map((candidate) => {
          const presentation =
            getAutomationPermissionModeKeys(candidate);
          const Icon = PERMISSION_MODE_ICON[candidate];
          const active = candidate === mode;
          return (
            <AdsButton layout="host"
              key={candidate}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => selectMode(candidate)}
              xstyle={[
                editorStyles.modeOption,
                transition.colors,
                active && editorStyles.modeOptionActive,
              ]}
            >
              <Icon
                className={sx(
                  editorStyles.modeIcon,
                  active ? editorStyles.modeIconActive : editorStyles.modeIconIdle,
                )}
                aria-hidden="true"
              />
              <span className={sx(editorStyles.modeBody)}>
                <span className={sx(editorStyles.modeTitleRow)}>
                  <span className={sx(editorStyles.modeTitle)}>
                    {tI18n(presentation.labelKey)}
                  </span>
                  <Badge
                    variant="outline"
                    className={sx(editorStyles.modeBadge)}
                  >
                    {tI18n(presentation.summaryKey)}
                  </Badge>
                  {candidate === "guided" ? (
                    <span className={sx(editorStyles.modeRecommended)}>
                      {tI18n("automation:automationEditor.recommended")}</span>
                  ) : null}
                </span>
                <span className={sx(editorStyles.modeDescription)}>
                  {tI18n(presentation.descriptionKey)}
                </span>
              </span>
            </AdsButton>
          );
        })}
      </div>

      {mode === "manual" ? (
        <div className={sx(editorStyles.manualPanel)}>
          {runtime.provider === "claude-code" ? (
            <>
              <FormLabel label={tI18n("automation:automationEditor.permissionMode")}>
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
                  <SelectTrigger className={sx(editorStyles.compactControl)}>
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
                label={tI18n("automation:automationEditor.sandbox")}
                checked={runtime.sandboxEnabled}
                onCheckedChange={(sandboxEnabled) =>
                  updateRuntime({ ...runtime, sandboxEnabled })
                }
              />
              <RuntimeSwitch
                label={tI18n("automation:automationEditor.allowUnsandboxedCommands")}
                checked={runtime.allowUnsandboxedCommands}
                onCheckedChange={(allowUnsandboxedCommands) =>
                  updateRuntime({ ...runtime, allowUnsandboxedCommands })
                }
              />
              <RuntimeSwitch
                label={tI18n("automation:automationEditor.dangerouslySkipPermissions")}
                description={tI18n("automation:automationEditor.removesEveryClaudePermissionCheckForThis")}
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
              <div className={sx(editorStyles.optionPair)}>
                <FormLabel label={tI18n("automation:automationEditor.approvals")}>
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
                    <SelectTrigger className={sx(editorStyles.compactControl)}>
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
                <FormLabel label={tI18n("automation:automationEditor.fileAccess")}>
                  <Select
                    value={runtime.fileAccess}
                    onValueChange={(fileAccess) =>
                      updateRuntime({
                        ...runtime,
                        fileAccess: fileAccess as typeof runtime.fileAccess,
                      })
                    }
                  >
                    <SelectTrigger className={sx(editorStyles.compactControl)}>
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
              <FormLabel label={tI18n("automation:automationEditor.webSearch")}>
                <Select
                  value={runtime.webSearch}
                  onValueChange={(webSearch) =>
                    updateRuntime({
                      ...runtime,
                      webSearch: webSearch as typeof runtime.webSearch,
                    })
                  }
                >
                  <SelectTrigger className={sx(editorStyles.compactControl)}>
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
                label={tI18n("automation:automationEditor.networkAccess")}
                checked={runtime.networkAccess}
                onCheckedChange={(networkAccess) =>
                  updateRuntime({ ...runtime, networkAccess })
                }
              />
            </>
          )}
        </div>
      ) : null}

      <p className={sx(editorStyles.permissionSummary)}>
        {formatAutomationRuntimePermissions(runtime)}
      </p>
    </section>
  );
}

export function AutomationEditor(props: {
  automationId: string | null;
  draft: AutomationUpsertInput;
  environmentOptions: AutomationEnvironmentOption[];
  informationOptions: WorkspaceInformationReferenceOption[];
  informationLoading: boolean;
  saving: boolean;
  /** "Start a task / Check back on a task" choice; shown when creating. */
  kindSwitch?: React.ReactNode;
  onDraftChange: (draft: AutomationUpsertInput) => void;
  onInformationCreated: (option: WorkspaceInformationReferenceOption) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t: tI18n } = useTranslation(["automation"]);
  const environmentValue = props.draft.environment.repositoryPath
    ? `repository:${props.draft.environment.repositoryPath}`
    : "";
  const selectedReferenceKeys = new Set(
    props.draft.informationReferences.map(getAutomationInformationReferenceKey),
  );
  const informationOptionByKey = new Map(
    props.informationOptions.map((option) => [
      getAutomationInformationReferenceKey(option.reference),
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
      } as AutomationRuntimeConfig,
    });
  }

  function attachInformationOption(
    option: WorkspaceInformationReferenceOption,
  ) {
    if (
      option.reference.section === "lens" ||
      option.reference.section === "web"
    ) {
      return;
    }
    const targetKey = getAutomationInformationReferenceKey(option.reference);
    if (selectedReferenceKeys.has(targetKey)) {
      return;
    }
    const reference = {
      ...option.reference,
      section: option.reference.section,
    } satisfies AutomationUpsertInput["informationReferences"][number];
    props.onDraftChange({
      ...props.draft,
      informationReferences: [...props.draft.informationReferences, reference],
    });
  }

  function removeInformationReference(
    reference: AutomationUpsertInput["informationReferences"][number],
  ) {
    const targetKey = getAutomationInformationReferenceKey(reference);
    props.onDraftChange({
      ...props.draft,
      informationReferences: props.draft.informationReferences.filter(
        (candidate) =>
          getAutomationInformationReferenceKey(candidate) !== targetKey,
      ),
    });
  }

  return (
    <div className={sx(editorStyles.root)}>
      <div className={sx(editorStyles.header)}>
        <div className={sx(editorStyles.headerText)}>
          <div className={sx(editorStyles.headerTitle)}>
            {props.automationId ? tI18n("automation:automationEditor.editSchedule") : tI18n("automation:automationEditor.newSchedule")}
          </div>
          <div className={sx(editorStyles.headerSubtitle)}>
            {tI18n("automation:automationEditor.startsAFreshTaskWhileTheStave")}</div>
        </div>
        <div className={sx(editorStyles.headerActions)}>
          <Button
            size="sm"
            variant="ghost"
            xstyle={editorStyles.headerButtonQuiet}
            onClick={props.onCancel}
            disabled={props.saving}
          >
            {tI18n("automation:automationEditor.cancel")}</Button>
          <Button
            size="sm"
            xstyle={editorStyles.headerButton}
            onClick={props.onSave}
            disabled={props.saving}
          >
            {props.saving ? tI18n("automation:automationEditor.saving") : tI18n("automation:automationEditor.save")}
          </Button>
        </div>
      </div>

      <div className={sx(editorStyles.body)}>
        <div className={sx(editorStyles.bodyColumn)}>
          <section className={sx(editorStyles.section)}>
            <SectionHeading title={tI18n("automation:automationEditor.what")} />
            <FormLabel label={tI18n("automation:automationEditor.name")}>
              <Input
                value={props.draft.name}
                onChange={(event) =>
                  props.onDraftChange({
                    ...props.draft,
                    name: event.target.value,
                  })
                }
                placeholder={tI18n("automation:automationEditor.dailyRepositoryReview")}
                xstyle={editorStyles.compactControl}
              />
            </FormLabel>
            <FormLabel
              label={tI18n("automation:automationEditor.instructions")}
              description={tI18n("automation:automationEditor.theCompletePromptSentOnEveryRun")}
            >
              <Textarea
                value={props.draft.prompt}
                onChange={(event) =>
                  props.onDraftChange({
                    ...props.draft,
                    prompt: event.target.value,
                  })
                }
                placeholder={tI18n("automation:automationEditor.reviewChangesSinceTheLastRunAnd")}
                xstyle={editorStyles.promptControl}
              />
            </FormLabel>
          </section>

          <section className={sx(editorStyles.section)}>
            <SectionHeading
              title={tI18n("automation:automationEditor.where")}
              description={tI18n("automation:automationEditor.startsANewTaskInThisRepository")}
            />
            {props.kindSwitch}
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
                    repositoryPath: selected.repositoryPath,
                    label: selected.label,
                  },
                  informationReferences: [],
                });
              }}
            >
              <SelectTrigger className={sx(editorStyles.repositorySelect)}>
                <SelectValue placeholder={tI18n("automation:automationEditor.selectARepository")} />
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
              <div className={sx(editorStyles.environmentPath)}>
                {props.draft.environment.path}
              </div>
            ) : null}
          </section>

          <CadenceSection
            draft={props.draft}
            onDraftChange={props.onDraftChange}
          />

          <PermissionSection
            draft={props.draft}
            onDraftChange={props.onDraftChange}
          />

          <section className={sx(editorStyles.section)}>
            <SectionHeading title={tI18n("automation:automationEditor.agent")} />
            <ProviderModelPicker
              selectedProvider={runtime.provider}
              selectedModel={runtime.model}
              onProviderChange={(provider) =>
                props.onDraftChange({
                  ...props.draft,
                  runtime: applyAutomationTrustPolicyToRuntime(
                    createDefaultAutomationRuntime(provider),
                    props.draft.trustPolicy,
                  ),
                })
              }
              onModelChange={applyModel}
              providerSelectClassName={sx(editorStyles.providerSelect)}
            />
            <div className={sx(editorStyles.effortGroup)}>
              <span className={sx(editorStyles.formLabelText)}>{tI18n("automation:automationEditor.effort")}</span>
              <span className={sx(editorStyles.formLabelDescription)}>
                {tI18n("automation:automationEditor.higherEffortSpendsMoreModelBudgetOn")}</span>
              <ChoiceButtons
                aria-label={tI18n("automation:automationEditor.effort")}
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
                    } as AutomationRuntimeConfig,
                  })
                }
              />
            </div>
            <FormLabel
              label={tI18n("automation:automationEditor.concurrentRuns")}
              description={tI18n("automation:automationEditor.occurrencesBeyondTheLimitAreRecordedAs")}
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
                xstyle={editorStyles.concurrencyControl}
              />
            </FormLabel>
          </section>

          <section className={sx(editorStyles.section)}>
            <SectionHeading
              title={tI18n("automation:automationEditor.informationResources")}
              detail={tI18n("automation:automationEditor.valueAttached", { propsdraftinformationReferencesCount: props.draft.informationReferences.length })}
              description={tI18n("automation:automationEditor.eachResourceIsCreatedInTheRepository")}
            />
            {!props.draft.environment.workspaceId ? (
              <div className={sx(editorStyles.emptyPanel)}>
                {tI18n("automation:automationEditor.selectARepositoryBeforeAttachingInformation")}</div>
            ) : (
              <>
                <AutomationInformationResourceCreator
                  workspaceId={props.draft.environment.workspaceId}
                  repositoryLabel={props.draft.environment.label}
                  disabled={props.saving}
                  onCreated={(option) => {
                    props.onInformationCreated(option);
                    attachInformationOption(option);
                  }}
                />
                {props.informationLoading ? (
                  <div className={sx(editorStyles.loadingNote)}>
                    {tI18n("automation:automationEditor.refreshingInformationResources")}</div>
                ) : null}
                {props.draft.informationReferences.length === 0 ? (
                  <div className={sx(editorStyles.emptyPanel)}>
                    {tI18n("automation:automationEditor.noInformationAttachedYetAddAResource")}</div>
                ) : (
                  <div className={sx(editorStyles.referenceList)}>
                    {props.draft.informationReferences.map((reference) => {
                      const key = getAutomationInformationReferenceKey(reference);
                      const option = informationOptionByKey.get(key);
                      return (
                        <div
                          key={key}
                          className={sx(editorStyles.referenceCard)}
                        >
                          <WorkspaceInformationReferenceChip
                            reference={reference}
                            compact
                            onRemove={() =>
                              removeInformationReference(reference)
                            }
                          />
                          <p className={sx(editorStyles.referenceDescription)}>
                            {option?.description ??
                              tI18n("automation:automationEditor.injectsValueIntoEachRun", { value1: reference.label })}
                          </p>
                          <div className={sx(editorStyles.referenceToken)}>
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
