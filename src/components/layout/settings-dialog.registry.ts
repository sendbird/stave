import { z } from "zod";
import { ADVISOR_SETTING_FIELD_ID } from "@/lib/providers/advisor";
import {
  getSdkModelOptions,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { AppSettings } from "@/store/app-settings";
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
  sensitivity: "plain";
  applyMode: "next-turn";
  importExport: "include";
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
      "Run one isolated read-only Claude or Codex preflight before a normal chat turn.",
    keywords: [
      "advisor",
      "preflight",
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
