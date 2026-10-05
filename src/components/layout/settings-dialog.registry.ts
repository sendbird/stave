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
import type { SectionId } from "./settings-dialog.schema";

export interface SettingDefinition<
  Key extends keyof AppSettings = keyof AppSettings,
> {
  key: Key;
  sectionId: SectionId;
  fieldId: string;
  title: string;
  description: string;
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
    "Expected an Auto routing profile",
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
    title: "Enable Auto routing",
    description:
      "Global kill switch for the model router behind the composer's Auto option.",
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
    title: "Auto routing profile",
    description:
      "Routing levels, preference, allowed models, usage budget, signals, and rules the router reads.",
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
    title: "Stop turns at 100% usage",
    description:
      "When Claude, Codex, Cursor, or Kiro reports included account usage at 100%, block new turns and background AI for that provider so extra credits are not spent. Turns that are already running can still finish.",
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
    title: "Background AI",
    description:
      "Per-lane switch, provider, and model for the background calls Stave makes on your behalf: intent guard, turn summary, task naming, utility inference, PR description, pre-PR review, inline completion, and delegated tasks.",
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
    title: "Prompt style",
    description:
      "How you like prompts written: language, tone, detail level, and anything Enhance should always include or never add. Sent with every Enhance request when non-empty.",
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
    title: "Learn from kept and undone rewrites",
    description:
      "Remembers the last few Enhance results you kept or undid and shows them to the rewrite model as examples. Stored locally with your settings.",
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
    title: "Selector models",
    description:
      "Per-provider overrides for which catalog models the model selector lists by default.",
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
    title: "Crane connector",
    description:
      "Pair this Stave installation with your Crane account for locally approved, outbound-only task dispatch.",
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
    title: "Jira connector",
    description:
      "Read your assigned Jira Cloud issues over outbound HTTPS and map Jira projects to local Stave repositories.",
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
    title: "Issues",
    description:
      "Opens on tickets assigned to you. Choose which trackers Issues reads, the first tab, the refresh interval, and whether a kickoff starts immediately.",
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
    title: "Martin sync",
    description:
      "Push workspace events and resource links to a linked Martin project and pull its context snapshot.",
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
    title: "Claude accounts",
    description:
      "Keep more than one Claude sign-in, such as work and personal: add one, sign in, and choose the account new turns use.",
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
    title: "Codex accounts",
    description:
      "Keep more than one Codex sign-in, such as work and personal: add one, sign in, and choose the account new turns use.",
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
    title: "API connections",
    description:
      "Send Claude and Codex turns through a gateway such as Vercel AI Gateway with one key, billed per token instead of a subscription.",
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
    title: "Standalone CLI folder",
    description:
      "Absolute folder the Standalone CLI overlay runs every AI CLI in, without registering it as a repository.",
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
  return [definition.title, definition.description, ...definition.keywords]
    .join(" ")
    .toLowerCase();
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
