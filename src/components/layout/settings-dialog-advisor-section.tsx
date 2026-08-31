import { useMemo } from "react";
import { Badge } from "@/components/ui";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import {
  buildModelSelectorOptions,
  buildModelSelectorValue,
  ModelSelector,
} from "@/components/ai-elements/model-selector";
import {
  ADVISOR_EFFORT_AUTO_VALUE,
  buildAdvisorEffortOptions,
  buildAdvisorProviderOptions,
  formatAdvisorEffortLabel,
  resolveAdvisorEffortSelection,
} from "@/components/ai-elements/prompt-input-advisor-mode.utils";
import {
  ADVISOR_SETTING_FIELD_ID,
  buildAdvisorSettingsTargetPatch,
  isAdvisorEffortClamped,
  MAX_ADVISOR_CONSULT_LIMIT,
  MIN_ADVISOR_CONSULT_LIMIT,
  resolveAdvisorArmState,
  resolveAdvisorEffort,
  resolveAdvisorSelectedProviderId,
} from "@/lib/providers/advisor";
import {
  getProviderLabel,
  getSdkModelOptions,
  isManagedExecutionProviderId,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type {
  AdvisorEffort,
  AdvisorTarget,
  AdvisorTargetByProvider,
  ManagedExecutionProviderId,
  ProviderId,
} from "@/lib/providers/provider.types";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  readInt,
  SettingsCard,
  SwitchField,
} from "./settings-dialog.shared";

/**
 * Longer than the composer's one-word summaries on purpose: this card is the
 * place a user decides what "isolated" actually means for each provider, and
 * it has the width for a sentence.
 */
const ADVISOR_PROVIDER_DESCRIPTIONS: Readonly<
  Record<ManagedExecutionProviderId, string>
> = {
  "claude-code": "Use an isolated Claude SDK turn with tools disabled.",
  codex: "Use an ephemeral, read-only Codex App Server thread.",
};

/**
 * Global Advisor default.
 *
 * Structured to match the composer's Advisor menu rather than the old
 * "Off / Claude / Codex" row: a switch decides whether new tasks pay for an
 * Advisor, and the provider, model, and effort rows stay editable while it is
 * off. Configuring the default and turning it on are separate acts, so both
 * providers can be set up in advance.
 *
 * Provider selection is therefore non-destructive: each provider keeps its own
 * model and tier in `advisorTargetByProvider`, so switching back does not reset
 * the other provider's pick to the catalog default. This is the same shape a
 * task keeps in its prompt-draft overrides, which is what lets a task inherit
 * per-provider defaults instead of only the one armed pick.
 */
