import type { ReactNode } from "react";
import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { Badge } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import {
  buildClaudeProviderModeSettingsPatch,
  buildCodexProviderModeSettingsPatch,
  CLAUDE_PROVIDER_MODE_PRESETS,
  CODEX_PROVIDER_MODE_PRESETS,
  resolveClaudeProviderModePresentation,
  resolveCodexProviderModePresentation,
  type ProviderModePresetDefinition,
  type ProviderModePresetId,
} from "@/lib/providers/provider-mode-presets";
import type { ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";
import {
  ChoiceButtons,
  LabeledField,
  SettingsFieldGuide,
  SwitchField,
} from "./settings-dialog.shared";
import {
  buildGuideExamples,
  buildGuideItems,
  type ExplainedSelectOption,
} from "./settings-dialog-effort-help";
import { DescribedSelect } from "./settings-dialog-described-select";
import { SettingsAdvancedDisclosure } from "./settings-dialog-advanced-disclosure";
import {
  PROVIDER_PERMISSIONS_FIELD_ID,
  useCustomizePermissionsOpen,
} from "./settings-dialog-providers-focus";
import { providersStyles } from "./settings-dialog-providers-section.styles";
import {
  ScopedFieldStatus,
  useScopedSetting,
  useScopedSettingsWriter,
} from "./settings-scope";

/**
 * Permission posture controls for the Providers section: the mode preset, and
 * under it a collapsed "Customize permissions" group with the permission,
 * sandbox and approval fields the preset sets. These are the Providers keys a
 * project may override (see `src/store/project-settings-overrides.ts`), so
 * every control reads and writes through the Settings scope.
 */

const CLAUDE_PERMISSION_MODE_HELP = [
  {
    value: "default",
    label: "default",
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.default.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.default.example"); },
  },
  {
    value: "acceptEdits",
    label: "acceptEdits",
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.acceptEdits.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.acceptEdits.example"); },
  },
  {
    value: "bypassPermissions",
    label: "bypassPermissions",
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.bypassPermissions.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.bypassPermissions.example"); },
  },
  {
    value: "dontAsk",
    label: "dontAsk",
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.dontAsk.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.dontAsk.example"); },
  },
  {
    value: "auto",
    label: "auto",
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.auto.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.auto.example"); },
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["claudePermissionMode"]>
>[];

const CODEX_FILE_ACCESS_HELP = [
  {
    value: "read-only",
    label: "read-only",
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.fileAccess.options.readOnly.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.fileAccess.options.readOnly.example"); },
  },
  {
    value: "workspace-write",
    label: "workspace-write",
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.fileAccess.options.workspaceWrite.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.fileAccess.options.workspaceWrite.example"); },
  },
  {
    value: "danger-full-access",
    label: "danger-full-access",
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.fileAccess.options.dangerFullAccess.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.fileAccess.options.dangerFullAccess.example"); },
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexFileAccess"]>
>[];

const CODEX_APPROVAL_POLICY_HELP = [
  {
    value: "untrusted",
    label: "untrusted",
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.approvals.options.untrusted.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.approvals.options.untrusted.example"); },
  },
  {
    value: "never",
    label: "never",
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.approvals.options.never.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.approvals.options.never.example"); },
  },
  {
    value: "on-request",
    label: "on-request",
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.approvals.options.onRequest.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.approvals.options.onRequest.example"); },
  },
  {
    value: "on-failure",
    label: "on-failure",
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.approvals.options.onFailure.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.approvals.options.onFailure.example"); },
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexApprovalPolicy"]>
>[];

const CODEX_APP_TOOL_APPROVAL_HELP = [
  {
    value: "inherit",
    get label() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.inherit.label"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.inherit.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.inherit.example"); },
  },
  {
    value: "auto",
    get label() { return i18n.t("common:labels.auto"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.auto.description"); },
  },
  {
    value: "prompt",
    get label() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.prompt.label"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.prompt.description"); },
  },
  {
    value: "writes",
    get label() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.writes.label"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.writes.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.writes.example"); },
  },
  {
    value: "approve",
    get label() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.approve.label"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.approve.description"); },
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexAppToolApprovalMode"]>
>[];

function ProviderModePresetButtons(args: {
  presets: readonly ProviderModePresetDefinition[];
  activePresetId: ProviderModePresetId | null;
  onSelect: (presetId: ProviderModePresetId) => void;
}) {
  return (
    <ChoiceButtons
      columns={3}
      value={args.activePresetId ?? ""}
      onChange={(value) => args.onSelect(value as ProviderModePresetId)}
      options={args.presets.map((preset) => ({
        value: preset.id,
        label: preset.label,
        description: preset.description,
      }))}
    />
  );
}

/**
 * The fields a preset sets, folded under the preset. It opens by itself when
 * the combination matches no preset, when the selected project overrides one
 * of them, and for a deep link to it. Its wrapper is the deep-link target;
 * landing there focuses the trigger.
 */
function CustomizePermissions(args: {
  fieldId: string;
  description: string;
  expand: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { open, onOpenChange } = useCustomizePermissionsOpen({
    fieldId: args.fieldId,
    expand: args.expand,
  });
  return (
    <div id={args.fieldId} tabIndex={-1} data-focus-first-control="">
      <SettingsAdvancedDisclosure
        compact
        open={open}
        onOpenChange={onOpenChange}
        title={t("settingsProviders:providersSection.customizePermissions.title")}
        description={args.description}
      >
        {args.children}
      </SettingsAdvancedDisclosure>
    </div>
  );
}

const CLAUDE_POSTURE_KEYS = [
  "claudePermissionMode",
  "claudeAllowDangerouslySkipPermissions",
  "claudeSandboxEnabled",
  "claudeAllowUnsandboxedCommands",
] as const;
const CODEX_POSTURE_KEYS = [
  "codexFileAccess",
  "codexApprovalPolicy",
  "codexNetworkAccess",
] as const;

function useClaudePosture() {
  // Subscribes to the UI language so the label and summary follow it.
  useTranslation(I18N_NAMESPACES);
  const permissionMode = useScopedSetting("claudePermissionMode");
  const dangerousSkip = useScopedSetting("claudeAllowDangerouslySkipPermissions");
  const sandbox = useScopedSetting("claudeSandboxEnabled");
  const unsandboxed = useScopedSetting("claudeAllowUnsandboxedCommands");
  const presentation = resolveClaudeProviderModePresentation({
    settings: {
      claudePermissionMode: permissionMode.value,
      claudeAllowDangerouslySkipPermissions: dangerousSkip.value,
      claudeSandboxEnabled: sandbox.value,
      claudeAllowUnsandboxedCommands: unsandboxed.value,
    },
  });
  const presetId = presentation.id === "custom" ? null : presentation.id;
  return {
    claudePermissionMode: permissionMode.value,
    claudeAllowDangerouslySkipPermissions: dangerousSkip.value,
    claudeSandboxEnabled: sandbox.value,
    claudeAllowUnsandboxedCommands: unsandboxed.value,
    presetId,
    label: presentation.label,
    detail: presentation.detail,
    /** The selected project overrides one of these fields. */
    overridden: [permissionMode, dangerousSkip, sandbox, unsandboxed].some(
      (setting) => setting.overridden,
    ),
  };
}

export function ClaudeModeBadge() {
  const { presetId, label } = useClaudePosture();
  return <Badge variant={presetId ? "secondary" : "outline"}>{label}</Badge>;
}

/**
 * `children` (global-only fields, such as the Agent guardrails) render at the
 * end of the Customize permissions group.
 */
export function ClaudePermissionPostureFields(args: { children?: ReactNode }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const posture = useClaudePosture();
  const { write } = useScopedSettingsWriter();
  const presetTitle = t("settingsProviders:providersSection.modePresetTitle");
  const permissionTitle = t("settingsProviders:providersSection.claudeRuntime.permissionMode.title");
  const skipTitle = t("settingsProviders:providersSection.claudeRuntime.dangerousSkip.title");
  const sandboxTitle = t("settingsProviders:providersSection.claudeRuntime.sandbox.title");
  const unsandboxedTitle = t("settingsProviders:providersSection.claudeRuntime.unsandboxedCommands.title");

  return (
    <>
      <LabeledField
        title={presetTitle}
        description={t("settingsProviders:providersSection.claudeRuntime.modePreset.description")}
        guide={<ScopedFieldStatus keys={CLAUDE_POSTURE_KEYS} label={presetTitle} />}
      >
        <ProviderModePresetButtons
          presets={CLAUDE_PROVIDER_MODE_PRESETS}
          activePresetId={posture.presetId}
          onSelect={(presetId) =>
            write(buildClaudeProviderModeSettingsPatch({ presetId }))
          }
        />
        <p className={sx(providersStyles.presetHint)} data-preset-summary="">
          {posture.presetId
            ? t("settingsProviders:providersSection.claudeRuntime.modePreset.active", { preset: posture.label, detail: posture.detail })
            : t("settingsProviders:providersSection.claudeRuntime.modePreset.custom", { detail: posture.detail })}
        </p>
      </LabeledField>
      <CustomizePermissions
        fieldId={PROVIDER_PERMISSIONS_FIELD_ID["claude-code"]}
        description={t("settingsProviders:providersSection.customizePermissions.claudeDescription")}
        expand={!posture.presetId || posture.overridden}
      >
        <LabeledField
          title={permissionTitle}
          description={t("settingsProviders:providersSection.claudeRuntime.permissionMode.description")}
          guide={
            <>
              <SettingsFieldGuide
                title={t("settingsProviders:providersSection.claudeRuntime.permissionMode.guide.title")}
                summary={t("settingsProviders:providersSection.claudeRuntime.permissionMode.guide.summary")}
                items={buildGuideItems(CLAUDE_PERMISSION_MODE_HELP)}
                examples={buildGuideExamples(CLAUDE_PERMISSION_MODE_HELP)}
                tooltip={t("settingsProviders:providersSection.claudeRuntime.permissionMode.guide.tooltip")}
              />
              <ScopedFieldStatus keys={["claudePermissionMode"]} label={permissionTitle} />
            </>
          }
        >
          <DescribedSelect
            value={posture.claudePermissionMode}
            options={CLAUDE_PERMISSION_MODE_HELP}
            onValueChange={(value) => write({ claudePermissionMode: value })}
          />
        </LabeledField>
        <SwitchField
          title={skipTitle}
          description={t("settingsProviders:providersSection.claudeRuntime.dangerousSkip.description")}
          guide={
            <ScopedFieldStatus
              keys={["claudeAllowDangerouslySkipPermissions"]}
              label={skipTitle}
            />
          }
          checked={posture.claudeAllowDangerouslySkipPermissions}
          onCheckedChange={(checked) =>
            write({ claudeAllowDangerouslySkipPermissions: checked })
          }
        />
        <SwitchField
          title={sandboxTitle}
          description={t("settingsProviders:providersSection.claudeRuntime.sandbox.description")}
          guide={<ScopedFieldStatus keys={["claudeSandboxEnabled"]} label={sandboxTitle} />}
          checked={posture.claudeSandboxEnabled}
          onCheckedChange={(checked) => write({ claudeSandboxEnabled: checked })}
        />
        <SwitchField
          title={unsandboxedTitle}
          description={t("settingsProviders:providersSection.claudeRuntime.unsandboxedCommands.description")}
          guide={
            <ScopedFieldStatus
              keys={["claudeAllowUnsandboxedCommands"]}
              label={unsandboxedTitle}
            />
          }
          checked={posture.claudeAllowUnsandboxedCommands}
          onCheckedChange={(checked) =>
            write({ claudeAllowUnsandboxedCommands: checked })
          }
        />
        {args.children}
      </CustomizePermissions>
    </>
  );
}

function useCodexPosture() {
  // Subscribes to the UI language so the label and summary follow it.
  useTranslation(I18N_NAMESPACES);
  const fileAccess = useScopedSetting("codexFileAccess");
  const approvalPolicy = useScopedSetting("codexApprovalPolicy");
  const networkAccess = useScopedSetting("codexNetworkAccess");
  const appToolApprovals = useScopedSetting("codexAppToolApprovalMode");
  // Web search is part of the Codex presets but stays global.
  const codexWebSearch = useAppStore((state) => state.settings.codexWebSearch);
  const presentation = resolveCodexProviderModePresentation({
    settings: {
      codexFileAccess: fileAccess.value,
      codexApprovalPolicy: approvalPolicy.value,
      codexNetworkAccess: networkAccess.value,
      codexWebSearch,
    },
  });
  const presetId = presentation.id === "custom" ? null : presentation.id;
  return {
    codexFileAccess: fileAccess.value,
    codexApprovalPolicy: approvalPolicy.value,
    codexNetworkAccess: networkAccess.value,
    codexAppToolApprovalMode: appToolApprovals.value,
    presetId,
    label: presentation.label,
    detail: presentation.detail,
    /** The selected project overrides one of these fields. */
    overridden: [fileAccess, approvalPolicy, networkAccess, appToolApprovals].some(
      (setting) => setting.overridden,
    ),
  };
}

export function CodexModeBadge() {
  const { presetId, label } = useCodexPosture();
  return <Badge variant={presetId ? "secondary" : "outline"}>{label}</Badge>;
}

/**
 * `children` (global-only fields, such as web search) render at the end of
 * the Customize permissions group.
 */
export function CodexPermissionPostureFields(args: { children?: ReactNode }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const posture = useCodexPosture();
  const appToolModesAvailable = useAppStore(
    (state) =>
      state.providerRuntimeCapabilities.codex.approval.appToolModes.length > 0,
  );
  const { write } = useScopedSettingsWriter();
  const presetTitle = t("settingsProviders:providersSection.modePresetTitle");
  const networkTitle = t("settingsProviders:providersSection.codexRuntime.networkAccess.title");
  const fileAccessTitle = t("settingsProviders:providersSection.codexRuntime.fileAccess.title");
  const approvalsTitle = t("settingsProviders:providersSection.codexRuntime.approvals.title");
  const appToolTitle = t("settingsProviders:providersSection.codexRuntime.appToolApprovals.title");

  return (
    <>
      <LabeledField
        title={presetTitle}
        description={t("settingsProviders:providersSection.codexRuntime.modePreset.description")}
        guide={<ScopedFieldStatus keys={CODEX_POSTURE_KEYS} label={presetTitle} />}
      >
        <ProviderModePresetButtons
          presets={CODEX_PROVIDER_MODE_PRESETS}
          activePresetId={posture.presetId}
          onSelect={(presetId) =>
            write(buildCodexProviderModeSettingsPatch({ presetId }))
          }
        />
        <p className={sx(providersStyles.presetHint)} data-preset-summary="">
          {posture.presetId
            ? t("settingsProviders:providersSection.codexRuntime.modePreset.active", { preset: posture.label, detail: posture.detail })
            : t("settingsProviders:providersSection.codexRuntime.modePreset.custom", { detail: posture.detail })}
        </p>
      </LabeledField>
      <CustomizePermissions
        fieldId={PROVIDER_PERMISSIONS_FIELD_ID.codex}
        description={t("settingsProviders:providersSection.customizePermissions.codexDescription")}
        expand={!posture.presetId || posture.overridden}
      >
        <SwitchField
          title={networkTitle}
          description={t("settingsProviders:providersSection.codexRuntime.networkAccess.description")}
          guide={<ScopedFieldStatus keys={["codexNetworkAccess"]} label={networkTitle} />}
          checked={posture.codexNetworkAccess}
          onCheckedChange={(checked) => write({ codexNetworkAccess: checked })}
        />
        <LabeledField
          title={fileAccessTitle}
          guide={
            <>
              <SettingsFieldGuide
                title={t("settingsProviders:providersSection.codexRuntime.fileAccess.guide.title")}
                summary={t("settingsProviders:providersSection.codexRuntime.fileAccess.guide.summary")}
                items={buildGuideItems(CODEX_FILE_ACCESS_HELP)}
                examples={buildGuideExamples(CODEX_FILE_ACCESS_HELP)}
                tooltip={t("settingsProviders:providersSection.codexRuntime.fileAccess.guide.tooltip")}
              />
              <ScopedFieldStatus keys={["codexFileAccess"]} label={fileAccessTitle} />
            </>
          }
        >
          <DescribedSelect
            value={posture.codexFileAccess}
            options={CODEX_FILE_ACCESS_HELP}
            onValueChange={(value) => write({ codexFileAccess: value })}
          />
        </LabeledField>
        <LabeledField
          title={approvalsTitle}
          guide={
            <>
              <SettingsFieldGuide
                title={t("settingsProviders:providersSection.codexRuntime.approvals.guide.title")}
                summary={t("settingsProviders:providersSection.codexRuntime.approvals.guide.summary")}
                items={buildGuideItems(CODEX_APPROVAL_POLICY_HELP)}
                examples={buildGuideExamples(CODEX_APPROVAL_POLICY_HELP)}
                tooltip={t("settingsProviders:providersSection.codexRuntime.approvals.guide.tooltip")}
              />
              <ScopedFieldStatus keys={["codexApprovalPolicy"]} label={approvalsTitle} />
            </>
          }
        >
          <DescribedSelect
            value={posture.codexApprovalPolicy}
            options={CODEX_APPROVAL_POLICY_HELP}
            onValueChange={(value) => write({ codexApprovalPolicy: value })}
          />
        </LabeledField>
        {appToolModesAvailable ? (
          <LabeledField
            title={appToolTitle}
            description={t("settingsProviders:providersSection.codexRuntime.appToolApprovals.description")}
            guide={
              <>
                <SettingsFieldGuide
                  title={t("settingsProviders:providersSection.codexRuntime.appToolApprovals.guide.title")}
                  summary={t("settingsProviders:providersSection.codexRuntime.appToolApprovals.guide.summary")}
                  items={buildGuideItems(CODEX_APP_TOOL_APPROVAL_HELP)}
                  examples={buildGuideExamples(CODEX_APP_TOOL_APPROVAL_HELP)}
                  note={t("settingsProviders:messages.writesTrustNote")}
                  tooltip={t("settingsProviders:providersSection.codexRuntime.appToolApprovals.guide.tooltip")}
                />
                <ScopedFieldStatus keys={["codexAppToolApprovalMode"]} label={appToolTitle} />
              </>
            }
          >
            <DescribedSelect
              value={posture.codexAppToolApprovalMode}
              options={CODEX_APP_TOOL_APPROVAL_HELP}
              onValueChange={(value) => write({ codexAppToolApprovalMode: value })}
            />
          </LabeledField>
        ) : null}
        {args.children}
      </CustomizePermissions>
    </>
  );
}
