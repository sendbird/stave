import { i18n } from "@/i18n";
import { z } from "zod";
import { DEFAULT_REVIEW_TASK_SETTINGS, REVIEW_TASK_SETTING_FIELD_ID, normalizeReviewTaskSettings } from "@/lib/reviews/review-task";
import type { AppSettings } from "@/store/app-settings";
import { CraneConnectorSettingsSchema } from "@/lib/crane-connector/types";
import {
  DEFAULT_JIRA_CONNECTOR_SETTINGS,
  JiraConnectorSettingsSchema,
} from "@/lib/jira-connector/types";
import {
  DEFAULT_TRACKER_ISSUES_SETTINGS,
  TrackerIssuesSettingsSchema,
} from "@/lib/tracker-issues/settings";
import {
  AuxiliaryInferencePolicySchema,
  DEFAULT_AUXILIARY_INFERENCE_POLICY,
} from "@/lib/providers/auxiliary-inference-policy";
import {
  DEFAULT_MARTIN_SYNC_SETTINGS,
  MartinSyncSettingsSchema,
} from "@/lib/martin-sync/types";
import { STANDALONE_CLI_SETTING_FIELD_ID } from "@/components/layout/settings-dialog-standalone-cli-card";
import { AUTO_ROUTING_SETTING_FIELD_ID } from "@/components/layout/settings-dialog-auto-routing-section";
import {
  buildStarterProfile,
  DEFAULT_AUTO_ROUTING_PROFILE_ID,
  validateProfile,
  type AutoRoutingProfile,
} from "@/lib/providers/auto-routing-profile";
import {
  API_CONNECTIONS_FIELD_ID,
  PROVIDER_ACCOUNTS_FIELD_ID,
} from "@/lib/providers/accounts-guide";
import { SYSTEM_ACCOUNT_PROFILE_ID } from "@/lib/providers/provider-accounts";
import {
  buildSettingsSearchText,
  type SectionId,
  type SettingsI18nKey,
} from "./settings-dialog.schema";

export interface SettingDefinition<
  Key extends keyof AppSettings = keyof AppSettings,
> {
  key: Key;
  sectionId: SectionId;
  fieldId: string;
  titleKey: SettingsI18nKey;
  descriptionKey: SettingsI18nKey;
  keywords: readonly string[];
  schema: z.ZodType<AppSettings[Key]>;
  defaultValue: AppSettings[Key];
  scope: "app";
  sensitivity: "plain" | "sensitive";
  applyMode: "next-turn" | "immediate";
  importExport: "include" | "exclude";
}

const AutoRoutingProfileSchema = z
  .custom<AutoRoutingProfile>(
    (value) => typeof value === "object" && value !== null,
    { error: () => i18n.t("settings:messages.invalidRoutingProfile") },
  )
  .transform((value) => validateProfile(value));

