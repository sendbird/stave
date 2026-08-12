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
  DEFAULT_MARTIN_SYNC_SETTINGS,
  MartinSyncSettingsSchema,
} from "@/lib/martin-sync/types";
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

const AdvisorTargetSchema = z
  .object({
    providerId: z.enum(["claude-code", "codex"]),
    model: z.string().trim().min(1).max(200),
  })
  .strict()
  .nullable();

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