export function SettingsAdvisorSection(args: {
  advisorEnabled: boolean;
  advisorTarget: AdvisorTarget | null;
  advisorTargetByProvider: AdvisorTargetByProvider;
  advisorConsultLimit: number;
  codexBinaryPath: string;
  /** Provider that would actually run the turn, for the pairing summary. */
  executorProvider: ProviderId;
  executorModel: string;
  /** True when the summary describes a live task rather than the default. */
  executorIsActiveTask: boolean;
  onChange: (patch: {
    advisorEnabled?: boolean;
    advisorTarget?: AdvisorTarget | null;
    advisorTargetByProvider?: AdvisorTargetByProvider;
    advisorConsultLimit?: number;
  }) => void;
}) {
  const arm = resolveAdvisorArmState({
    settingsTarget: args.advisorTarget,
    settingsEnabled: args.advisorEnabled,
    settingsTargetByProvider: args.advisorTargetByProvider,
  });
  // Which provider this card configures. Independent of the switch, and
  // defaulted to the opposite of the provider running turns, because a second
  // opinion from the model already answering is not a second opinion.
  const selectedProviderId = resolveAdvisorSelectedProviderId({
    arm,
    primaryProviderId: args.executorProvider,
  });
  const selectedTarget = arm.targetByProvider[selectedProviderId];
  const codexModelCatalog = useCodexModelCatalog({
    enabled: selectedProviderId === "codex",
    codexBinaryPath: args.codexBinaryPath,
  });
  const modelOptions = useMemo(
    () =>
      buildModelSelectorOptions({
        providerIds: [selectedProviderId],
        modelsByProvider: {
          [selectedProviderId]:
            selectedProviderId === "codex"
              ? codexModelCatalog.models
              : getSdkModelOptions({ providerId: selectedProviderId }),
        },
      }),
    [codexModelCatalog.models, selectedProviderId],
  );
  const selectedModelSupported = modelOptions.some(
    (option) =>
      option.providerId === selectedProviderId &&
      option.model === selectedTarget.model,
  );

  const selectTarget = (target: AdvisorTarget) => {
    args.onChange(
      buildAdvisorSettingsTargetPatch({
        defaults: { advisorTargetByProvider: args.advisorTargetByProvider },
        target,
      }),
    );
  };

  return (
    <SettingsCard
      id={ADVISOR_SETTING_FIELD_ID}
      tabIndex={-1}
      title="Advisor"
      description="Default for new tasks: arm an isolated, read-only Advisor the primary model can consult on demand during its turn (via the stave_consult_advisor tool). The Advisor can be Claude or Codex regardless of the primary provider, and each task can arm or disarm it from the composer."
      titleAccessory={
        <Badge
          variant={
            args.advisorEnabled
              ? selectedModelSupported
                ? "secondary"
                : "destructive"
              : "outline"
          }
        >
          {args.advisorEnabled
            ? selectedModelSupported
              ? "Default on"
              : "Invalid model"
            : "Default off"}
        </Badge>
      }
    >
      <SwitchField
        title="Arm an Advisor by default"
        description="New tasks start with the Advisor below armed. Each task's composer can still turn it off, or point it at a different model, for that task alone."
        checked={args.advisorEnabled}
        onCheckedChange={(checked) => {
          if (!checked) {
            args.onChange({ advisorEnabled: false });
            return;
          }
          // Arm against exactly what this card is showing, so turning the
          // switch on can never resolve to a model the user was not looking at.
          args.onChange({
            advisorEnabled: true,
            ...buildAdvisorSettingsTargetPatch({
              defaults: {
                advisorTargetByProvider: args.advisorTargetByProvider,
              },
              target: selectedTarget,
            }),
          });
        }}
      />
      <LabeledField
        title="Advisor Provider"
        description="Each provider keeps its own default model and effort, so both can be configured in advance and switching between them is not a destructive edit."
      >
        <ChoiceButtons
          columns={2}
          value={selectedProviderId}
          onChange={(providerId) => {
            selectTarget(arm.targetByProvider[providerId]);
          }}
          options={buildAdvisorProviderOptions().map((option) => ({
            value: option.id,
            label: option.label,
            description: ADVISOR_PROVIDER_DESCRIPTIONS[option.id],
            icon: <ModelIcon providerId={option.id} className="size-3.5" />,
          }))}
        />
      </LabeledField>
      <LabeledField
        title="Advisor Model"
        description="Claude runs with tools disabled; Codex uses a read-only sandbox and isolated no-tool instructions. Neither uses network or conversation resume state."
      >
        <ModelSelector
          value={buildModelSelectorValue({
            providerId: selectedProviderId,
            model: selectedTarget.model,
            available: selectedModelSupported,
          })}
          options={modelOptions}
          className="w-full"
          triggerAriaLabel={`Advisor model: ${toHumanModelName({
            model: selectedTarget.model,
          })}`}
          triggerClassName="h-10 w-full max-w-none rounded-md border border-border/80 bg-background px-3 hover:bg-muted/40"
          menuClassName="sm:max-w-lg"
          onSelect={({ selection }) => {
            if (!isManagedExecutionProviderId(selection.providerId)) {
              return;
            }
            selectTarget({
              providerId: selection.providerId,
              model: selection.model,
              // Switching models must not silently reset the pinned tier; an
              // unsupported one is clamped at resolution time.
              ...(selectedTarget.effort ? { effort: selectedTarget.effort } : {}),
            })
          }}
        />
        {!selectedModelSupported ? (
          <p className="mt-2 text-xs leading-5 text-destructive">
            This persisted model is not in Stave&apos;s current{" "}
            {getProviderLabel({ providerId: selectedProviderId })} catalog.
            Advisor will stay skipped until you select a valid model.
          </p>
        ) : null}
      </LabeledField>
      <LabeledField
        title="Advisor Effort"
        description="The primary waits on each consult it makes, so the tier is a latency-per-consult choice. Auto follows the model's own default, which for Codex is deliberately high."
      >
        <ChoiceButtons
          value={
            resolveAdvisorEffortSelection(selectedTarget) ??
            ADVISOR_EFFORT_AUTO_VALUE
          }
          onChange={(value) => {
            selectTarget({
              providerId: selectedProviderId,
              model: selectedTarget.model,
              ...(value === ADVISOR_EFFORT_AUTO_VALUE
                ? {}
                : { effort: value as AdvisorEffort }),
            });
          }}
          options={buildAdvisorEffortOptions(selectedTarget).map((option) => ({
            value: option.value ?? ADVISOR_EFFORT_AUTO_VALUE,
            // The full title carries what Auto resolves to, which is the
            // number that decides whether this default is expensive.
            label: option.title,
          }))}
        />
        {selectedTarget.effort && isAdvisorEffortClamped(selectedTarget) ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            The saved tier is {formatAdvisorEffortLabel(selectedTarget.effort)},
            which {toHumanModelName({ model: selectedTarget.model })} does not
            accept, so the Advisor runs at{" "}
            {formatAdvisorEffortLabel(resolveAdvisorEffort(selectedTarget))}.
          </p>
        ) : null}
      </LabeledField>
      <LabeledField
        title="Consults per turn"
        description={`How many times the primary may consult the Advisor in one turn (${MIN_ADVISOR_CONSULT_LIMIT}–${MAX_ADVISOR_CONSULT_LIMIT}). Each consult is one full Advisor call — the budget is the spend ceiling per turn.`}
      >
        <DraftInput
          className="h-10 w-24 rounded-md border-border/80 bg-background"
          value={String(args.advisorConsultLimit)}
          onCommit={(value) =>
            args.onChange({
              advisorConsultLimit: readInt(value, args.advisorConsultLimit),
            })
          }
        />
      </LabeledField>
      <div className="rounded-lg border border-border/70 bg-muted/20 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">
            {args.executorIsActiveTask ? "Active pair:" : "Default pair:"}
          </span>{" "}
          {getProviderLabel({ providerId: args.executorProvider })} ·{" "}
          {toHumanModelName({ model: args.executorModel })}
          {" → "}
          {arm.effectiveTarget
            ? `${getProviderLabel({
                providerId: arm.effectiveTarget.providerId,
              })} Advisor · ${toHumanModelName({
                model: arm.effectiveTarget.model,
              })} · ${formatAdvisorEffortLabel(
                resolveAdvisorEffort(arm.effectiveTarget),
              )}`
            : "Advisor off"}
        </p>
        <p className="mt-1">
          Each consult adds one model call, latency, and usage — the primary
          decides when to ask, the user decides who answers and how often. A
          recoverable Advisor failure is traced and the primary turn still runs;
          Stave never switches Advisor models automatically. Consults require
          Local MCP to be enabled.
        </p>
        <p className="mt-1">
          This is only the default. Each task&apos;s composer has an Advisor
          control with the same provider, model, and effort rows, so a task can
          diverge from this without changing it.
        </p>
      </div>
    </SettingsCard>
  );
}
