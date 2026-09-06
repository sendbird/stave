import { z } from "zod";
import {
  ADVISOR_SETTING_FIELD_ID,
  DEFAULT_ADVISOR_CONSULT_LIMIT,
} from "@/lib/providers/advisor";
import {
  getSdkModelOptions,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { AppSettings } from "@/store/app-settings";
import { CraneConnectorSettingsSchema } from "@/lib/crane-connector/types";
import {
  DEFAULT_JIRA_CONNECTOR_SETTINGS,
  JiraConnectorSettingsSchema,
} from "@/lib/jira-connector/types";
import {
  DEFAULT_TRACKER_TASKS_SETTINGS,
  TrackerTasksSettingsSchema,
} from "@/lib/tracker-tasks/settings";
import {
  AuxiliaryInferencePolicySchema,
  DEFAULT_AUXILIARY_INFERENCE_POLICY,
} from "@/lib/providers/auxiliary-inference-policy";
import {
  DEFAULT_MARTIN_SYNC_SETTINGS,
  MartinSyncSettingsSchema,
} from "@/lib/martin-sync/types";
import { STANDALONE_CLI_SETTING_FIELD_ID } from "@/components/layout/settings-dialog-standalone-cli-card";
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

const AdvisorEffortSchema = z.enum([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
]);

const AdvisorPickSchema = z
  .object({
    providerId: z.enum(["claude-code", "codex"]),
    model: z.string().trim().min(1).max(200),
    // Absent means "follow the model's provider default", so the field is
    // optional rather than defaulted — see `resolveAdvisorEffort`.
    effort: AdvisorEffortSchema.optional(),
  })
  .strict();

const AdvisorTargetSchema = AdvisorPickSchema.nullable();

const AdvisorTargetByProviderSchema = z.object({
  "claude-code": AdvisorPickSchema.omit({ providerId: true }).optional(),
  codex: AdvisorPickSchema.omit({ providerId: true }).optional(),
});

const ADVISOR_MODEL_SEARCH_KEYWORDS = (
  ["claude-code", "codex"] as const
).flatMap((providerId) =>
  getSdkModelOptions({ providerId }).flatMap((model) => [
    model,
    toHumanModelName({ model }),
  ]),
);

export const settingDefinitions = [
  {
    key: "advisorTarget",
    sectionId: "providers",
    fieldId: ADVISOR_SETTING_FIELD_ID,
    title: "Advisor",
    description:
      "Arm an isolated read-only Claude or Codex Advisor the primary can consult on demand during its turn.",
    keywords: [
      "advisor",
      "on demand",
      "second opinion",
      "review",
      "consult",
      "read only",
      "claude",
      "claude advisor",
      "codex",
      "codex advisor",
      "fable",
      "astra",
      "model",
      ...ADVISOR_MODEL_SEARCH_KEYWORDS,
    ],
    schema: AdvisorTargetSchema,
    defaultValue: null,
    scope: "app",
    sensitivity: "plain",
    applyMode: "next-turn",
    importExport: "include",
  } satisfies SettingDefinition<"advisorTarget">,
  {
    key: "advisorEnabled",
    sectionId: "providers",
    fieldId: ADVISOR_SETTING_FIELD_ID,
    title: "Arm an Advisor by default",
    description:
      "Whether new tasks start with the default Advisor armed. Off keeps the configured provider, model, and effort for later.",
    keywords: ["advisor", "default", "arm", "by default", "on", "off"],
    schema: z.boolean(),
    defaultValue: false,
    scope: "app",
    sensitivity: "plain",
    applyMode: "next-turn",
    importExport: "include",
  } satisfies SettingDefinition<"advisorEnabled">,
  {
    key: "advisorTargetByProvider",
    sectionId: "providers",
    fieldId: ADVISOR_SETTING_FIELD_ID,
    title: "Advisor defaults per provider",
    description:
      "Default Advisor model and effort remembered separately for each provider, so both can be configured before either is armed.",
    keywords: [
      "advisor",
      "per provider",
      "advisor default",
      "advisor effort",
      "remembered",
    ],
    schema: AdvisorTargetByProviderSchema,
    defaultValue: {},
    scope: "app",
    sensitivity: "plain",
    applyMode: "next-turn",
    importExport: "include",
  } satisfies SettingDefinition<"advisorTargetByProvider">,
  {
    key: "advisorConsultLimit",
    sectionId: "providers",
    fieldId: ADVISOR_SETTING_FIELD_ID,
    title: "Advisor consults per turn",
    description:
      "How many times the primary may consult the armed Advisor in a single turn.",
    keywords: ["advisor", "consult", "limit", "budget", "per turn"],
    schema: z.number().int().min(1).max(20),
    defaultValue: DEFAULT_ADVISOR_CONSULT_LIMIT,
    scope: "app",
    sensitivity: "plain",
    applyMode: "next-turn",
    importExport: "include",
  } satisfies SettingDefinition<"advisorConsultLimit">,
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
    key: "workerEnabled",
    sectionId: "providers",
    fieldId: "settings-field-worker",
    title: "Worker mode",
    description:
      "Let a high-tier primary delegate bounded implementation work to a cheaper same-provider worker.",
    keywords: [
      "worker",
      "worker mode",
      "subagent",
      "sub agent",
      "delegate",
      "delegation",
      "task executor",
      "orchestrate",
      "preset",
      "luna",
      "haiku",
      "sonnet",
      "effort",
      "cost",
    ],
    schema: z.boolean(),
    defaultValue: false,
    scope: "app",
    sensitivity: "plain",
    applyMode: "next-turn",
    importExport: "include",
  } satisfies SettingDefinition<"workerEnabled">,
  {
    key: "workerConfigByProvider",
    sectionId: "providers",
    fieldId: "settings-field-worker",
    title: "Worker configuration",
    description:
      "Per-provider worker preset, model, reasoning effort, description, and instructions.",
    keywords: [
      "worker model",
      "worker effort",
      "worker instructions",
      "worker description",
      "worker preset",
      "subagent model",
      "delegation",
    ],
    // Loose on purpose: the authoritative shape lives in `worker-mode.ts` and is
    // re-normalized on load, so a stricter mirror here would only add a second
    // place to forget when a preset field is added.
    schema: z.record(z.string(), z.unknown()),
    defaultValue: {},
    scope: "app",
    sensitivity: "plain",
    applyMode: "next-turn",
    importExport: "include",
  } satisfies SettingDefinition<"workerConfigByProvider">,
  {
    key: "auxiliaryInferencePolicy",
    sectionId: "auxiliaryInference",
    fieldId: "settings-field-auxiliary-inference",
    title: "Background AI",
    description:
      "Per-lane switch, provider, and model for the background calls Stave makes on your behalf: intent guard, turn summary, task naming, utility inference, PR description, pre-PR review, inline completion, and delegated child tasks.",
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
      "child task",
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
      "project mapping",
    ],
    schema: CraneConnectorSettingsSchema,
    defaultValue: {
      enabled: false,
      baseUrl: "https://atelier.delight-tools.ai",
      pollIntervalSeconds: 15,
      projectMappings: [],
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
      "Read your assigned Jira Cloud issues over outbound HTTPS and map Jira projects to local Stave projects.",
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
      "project mapping",
    ],
    schema: JiraConnectorSettingsSchema,
    // Spread rather than shared: the frozen default carries a frozen mappings
    // array, and a definition default must stay writable for consumers that
    // reset a row by assigning it.
    defaultValue: {
      ...DEFAULT_JIRA_CONNECTOR_SETTINGS,
      projectMappings: [],
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
    key: "trackerTasks",
    sectionId: "tasks",
    fieldId: "settings-field-tracker-tasks",
    title: "Tasks",
    description:
      "Opens on tickets assigned to you. Choose which trackers Tasks reads, the first tab, the refresh interval, and whether a kickoff starts immediately.",
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
    schema: TrackerTasksSettingsSchema,
    defaultValue: { ...DEFAULT_TRACKER_TASKS_SETTINGS },
    scope: "app",
    sensitivity: "plain",
    applyMode: "immediate",
    importExport: "include",
  } satisfies SettingDefinition<"trackerTasks">,
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
  {
    key: "standaloneCliFolderPath",
    sectionId: "general",
    fieldId: STANDALONE_CLI_SETTING_FIELD_ID,
    title: "Standalone CLI folder",
    description:
      "Absolute folder the Standalone CLI overlay runs Claude Code and Codex in, without registering it as a project.",
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
