import type { ReactNode } from "react";
import { Accordion } from "@/components/ads/components/Accordion";
import { Select } from "@/components/ads/components/Select";
import { Switch } from "@/components/ads/components/Switch";
import { sx } from "@/components/ads/utils/stylex";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import { ModelEffortSelector } from "@/components/ai-elements/model-effort-selector";
import {
  ADVISOR_EFFORT_AUTO_VALUE,
  buildAdvisorEffortOptions,
  buildAdvisorProviderOptions,
  formatAdvisorEffortLabel,
  resolveAdvisorEffortSelection,
} from "@/components/ai-elements/prompt-input-advisor-mode.utils";
import { ChoiceButtons } from "@/components/layout/settings-dialog.shared";
import {
  selectCraneDispatchAdvisorTarget,
  type CraneDispatchAccessState,
} from "@/lib/crane-connector/dispatch-runtime";
import {
  isAdvisorEffortClamped,
  resolveAdvisorEffort,
} from "@/lib/providers/advisor";
import {
  getProviderLabel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ProviderModePresetId } from "@/lib/providers/provider-mode-presets";
import type { AdvisorEffort } from "@/lib/providers/provider.types";
import {
  CLAUDE_PERMISSION_MODE_OPTIONS,
  CODEX_APPROVAL_POLICY_OPTIONS,
  CODEX_SANDBOX_MODE_OPTIONS,
  CODEX_WEB_SEARCH_OPTIONS,
  formatProviderTimeoutLabel,
} from "@/lib/providers/runtime-option-contract";
import { dispatchFieldStyles } from "./dispatch-runtime.styles";
import type { DispatchRuntimeDraft } from "./useDispatchRuntimeDraft";

export interface DispatchRuntimeFieldsProps {
  /** Namespaces every DOM id so two dispatch surfaces can coexist on screen. */
  idPrefix: string;
  draft: DispatchRuntimeDraft;
  advisorConsultLimit: number;
  providerTimeoutMs: number;
  disabled?: boolean;
  /** Rendered as the section's last child, e.g. a remember-defaults control. */
  footer?: ReactNode;
}

function AccessSelectField(props: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select
      label={props.label}
      value={props.value}
      options={[...props.options]}
      disabled={props.disabled}
      onValueChange={(value) => {
        if (typeof value === "string") {
          props.onValueChange(value);
        }
      }}
    />
  );
}

