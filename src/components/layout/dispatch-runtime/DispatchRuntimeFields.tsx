import type { ReactNode } from "react";
import { Accordion } from "@/components/ads/components/Accordion";
import { Select } from "@/components/ads/components/Select";
import { Switch } from "@/components/ads/components/Switch";
import { sx } from "@/components/ads/utils/stylex";
import { ModelEffortSelector } from "@/components/ai-elements/model-effort-selector";
import { ChoiceButtons } from "@/components/layout/settings-dialog.shared";
import type { CraneDispatchAccessState } from "@/lib/crane-connector/dispatch-runtime";
import type { ProviderModePresetId } from "@/lib/providers/provider-mode-presets";
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

/** The "How it runs" controls: model, effort, autonomy and access. */
export function DispatchRuntimeFields(props: DispatchRuntimeFieldsProps) {
  const { draft, idPrefix } = props;
  const { access, model, setAccess } = draft;
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