export const settingDefinitions = [
  {
    key: "reviewTask",
    sectionId: "prompts",
    fieldId: REVIEW_TASK_SETTING_FIELD_ID,
    title: "Review Tasks",
    description: "Default review rubric, preset, installed skill, custom prompt, models and follow-up instructions.",
    keywords: ["review", "rubric", "preset", "skill", "custom prompt", "checklist", "cross-check", "follow-up"],
    schema: z.record(z.string(), z.unknown()).transform(normalizeReviewTaskSettings),
    defaultValue: DEFAULT_REVIEW_TASK_SETTINGS,
    scope: "app",
    sensitivity: "plain",
    applyMode: "next-turn",
    importExport: "include",
  } satisfies SettingDefinition<"reviewTask">,
  {
    key: "autoRoutingEnabled",
    sectionId: "autoRouting",
    fieldId: AUTO_ROUTING_SETTING_FIELD_ID,
    titleKey: "settings:sections.fields.autoRoutingEnabled.title",
    descriptionKey: "settings:sections.fields.autoRoutingEnabled.description",
    keywords: ["auto", "routing", "router", "enable", "kill switch", "model"],
    schema: z.boolean(),
    defaultValue: false,
    scope: "app",
    sensitivity: "plain",
    applyMode: "next-turn",
    importExport: "include",
  } satisfies SettingDefinition<"autoRoutingEnabled">,
  {
    key: "autoRoutingProfile",
    sectionId: "autoRouting",
    fieldId: AUTO_ROUTING_SETTING_FIELD_ID,
    titleKey: "settings:sections.fields.autoRoutingProfile.title",
    descriptionKey: "settings:sections.fields.autoRoutingProfile.description",
    keywords: [
      "auto",
      "routing",
      "profile",
      "role table",
      "stance",
      "cost saver",
      "quality first",
      "balanced",
      "budget guard",
      "eligible models",
      "delegate",
    ],
    schema: AutoRoutingProfileSchema,
    defaultValue: buildStarterProfile(DEFAULT_AUTO_ROUTING_PROFILE_ID),
    scope: "app",
    sensitivity: "plain",
    applyMode: "next-turn",
    importExport: "include",
  } satisfies SettingDefinition<"autoRoutingProfile">,
  {
    key: "blockTurnsWhenAccountLimitReached",
    sectionId: "providers",
    fieldId: "settings-field-account-usage-limit",
    titleKey: "settings:sections.fields.accountUsageLimit.title",
    descriptionKey: "settings:sections.fields.accountUsageLimit.description",
    keywords: [
      "usage",
      "limit",
      "100%",
      "credits",
      "overage",
      "overages",
      "rate limit",
      "block",
      "stop",
      "spend",
      "claude",
      "codex",
      "cursor",
      "kiro",
    ],
    schema: z.boolean(),
    defaultValue: true,
    scope: "app",
    sensitivity: "plain",
    applyMode: "immediate",
    importExport: "include",
  } satisfies SettingDefinition<"blockTurnsWhenAccountLimitReached">,
  {
    key: "auxiliaryInferencePolicy",
    sectionId: "auxiliaryInference",
    fieldId: "settings-field-auxiliary-inference",
    titleKey: "settings:sections.fields.auxiliaryInference.title",
    descriptionKey: "settings:sections.fields.auxiliaryInference.description",
    keywords: [
      "background ai",
      "auxiliary",
      "aux",
      "cost",
      "spend",
      "credits",
      "tokens",
      "intent guard",
      "turn summary",
      "task name",
      "task naming",
      "utility inference",
      "pr description",
      "pre-pr review",
      "inline completion",
      "delegated task",
      "delegation model",
    ],
    schema: AuxiliaryInferencePolicySchema,
    defaultValue: DEFAULT_AUXILIARY_INFERENCE_POLICY,
    scope: "app",
    sensitivity: "plain",
    applyMode: "next-turn",
    importExport: "include",
  } satisfies SettingDefinition<"auxiliaryInferencePolicy">,
  {
    key: "promptEnhancementStyleProfile",
    sectionId: "auxiliaryInference",
    fieldId: "settings-field-prompt-enhancement",
    titleKey: "settings:sections.fields.promptStyle.title",
    descriptionKey: "settings:sections.fields.promptStyle.description",
    keywords: [
      "prompt enhancement",
      "enhance",
      "prompt style",
      "taste",
      "preferences",
      "rewrite",
    ],
    schema: z.string(),
    defaultValue: "",
    scope: "app",
    sensitivity: "plain",
    applyMode: "immediate",
    importExport: "include",
  } satisfies SettingDefinition<"promptEnhancementStyleProfile">,
  {
    key: "promptEnhancementLearnFromEdits",
    sectionId: "auxiliaryInference",
    fieldId: "settings-field-prompt-enhancement",
    titleKey: "settings:sections.fields.promptLearnFromEdits.title",
    descriptionKey: "settings:sections.fields.promptLearnFromEdits.description",
    keywords: ["prompt enhancement", "enhance", "learn", "undo", "examples"],
    schema: z.boolean(),
    defaultValue: true,
    scope: "app",
    sensitivity: "plain",
    applyMode: "immediate",
    importExport: "include",
  } satisfies SettingDefinition<"promptEnhancementLearnFromEdits">,
  {
    key: "modelVisibility",
    sectionId: "models",
    fieldId: "settings-field-model-visibility",
    titleKey: "settings:sections.fields.modelVisibility.title",
    descriptionKey: "settings:sections.fields.modelVisibility.description",
    keywords: [
      "model visibility",
      "hidden models",
      "hide model",
      "show model",
      "selector models",
      "latest models",
      "model list",
    ],
    // Loose on purpose: the authoritative shape lives in `model-visibility.ts`
    // and is re-normalized on load, so a stricter mirror here would only add a
    // second place to forget when a provider is added.
    schema: z.record(z.string(), z.unknown()),
    defaultValue: {},
    scope: "app",
    sensitivity: "plain",
    applyMode: "immediate",
    importExport: "include",
  } satisfies SettingDefinition<"modelVisibility">,
  {
    key: "craneConnector",
    sectionId: "integrations",
    fieldId: "settings-field-crane-connector",
    titleKey: "settings:sections.fields.craneConnector.title",
    descriptionKey: "settings:sections.fields.craneConnector.description",
    keywords: [
      "crane",
      "atelier",
      "connector",
      "pair",
      "dispatch",
      "remote",
      "integration",
      "outbound",
      "repository mapping",
    ],
    schema: CraneConnectorSettingsSchema,
    defaultValue: {
      enabled: false,
      baseUrl: "https://atelier.delight-tools.ai",
      pollIntervalSeconds: 15,
      repositoryMappings: [],
    },
    scope: "app",
    sensitivity: "sensitive",
    applyMode: "immediate",
    importExport: "exclude",
  } satisfies SettingDefinition<"craneConnector">,
  {
    key: "jiraConnector",
    sectionId: "integrations",
    fieldId: "settings-field-jira-connector",
    titleKey: "settings:sections.fields.jiraConnector.title",
    descriptionKey: "settings:sections.fields.jiraConnector.description",
    keywords: [
      "jira",
      "jira cloud",
      "atlassian",
      "site url",
      "jql",
      "api token",
      "issue",
      "issues",
      "ticket",
      "tracker",
      "integration",
      "outbound",
      "repository mapping",
    ],
    schema: JiraConnectorSettingsSchema,
    // Spread rather than shared: the frozen default carries a frozen mappings
    // array, and a definition default must stay writable for consumers that
    // reset a row by assigning it.
    defaultValue: {
      ...DEFAULT_JIRA_CONNECTOR_SETTINGS,
      repositoryMappings: [],
    },
    scope: "app",
    // Sensitive and export-excluded because the site URL plus the mapping table
    // describe a private tracker, and the credential it pairs with lives in the
    // main-process vault where an export could never round-trip it anyway.
    sensitivity: "sensitive",
    applyMode: "immediate",
    importExport: "exclude",
  } satisfies SettingDefinition<"jiraConnector">,
  {
    key: "trackerIssues",
    sectionId: "issues",
    fieldId: "settings-field-tracker-issues",
    titleKey: "settings:sections.fields.trackerIssues.title",
    descriptionKey: "settings:sections.fields.trackerIssues.description",
    keywords: [
      "tasks",
      "tickets",
      "tracker",
      "issues",
      "default view",
      "refresh",
      "poll",
      "interval",
      "kickoff",
      "start mode",
      "stage",
      "jira",
      "crane",
      "source",
    ],
    schema: TrackerIssuesSettingsSchema,
    defaultValue: { ...DEFAULT_TRACKER_ISSUES_SETTINGS },
    scope: "app",
    sensitivity: "plain",
    applyMode: "immediate",
    importExport: "include",
  } satisfies SettingDefinition<"trackerIssues">,
  {
    key: "martinSync",
    sectionId: "integrations",
    fieldId: "settings-field-martin-sync",
    titleKey: "settings:sections.fields.martinSync.title",
    descriptionKey: "settings:sections.fields.martinSync.description",
    keywords: [
      "martin",
      "atelier",
      "sync",
      "project",
      "events",
      "links",
      "outbox",
      "connector",
    ],
    schema: MartinSyncSettingsSchema,
    defaultValue: { ...DEFAULT_MARTIN_SYNC_SETTINGS },
    scope: "app",
    sensitivity: "sensitive",
    applyMode: "immediate",
    importExport: "exclude",
  } satisfies SettingDefinition<"martinSync">,
  // Account selections are machine-local profile ids, so they never travel in
  // an export. An API connection is an account under each runtime it serves:
  // picking it selects it.
  {
    key: "claudeAccountProfileId",
    sectionId: "tooling",
    fieldId: PROVIDER_ACCOUNTS_FIELD_ID["claude-code"],
    titleKey: "settings:sections.fields.claudeAccounts.title",
    descriptionKey: "settings:sections.fields.claudeAccounts.description",
    keywords: [
      "account",
      "accounts",
      "sign in",
      "sign-in",
      "login",
      "log in",
      "switch account",
      "second account",
      "subscription",
      "profile",
      "config folder",
      "claude_config_dir",
      "claude",
    ],
    schema: z.string().optional(),
    defaultValue: SYSTEM_ACCOUNT_PROFILE_ID,
    scope: "app",
    sensitivity: "plain",
    applyMode: "next-turn",
    importExport: "exclude",
  } satisfies SettingDefinition<"claudeAccountProfileId">,
  {
    key: "codexAccountProfileId",
    sectionId: "tooling",
    fieldId: PROVIDER_ACCOUNTS_FIELD_ID.codex,
    titleKey: "settings:sections.fields.codexAccounts.title",
    descriptionKey: "settings:sections.fields.codexAccounts.description",
    keywords: [
      "account",
      "accounts",
      "sign in",
      "sign-in",
      "login",
      "log in",
      "switch account",
      "second account",
      "subscription",
      "chatgpt",
      "profile",
      "config folder",
      "codex_home",
      "codex",
    ],
    schema: z.string().optional(),
    defaultValue: SYSTEM_ACCOUNT_PROFILE_ID,
    scope: "app",
    sensitivity: "plain",
    applyMode: "next-turn",
    importExport: "exclude",
  } satisfies SettingDefinition<"codexAccountProfileId">,
  {
    key: "claudeAccountProfileId",
    sectionId: "tooling",
    fieldId: API_CONNECTIONS_FIELD_ID,
    titleKey: "settings:sections.fields.apiConnections.title",
    descriptionKey: "settings:sections.fields.apiConnections.description",
    keywords: [
      "gateway",
      "api gateway",
      "ai gateway",
      "api connection",
      "vercel",
      "api key",
      "base url",
      "api billing",
      "per token",
      "endpoint",
      "proxy",
      "anthropic_base_url",
      "model_provider",
      "llm gateway",
      "open models",
      "kimi",
      "glm",
      "qwen",
      "deepseek",
      "gpt-oss",
    ],
    schema: z.string().optional(),
    defaultValue: SYSTEM_ACCOUNT_PROFILE_ID,
    scope: "app",
    sensitivity: "plain",
    applyMode: "next-turn",
    importExport: "exclude",
  } satisfies SettingDefinition<"claudeAccountProfileId">,
  {
    key: "standaloneCliFolderPath",
    sectionId: "general",
    fieldId: STANDALONE_CLI_SETTING_FIELD_ID,
    titleKey: "settings:sections.fields.standaloneCliFolder.title",
    descriptionKey: "settings:sections.fields.standaloneCliFolder.description",
    keywords: [
      "standalone",
      "cli",
      "folder",
      "scratch",
      "unregistered",
      "claude",
      "codex",
      "terminal",
    ],
    schema: z.string(),
    defaultValue: "",
    scope: "app",
    sensitivity: "plain",
    applyMode: "immediate",
    importExport: "include",
  } satisfies SettingDefinition<"standaloneCliFolderPath">,
] as const;

export function getSettingsFieldSearchText<Key extends keyof AppSettings>(
  definition: SettingDefinition<Key>,
) {
  return buildSettingsSearchText(
    [definition.titleKey, definition.descriptionKey],
    definition.keywords,
  );
}

export function matchesSettingsField<Key extends keyof AppSettings>(
  definition: SettingDefinition<Key>,
  query: string,
) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return false;
  }
  const haystack = getSettingsFieldSearchText(definition);
  return terms.every((term) => haystack.includes(term));
}

export function searchSettingsFields(query: string) {
  return settingDefinitions.filter((definition) =>
    matchesSettingsField(definition, query),
  );
}
