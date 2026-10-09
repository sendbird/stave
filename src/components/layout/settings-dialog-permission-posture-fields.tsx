import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { Badge } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import {
  buildClaudeProviderModeSettingsPatch,
  buildCodexProviderModeSettingsPatch,
  CLAUDE_PROVIDER_MODE_PRESETS,
  CODEX_PROVIDER_MODE_PRESETS,
  detectClaudeProviderModePreset,
  detectCodexProviderModePreset,
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
import { providersStyles } from "./settings-dialog-providers-section.styles";
import {
  ScopedFieldStatus,
  useScopedSetting,
  useScopedSettingsWriter,
} from "./settings-scope";

/**
 * Permission posture controls for the Providers section: the mode preset and
 * the permission, sandbox and approval fields each provider exposes. These are
 * the Providers keys a project may override (see
 * `src/store/project-settings-overrides.ts`), so every control reads and
 * writes through the Settings scope.
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
  const { t } = useTranslation(I18N_NAMESPACES);
  const claudePermissionMode = useScopedSetting("claudePermissionMode").value;
  const claudeAllowDangerouslySkipPermissions = useScopedSetting(
    "claudeAllowDangerouslySkipPermissions",
  ).value;
  const claudeSandboxEnabled = useScopedSetting("claudeSandboxEnabled").value;
  const claudeAllowUnsandboxedCommands = useScopedSetting(
    "claudeAllowUnsandboxedCommands",
  ).value;
  const presetId = detectClaudeProviderModePreset({
    settings: {
      claudePermissionMode,
      claudeAllowDangerouslySkipPermissions,
      claudeSandboxEnabled,
      claudeAllowUnsandboxedCommands,
    },
  });
  const label = presetId
    ? (CLAUDE_PROVIDER_MODE_PRESETS.find((preset) => preset.id === presetId)
        ?.label ?? t("common:labels.custom"))
    : t("common:labels.custom");
  return {
    claudePermissionMode,
    claudeAllowDangerouslySkipPermissions,
    claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands,
    presetId,
    label,
  };
}

export function ClaudeModeBadge() {
  const { presetId, label } = useClaudePosture();
  return <Badge variant={presetId ? "secondary" : "outline"}>{label}</Badge>;
}

export function ClaudePermissionPostureFields() {
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
        <p className={sx(providersStyles.presetHint)}>
          {posture.presetId
            ? t("settingsProviders:settingsDialogProvidersSection.isActiveReapplyAPresetAny", { value1: posture.label })
            : t("settingsProviders:providersSection.claudeRuntime.modePreset.custom")}
        </p>
      </LabeledField>
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
    </>
  );
}

function useCodexPosture() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const codexFileAccess = useScopedSetting("codexFileAccess").value;
  const codexApprovalPolicy = useScopedSetting("codexApprovalPolicy").value;
  const codexNetworkAccess = useScopedSetting("codexNetworkAccess").value;
  // Web search is part of the Codex presets but stays global.
  const codexWebSearch = useAppStore((state) => state.settings.codexWebSearch);
  const presetId = detectCodexProviderModePreset({
    settings: {
      codexFileAccess,
      codexApprovalPolicy,
      codexNetworkAccess,
      codexWebSearch,
    },
  });
  const label = presetId
    ? (CODEX_PROVIDER_MODE_PRESETS.find((preset) => preset.id === presetId)
        ?.label ?? t("common:labels.custom"))
    : t("common:labels.custom");
  return {
    codexFileAccess,
    codexApprovalPolicy,
    codexNetworkAccess,
    presetId,
    label,
  };
}

export function CodexModeBadge() {
  const { presetId, label } = useCodexPosture();
  return <Badge variant={presetId ? "secondary" : "outline"}>{label}</Badge>;
}

export function CodexPermissionPostureFields() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const posture = useCodexPosture();
  const codexAppToolApprovalMode = useScopedSetting("codexAppToolApprovalMode").value;
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
        <p className={sx(providersStyles.presetHint)}>
          {posture.presetId
            ? t("settingsProviders:settingsDialogProvidersSection.isActiveReapplyAPresetAnyVariantcdc4723b", { value1: posture.label })
            : t("settingsProviders:providersSection.codexRuntime.modePreset.custom")}
        </p>
      </LabeledField>
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
            value={codexAppToolApprovalMode}
            options={CODEX_APP_TOOL_APPROVAL_HELP}
            onValueChange={(value) => write({ codexAppToolApprovalMode: value })}
          />
        </LabeledField>
      ) : null}
    </>
  );
}
