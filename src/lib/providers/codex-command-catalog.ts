import { i18n } from "@/i18n/runtime";
import type { ProviderSlashCommand } from "@/lib/providers/provider-command-catalog";

export interface CodexBuiltInSlashCommand extends ProviderSlashCommand {
  category: "session" | "runtime" | "workspace" | "inspection" | "integrations";
  availabilityNote?: string;
}

// Source:
// - https://developers.openai.com/codex/cli/slash-commands
// - verified against the installed Codex CLI/App Server protocol on 2026-06-19
export const CODEX_CLI_SLASH_COMMANDS: readonly CodexBuiltInSlashCommand[] = [
  {
    name: "permissions",
    command: "/permissions",
    get description() { return i18n.t("providers:codexCommandCatalog.adjustApprovalsAndSandboxBehaviorFor"); },
    category: "runtime",
  },
  {
    name: "ide",
    command: "/ide",
    get description() { return i18n.t("providers:codexCommandCatalog.includeAvailableIDEContextSuchAs"); },
    argumentHint: "[prompt]",
    category: "workspace",
  },
  {
    name: "keymap",
    command: "/keymap",
    get description() { return i18n.t("providers:codexCommandCatalog.inspectOrChangeCodexTUIKeyboard"); },
    category: "runtime",
  },
  {
    name: "vim",
    command: "/vim",
    get description() { return i18n.t("providers:codexCommandCatalog.toggleVimEditingModeForThe"); },
    category: "runtime",
  },
  {
    name: "sandbox-add-read-dir",
    command: "/sandbox-add-read-dir",
    get description() { return i18n.t("providers:codexCommandCatalog.addAnotherReadableDirectoryToThe"); },
    argumentHint: "<absolute-dir>",
    category: "runtime",
    get availabilityNote() { return i18n.t("providers:codexCommandCatalog.windowsOnly"); },
  },
  {
    name: "agent",
    command: "/agent",
    get description() { return i18n.t("providers:codexCommandCatalog.switchFocusToASpawnedSubagent"); },
    category: "session",
  },
  {
    name: "apps",
    command: "/apps",
    get description() { return i18n.t("providers:codexCommandCatalog.browseConnectorsAndInsertAnApp"); },
    category: "integrations",
  },
  {
    name: "plugins",
    command: "/plugins",
    get description() { return i18n.t("providers:codexCommandCatalog.inspectInstallAndManageCodexPlugins"); },
    category: "integrations",
  },
  {
    name: "hooks",
    command: "/hooks",
    get description() { return i18n.t("providers:codexCommandCatalog.viewAndManageConfiguredCodexLifecycle"); },
    category: "integrations",
  },
  {
    name: "clear",
    command: "/clear",
    get description() { return i18n.t("providers:codexCommandCatalog.clearTheTerminalAndStartA"); },
    category: "session",
  },
  {
    name: "archive",
    command: "/archive",
    get description() { return i18n.t("providers:codexCommandCatalog.archiveTheCurrentSessionAndExit"); },
    category: "session",
  },
  {
    name: "delete",
    command: "/delete",
    get description() { return i18n.t("providers:codexCommandCatalog.deleteTheCurrentSessionTranscriptAnd"); },
    category: "session",
  },
  {
    name: "compact",
    command: "/compact",
    get description() { return i18n.t("providers:codexCommandCatalog.summarizeTheCurrentConversationToReclaim"); },
    category: "session",
  },
  {
    name: "copy",
    command: "/copy",
    get description() { return i18n.t("providers:codexCommandCatalog.copyTheLatestCompletedCodexOutput"); },
    category: "inspection",
  },
  {
    name: "diff",
    command: "/diff",
    get description() { return i18n.t("providers:codexCommandCatalog.showTheCurrentGitDiffIncluding"); },
    category: "inspection",
  },
  {
    name: "exit",
    command: "/exit",
    get description() { return i18n.t("providers:codexCommandCatalog.exitTheCLIImmediately"); },
    category: "session",
  },
  {
    name: "experimental",
    command: "/experimental",
    get description() { return i18n.t("providers:codexCommandCatalog.toggleExperimentalCodexFeatures"); },
    category: "runtime",
  },
  {
    name: "approve",
    command: "/approve",
    get description() { return i18n.t("providers:codexCommandCatalog.approveOneRetryOfARecent"); },
    category: "runtime",
  },
  {
    name: "memories",
    command: "/memories",
    get description() { return i18n.t("providers:codexCommandCatalog.configureMemoryInjectionAndMemoryGeneration"); },
    category: "runtime",
  },
  {
    name: "skills",
    command: "/skills",
    get description() { return i18n.t("providers:codexCommandCatalog.browseAndSelectCodexSkillsFor"); },
    category: "integrations",
  },
  {
    name: "import",
    command: "/import",
    get description() { return i18n.t("providers:codexCommandCatalog.importSupportedClaudeCodeSetupProject"); },
    category: "integrations",
  },
  {
    name: "feedback",
    command: "/feedback",
    get description() { return i18n.t("providers:codexCommandCatalog.sendLogsAndDiagnosticsToThe"); },
    category: "inspection",
  },
  {
    name: "init",
    command: "/init",
    get description() { return i18n.t("providers:codexCommandCatalog.generateAnAGENTSMdScaffoldFor"); },
    category: "workspace",
  },
  {
    name: "logout",
    command: "/logout",
    get description() { return i18n.t("providers:codexCommandCatalog.signOutOfCodexOnThis"); },
    category: "runtime",
  },
  {
    name: "mcp",
    command: "/mcp",
    get description() { return i18n.t("providers:codexCommandCatalog.listConfiguredMCPToolsAndServers"); },
    category: "integrations",
  },
  {
    name: "mention",
    command: "/mention",
    get description() { return i18n.t("providers:codexCommandCatalog.attachAFileOrFolderReference"); },
    category: "workspace",
  },
  {
    name: "model",
    command: "/model",
    get description() { return i18n.t("providers:codexCommandCatalog.chooseTheActiveModelAndWhen"); },
    category: "runtime",
  },
  {
    name: "fast",
    command: "/fast",
    get description() { return i18n.t("providers:codexCommandCatalog.toggleOrInspectFastModeFor"); },
    // i18n-ignore: literal slash-command argument syntax
    argumentHint: "on | off | status",
    category: "runtime",
  },
  {
    name: "plan",
    command: "/plan",
    get description() { return i18n.t("providers:codexCommandCatalog.switchTheConversationIntoPlanMode"); },
    argumentHint: "[prompt]",
    category: "runtime",
  },
  {
    name: "goal",
    command: "/goal",
    get description() { return i18n.t("providers:codexCommandCatalog.setViewPauseResumeOrClear"); },
    // i18n-ignore: literal slash-command argument syntax
    argumentHint: "[objective | pause | resume | clear]",
    category: "session",
  },
  {
    name: "personality",
    command: "/personality",
    get description() { return i18n.t("providers:codexCommandCatalog.chooseHowCodexCommunicatesInThe"); },
    category: "runtime",
    get availabilityNote() { return i18n.t("providers:messages.personalityUnavailable"); },
  },
  {
    name: "ps",
    command: "/ps",
    get description() { return i18n.t("providers:codexCommandCatalog.showBackgroundTerminalsAndRecentOutput"); },
    category: "inspection",
  },
  {
    name: "stop",
    command: "/stop",
    get description() { return i18n.t("providers:codexCommandCatalog.stopAllBackgroundTerminalsStartedBy"); },
    category: "runtime",
  },
  {
    name: "fork",
    command: "/fork",
    get description() { return i18n.t("providers:codexCommandCatalog.forkTheCurrentConversationIntoA"); },
    category: "session",
  },
  {
    name: "side",
    command: "/side",
    get description() { return i18n.t("providers:codexCommandCatalog.startAnEphemeralSideConversationFrom"); },
    argumentHint: "[prompt]",
    category: "session",
  },
  {
    name: "btw",
    command: "/btw",
    get description() { return i18n.t("providers:codexCommandCatalog.aliasForStartingAnEphemeralSide"); },
    argumentHint: "[prompt]",
    category: "session",
  },
  {
    name: "raw",
    command: "/raw",
    get description() { return i18n.t("providers:codexCommandCatalog.toggleRawScrollbackModeForEasier"); },
    category: "runtime",
  },
  {
    name: "resume",
    command: "/resume",
    get description() { return i18n.t("providers:codexCommandCatalog.resumeASavedConversationFromThe"); },
    category: "session",
  },
  {
    name: "new",
    command: "/new",
    get description() { return i18n.t("providers:codexCommandCatalog.startANewConversationWithoutLeaving"); },
    category: "session",
  },
  {
    name: "quit",
    command: "/quit",
    get description() { return i18n.t("providers:codexCommandCatalog.exitTheCLIImmediately"); },
    category: "session",
  },
  {
    name: "review",
    command: "/review",
    get description() { return i18n.t("providers:codexCommandCatalog.askCodexToReviewTheCurrent"); },
    category: "inspection",
  },
  {
    name: "status",
    command: "/status",
    get description() { return i18n.t("providers:codexCommandCatalog.inspectTheCurrentModelPermissionsRoots"); },
    category: "inspection",
  },
  {
    name: "usage",
    command: "/usage",
    get description() { return i18n.t("providers:codexCommandCatalog.inspectAccountTokenUsageAndAvailable"); },
    // i18n-ignore: literal slash-command argument syntax
    argumentHint: "[daily | weekly | cumulative]",
    category: "inspection",
  },
  {
    name: "debug-config",
    command: "/debug-config",
    get description() { return i18n.t("providers:codexCommandCatalog.printConfigLayerAndPolicyDiagnostics"); },
    category: "inspection",
  },
  {
    name: "statusline",
    command: "/statusline",
    get description() { return i18n.t("providers:codexCommandCatalog.configureWhichFieldsAppearInThe"); },
    category: "runtime",
  },
  {
    name: "title",
    command: "/title",
    get description() { return i18n.t("providers:codexCommandCatalog.configureTerminalTitleFieldsInteractively"); },
    category: "runtime",
  },
  {
    name: "theme",
    command: "/theme",
    get description() { return i18n.t("providers:codexCommandCatalog.chooseATerminalSyntaxHighlightingTheme"); },
    category: "runtime",
  },
];

export function listCodexSlashCommands(): ProviderSlashCommand[] {
  return CODEX_CLI_SLASH_COMMANDS.map((command) => ({
    name: command.name,
    command: command.command,
    description: command.description,
    ...(command.argumentHint ? { argumentHint: command.argumentHint } : {}),
  }));
}

export function getCodexSlashCommandCatalogDetail() {
  return i18n.t("providers:messages.codexCatalogDetail");
}
