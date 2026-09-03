import type { ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@/components/ui";
import { ModelEffortSelector } from "@/components/ai-elements/model-effort-selector";
import { ModelIcon } from "@/components/ai-elements/model-icon";
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
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <label
        htmlFor={props.id}
        className="text-xs font-medium text-muted-foreground"
      >
        {props.label}
      </label>
      <Select value={props.value} onValueChange={props.onValueChange}>
        <SelectTrigger id={props.id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AccessSwitchField(props: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={props.id} className="text-sm">
        {props.label}
      </label>
      <Switch
        id={props.id}
        checked={props.checked}
        onCheckedChange={props.onCheckedChange}
      />
    </div>
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
      className="grid gap-4"
      aria-labelledby={`${idPrefix}-runtime-heading`}
    >
      <h3 id={`${idPrefix}-runtime-heading`} className="text-sm font-semibold">
        How it runs
      </h3>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            Model and effort
          </p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
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
        <p className="text-xs leading-5 text-destructive" role="alert">
          This provider is unavailable. Choose another model before approving.
        </p>
      ) : null}

      <div className="grid gap-2">
        <p className="text-xs font-medium text-muted-foreground">Autonomy</p>
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
        <p className="text-xs leading-5 text-muted-foreground">
          {draft.autonomyDescription}
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {draft.accessSummary}
        </p>
      </div>

      <Accordion className="rounded-lg border border-border px-3">
        <AccordionItem value="advanced" className="border-b-0">
          <AccordionTrigger className="py-3 text-sm hover:no-underline">
            Advanced
          </AccordionTrigger>
          <AccordionContent className="grid gap-3 pb-3">
            {model.providerId === "claude-code" ? (
              <>
                <AccessSelectField
                  id={`${idPrefix}-claude-permissions`}
                  label="Claude permission mode"
                  value={access.claudePermissionMode}
                  options={CLAUDE_PERMISSION_MODE_OPTIONS}
                  onValueChange={setAccessField("claudePermissionMode")}
                />
                <AccessSwitchField
                  id={`${idPrefix}-claude-sandbox`}
                  label="Claude sandbox"
                  checked={access.claudeSandboxEnabled}
                  onCheckedChange={setAccessField("claudeSandboxEnabled")}
                />
                <AccessSwitchField
                  id={`${idPrefix}-claude-unsandboxed`}
                  label="Allow unsandboxed commands"
                  checked={access.claudeAllowUnsandboxedCommands}
                  onCheckedChange={setAccessField(
                    "claudeAllowUnsandboxedCommands",
                  )}
                />
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <AccessSelectField
                    id={`${idPrefix}-codex-files`}
                    label="File access"
                    value={access.codexFileAccess}
                    options={CODEX_SANDBOX_MODE_OPTIONS}
                    onValueChange={setAccessField("codexFileAccess")}
                  />
                  <AccessSelectField
                    id={`${idPrefix}-codex-approval`}
                    label="Approval policy"
                    value={access.codexApprovalPolicy}
                    options={CODEX_APPROVAL_POLICY_OPTIONS}
                    onValueChange={setAccessField("codexApprovalPolicy")}
                  />
                </div>
                <AccessSelectField
                  id={`${idPrefix}-codex-web-search`}
                  label="Web search"
                  value={access.codexWebSearch}
                  options={CODEX_WEB_SEARCH_OPTIONS}
                  onValueChange={setAccessField("codexWebSearch")}
                />
                <AccessSwitchField
                  id={`${idPrefix}-codex-network`}
                  label="Network access"
                  checked={access.codexNetworkAccess}
                  onCheckedChange={setAccessField("codexNetworkAccess")}
                />
              </>
            )}

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <label
                  htmlFor={`${idPrefix}-advisor`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Advisor
                </label>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Lets the primary consult an isolated read-only Advisor on
                  demand, adding a model call per consult.
                </p>
              </div>
              <Switch
                id={`${idPrefix}-advisor`}
                checked={advisor.enabled}
                onCheckedChange={(checked) =>
                  setAdvisor((current) => ({ ...current, enabled: checked }))
                }
              />
            </div>

            <div className="grid gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Advisor provider
              </p>
              <ChoiceButtons
                aria-label="Advisor provider"
                value={advisor.providerId}
                options={buildAdvisorProviderOptions().map((option) => ({
                  value: option.id,
                  label: option.label,
                  icon: (
                    <ModelIcon providerId={option.id} className="size-3.5" />
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

            <div className="grid gap-2">
              <label
                htmlFor={`${idPrefix}-advisor-model`}
                className="text-xs font-medium text-muted-foreground"
              >
                {getProviderLabel({ providerId: advisor.providerId })} Advisor
                model
              </label>
              <Select
                value={advisorTarget.model}
                onValueChange={(nextAdvisorModel) =>
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
                  )
                }
              >
                <SelectTrigger id={`${idPrefix}-advisor-model`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {draft.advisorModels.map((value) => (
                    <SelectItem key={value} value={value}>
                      <span className="flex min-w-0 items-center gap-2">
                        <ModelIcon
                          providerId={advisor.providerId}
                          model={value}
                          className="size-3.5"
                        />
                        <span className="truncate">
                          {toHumanModelName({ model: value })}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <p className="text-xs font-medium text-muted-foreground">
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
              <p className="text-xs leading-5 text-muted-foreground">
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

            <p className="text-xs leading-5 text-muted-foreground">
              Provider timeout{" "}
              {formatProviderTimeoutLabel(props.providerTimeoutMs)}, from your
              Stave provider settings.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {props.footer}
    </section>
  );
}