/** The "How it runs" controls: model, effort, autonomy, access, and Advisor. */
export function DispatchRuntimeFields(props: DispatchRuntimeFieldsProps) {
  const { draft, idPrefix } = props;
  const { access, advisor, advisorTarget, model, setAccess, setAdvisor } =
    draft;
  // One setter for every access control. The child fields work in `string` /
  // `boolean`; the stored fields are literal unions the options already respect,
  // so writing `unknown` back keeps the updaters to a single line without a cast
  // at every call site.
  const setAccessField =
    (key: keyof CraneDispatchAccessState) => (value: unknown) =>
      setAccess((current) => ({ ...current, [key]: value }));

  return (
    <section
      className={sx(dispatchFieldStyles.section)}
      aria-labelledby={`${idPrefix}-runtime-heading`}
    >
      <h3 id={`${idPrefix}-runtime-heading`} className={sx(dispatchFieldStyles.sectionHeading)}>
        How it runs
      </h3>
      <div className={sx(dispatchFieldStyles.panelRow)}>
        <div className={sx(dispatchFieldStyles.rowText)}>
          <p className={sx(dispatchFieldStyles.fieldLabel)}>
            Model and effort
          </p>
          <p className={sx(dispatchFieldStyles.rowDescription)}>
            Same picker as the composer, including reasoning effort.
          </p>
        </div>
        <ModelEffortSelector
          value={draft.selectedModelOption}
          options={draft.modelOptions}
          effortValue={model.effort}
          effortLabel={draft.effortLabel}
          fastMode={
            model.providerId === "codex" ? model.codexFastMode : undefined
          }
          disabled={props.disabled}
          onFastModeChange={draft.setFastMode}
          onSelect={draft.selectModel}
        />
      </div>
      {!draft.providerAvailable ? (
        <p className={sx(dispatchFieldStyles.hintDanger)} role="alert">
          This provider is unavailable. Choose another model before approving.
        </p>
      ) : null}

      <div className={sx(dispatchFieldStyles.field)}>
        <p className={sx(dispatchFieldStyles.fieldLabel)}>Autonomy</p>
        <ChoiceButtons
          aria-label="Autonomy"
          value={draft.autonomyPreset ?? "custom"}
          options={draft.autonomyOptions}
          onChange={(value) => {
            if (value === "custom") {
              return;
            }
            draft.applyAutonomyPreset(value as ProviderModePresetId);
          }}
        />
        <p className={sx(dispatchFieldStyles.hintRelaxed)}>
          {draft.autonomyDescription}
        </p>
        <p className={sx(dispatchFieldStyles.mono)}>
          {draft.accessSummary}
        </p>
      </div>

      <Accordion
        defaultValue={[]}
        items={[
          {
            value: "advanced",
            title: "Advanced",
            content: (
              <div className={sx(dispatchFieldStyles.accordionPanel)}>
                {model.providerId === "claude-code" ? (
                  <>
                    <AccessSelectField
                      label="Claude permission mode"
                      value={access.claudePermissionMode}
                      options={CLAUDE_PERMISSION_MODE_OPTIONS}
                      disabled={props.disabled}
                      onValueChange={setAccessField("claudePermissionMode")}
                    />
                    <Switch
                      variant="row"
                      label="Claude sandbox"
                      checked={access.claudeSandboxEnabled}
                      disabled={props.disabled}
                      onCheckedChange={setAccessField("claudeSandboxEnabled")}
                    />
                    <Switch
                      variant="row"
                      label="Allow unsandboxed commands"
                      checked={access.claudeAllowUnsandboxedCommands}
                      disabled={props.disabled}
                      onCheckedChange={setAccessField(
                        "claudeAllowUnsandboxedCommands",
                      )}
                    />
                  </>
                ) : (
                  <>
                    <div className={sx(dispatchFieldStyles.accessPair)}>
                      <AccessSelectField
                        label="File access"
                        value={access.codexFileAccess}
                        options={CODEX_SANDBOX_MODE_OPTIONS}
                        disabled={props.disabled}
                        onValueChange={setAccessField("codexFileAccess")}
                      />
                      <AccessSelectField
                        label="Approval policy"
                        value={access.codexApprovalPolicy}
                        options={CODEX_APPROVAL_POLICY_OPTIONS}
                        disabled={props.disabled}
                        onValueChange={setAccessField("codexApprovalPolicy")}
                      />
                    </div>
                    <AccessSelectField
                      label="Web search"
                      value={access.codexWebSearch}
                      options={CODEX_WEB_SEARCH_OPTIONS}
                      disabled={props.disabled}
                      onValueChange={setAccessField("codexWebSearch")}
                    />
                    <Switch
                      variant="row"
                      label="Network access"
                      checked={access.codexNetworkAccess}
                      disabled={props.disabled}
                      onCheckedChange={setAccessField("codexNetworkAccess")}
                    />
                  </>
                )}

                <Switch
                  variant="row"
                  label="Advisor"
                  description="Lets the primary consult an isolated read-only Advisor on demand, adding a model call per consult."
                  checked={advisor.enabled}
                  disabled={props.disabled}
                  onCheckedChange={(checked) =>
                    setAdvisor((current) => ({ ...current, enabled: checked }))
                  }
                />

                <div className={sx(dispatchFieldStyles.field)}>
                  <p className={sx(dispatchFieldStyles.fieldLabel)}>
                    Advisor provider
                  </p>
                  <ChoiceButtons
                    aria-label="Advisor provider"
                    value={advisor.providerId}
                    options={buildAdvisorProviderOptions().map((option) => ({
                      value: option.id,
                      label: option.label,
                      icon: (
                        <ModelIcon
                          providerId={option.id}
                          className={sx(dispatchFieldStyles.optionIcon)}
                        />
                      ),
                    }))}
                    onChange={(providerId) =>
                      // Non-destructive: each provider keeps its own model and
                      // tier, so switching back restores the other pick instead of
                      // resetting it to the catalog default.
                      setAdvisor((current) => ({ ...current, providerId }))
                    }
                  />
                </div>

                <Select
                  label={`${getProviderLabel({ providerId: advisor.providerId })} Advisor model`}
                  value={advisorTarget.model}
                  disabled={props.disabled}
                  options={draft.advisorModels.map((value) => ({
                    value,
                    label: toHumanModelName({ model: value }),
                    icon: (
                      <ModelIcon
                        providerId={advisor.providerId}
                        model={value}
                        className={sx(dispatchFieldStyles.optionIcon)}
                      />
                    ),
                  }))}
                  onValueChange={(nextAdvisorModel) => {
                    if (typeof nextAdvisorModel !== "string") {
                      return;
                    }
                    setAdvisor((current) =>
                      selectCraneDispatchAdvisorTarget({
                        advisor: current,
                        target: {
                          providerId: current.providerId,
                          model: nextAdvisorModel,
                          // Switching model must not silently drop the pinned
                          // tier; an unsupported one is clamped at resolution
                          // time instead.
                          ...(advisorTarget.effort
                            ? { effort: advisorTarget.effort }
                            : {}),
                        },
                      }),
                    );
                  }}
                />

                <div className={sx(dispatchFieldStyles.field)}>
                  <p className={sx(dispatchFieldStyles.fieldLabel)}>
                    Advisor effort
                  </p>
                  <ChoiceButtons
                    aria-label="Advisor effort"
                    value={
                      resolveAdvisorEffortSelection(advisorTarget) ??
                      ADVISOR_EFFORT_AUTO_VALUE
                    }
                    options={buildAdvisorEffortOptions(advisorTarget).map(
                      (option) => ({
                        value: option.value ?? ADVISOR_EFFORT_AUTO_VALUE,
                        label: option.label,
                      }),
                    )}
                    onChange={(value) =>
                      setAdvisor((current) =>
                        selectCraneDispatchAdvisorTarget({
                          advisor: current,
                          target: {
                            providerId: current.providerId,
                            model: advisorTarget.model,
                            ...(value === ADVISOR_EFFORT_AUTO_VALUE
                              ? {}
                              : { effort: value as AdvisorEffort }),
                          },
                        }),
                      )
                    }
                  />
                  <p className={sx(dispatchFieldStyles.hintRelaxed)}>
                    {advisorTarget.effort && isAdvisorEffortClamped(advisorTarget)
                      ? `${toHumanModelName({
                          model: advisorTarget.model,
                        })} does not accept ${formatAdvisorEffortLabel(
                          advisorTarget.effort,
                        )}, so the Advisor runs at ${formatAdvisorEffortLabel(
                          resolveAdvisorEffort(advisorTarget),
                        )}.`
                      : `The primary waits on each consult, so this is a latency-per-consult choice. Runs at ${formatAdvisorEffortLabel(
                          resolveAdvisorEffort(advisorTarget),
                        )}, up to ${props.advisorConsultLimit} consults per turn.`}
                  </p>
                </div>

                <p className={sx(dispatchFieldStyles.hintRelaxed)}>
                  Provider timeout{" "}
                  {formatProviderTimeoutLabel(props.providerTimeoutMs)}, from your
                  Stave provider settings.
                </p>
              </div>
            ),
          },
        ]}
      />

      {props.footer}
    </section>
  );
}
