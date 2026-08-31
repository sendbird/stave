import {
  listCodexReasoningEffortsForModel,
  resolveDefaultClaudeEffortForModel,
  resolveDefaultCodexEffortForModel,
} from "@/lib/providers/model-catalog";
import type { ModelShortcutEffort } from "@/lib/providers/model-shortcuts";
import {
  formatCursorEffortLabel,
  getCursorModelBaseId,
  parseCursorModelParameters,
} from "@/lib/providers/cursor-model-id";
import {
  type ModelVisibility,
  readModelVisibilityOverride,
} from "@/lib/providers/model-visibility";
import {
  CLAUDE_EFFORT_OPTIONS,
  CODEX_EFFORT_OPTIONS,
  KIRO_EFFORT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ModelSelectorOption } from "./model-selector.utils";

export type ModelEffortValue = Exclude<ModelShortcutEffort, "">;

export interface ModelEffortOption {
  value: ModelEffortValue;
  label: string;
}

export interface CursorModelPresentation {
  label: string;
  capabilities: readonly string[];
}

export type CursorModelEffort = "none" | ModelEffortValue;

export interface CursorModelVariant {
  option: ModelSelectorOption;
  baseModel: string;
  label: string;
  context?: string;
  thinking?: boolean;
  fast?: boolean;
  effort?: CursorModelEffort;
}

export interface CursorModelGroup {
  key: string;
  baseModel: string;
  label: string;
  variants: readonly CursorModelVariant[];
}

export const CURSOR_MODEL_EFFORT_OPTIONS = [
  { value: "none", label: "None" },
  ...KIRO_EFFORT_OPTIONS,
] as const satisfies readonly {
  value: CursorModelEffort;
  label: string;
}[];

const parseModelParameters = parseCursorModelParameters;

export { getCursorModelBaseId };

function normalizeCursorEffort(
  value: string | undefined,
): CursorModelEffort | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "none") {
    return "none";
  }
  return normalizeCatalogEffort(normalized);
}

export function getCursorModelVariant(
  option: ModelSelectorOption,
): CursorModelVariant {
  const parameters = parseModelParameters(option.model);
  const presentation = getCursorModelPresentation(option);
  const effort = normalizeCursorEffort(
    parameters.get("effort") ??
      parameters.get("reasoning") ??
      option.defaultEffort,
  );
  return {
    option,
    baseModel: getCursorModelBaseId(option.model),
    label: presentation.label,
    ...(parameters.has("context")
      ? { context: parameters.get("context") }
      : {}),
    ...(parameters.has("thinking")
      ? { thinking: parameters.get("thinking") === "true" }
      : {}),
    ...(parameters.has("fast")
      ? { fast: parameters.get("fast") === "true" }
      : {}),
    ...(effort ? { effort } : {}),
  };
}

export function groupCursorModelOptions(
  options: readonly ModelSelectorOption[],
): CursorModelGroup[] {
  const groups = new Map<
    string,
    { label: string; variants: CursorModelVariant[] }
  >();
  for (const option of options) {
    const variant = getCursorModelVariant(option);
    const group = groups.get(variant.baseModel);
    if (group) {
      group.variants.push(variant);
    } else {
      groups.set(variant.baseModel, {
        label: variant.label,
        variants: [variant],
      });
    }
  }
  return [...groups.entries()].map(([baseModel, group]) => ({
    key: baseModel,
    baseModel,
    label: group.label,
    variants: group.variants,
  }));
}

type CursorVariantPatch = Partial<
  Pick<CursorModelVariant, "context" | "thinking" | "fast" | "effort">
>;

const CURSOR_VARIANT_KEYS = ["context", "thinking", "fast", "effort"] as const;

export function resolveCursorModelVariant(args: {
  group: CursorModelGroup;
  anchor?: CursorModelVariant;
  patch: CursorVariantPatch;
}) {
  const patchEntries = Object.entries(args.patch) as [
    keyof CursorVariantPatch,
    CursorVariantPatch[keyof CursorVariantPatch],
  ][];
  const candidates = args.group.variants.filter((variant) =>
    patchEntries.every(([key, value]) => variant[key] === value),
  );
  if (candidates.length === 0 || !args.anchor) {
    return candidates[0];
  }
  return candidates.reduce((best, candidate) => {
    const score = CURSOR_VARIANT_KEYS.reduce(
      (total, key) => total + Number(candidate[key] === args.anchor?.[key]),
      0,
    );
    const bestScore = CURSOR_VARIANT_KEYS.reduce(
      (total, key) => total + Number(best[key] === args.anchor?.[key]),
      0,
    );
    return score > bestScore ? candidate : best;
  });
}

export function expandCursorModelFamilies(args: {
  options: readonly ModelSelectorOption[];
  featured: readonly ModelSelectorOption[];
}) {
  const featuredBaseModels = new Set(
    args.featured.map((option) => getCursorModelBaseId(option.model)),
  );
  return args.options.filter((option) =>
    featuredBaseModels.has(getCursorModelBaseId(option.model)),
  );
}

export function getCursorModelPresentation(
  option: ModelSelectorOption,
): CursorModelPresentation {
  if (option.providerId !== "cursor") {
    return { label: option.label, capabilities: [] };
  }
  const [label, ...labelDetails] = option.label.split(" · ");
  const parameters = parseModelParameters(option.model);
  const capabilities: string[] = [];
  const addCapability = (value: string | undefined) => {
    const normalized = value?.trim();
    if (normalized && !capabilities.includes(normalized)) {
      capabilities.push(normalized);
    }
  };
  const context = parameters.get("context");
  addCapability(context?.toUpperCase());
  if (parameters.get("thinking") === "true") {
    addCapability("Thinking");
  }
  if (parameters.get("fast") === "true") {
    addCapability("Fast");
  }
  const effort =
    parameters.get("effort") ??
    parameters.get("reasoning") ??
    option.defaultEffort;
  addCapability(effort ? formatCursorEffortLabel(effort) : undefined);
  for (const detail of labelDetails) {
    addCapability(detail);
  }
  return { label: label || option.label, capabilities };
}

function getModelLineage(model: string) {
  const bareModel = model.split("[")[0]?.trim().toLowerCase() ?? "";
  if (/^claude-(opus|sonnet|fable|haiku)-/.test(bareModel)) {
    return (
      bareModel.match(/^claude-(opus|sonnet|fable|haiku)/)?.[0] ?? bareModel
    );
  }
  if (bareModel.startsWith("gpt-")) {
    const variant = ["sol", "terra", "luna", "codex", "mini", "nano"].find(
      (candidate) => bareModel.split("-").includes(candidate),
    );
    return variant ? `gpt-${variant}` : "gpt";
  }
  if (bareModel.startsWith("gemini-")) {
    const variant = ["flash", "pro"].find((candidate) =>
      bareModel.split("-").includes(candidate),
    );
    return variant ? `gemini-${variant}` : "gemini";
  }
  return bareModel.split("-")[0] || bareModel;
}

export function listFeaturedModelOptions(args: {
  options: readonly ModelSelectorOption[];
  selectedModelKey?: string;
  limit?: number;
}) {
  const limit = Math.max(1, args.limit ?? 12);
  const lineages = new Set<string>();
  const featuredKeys = new Set<string>();
  for (const option of args.options) {
    const lineage = getModelLineage(option.model);
    if (lineages.has(lineage) && !option.isDefault) {
      continue;
    }
    lineages.add(lineage);
    featuredKeys.add(option.key);
    if (featuredKeys.size >= limit) {
      break;
    }
  }
  if (args.selectedModelKey) {
    featuredKeys.add(args.selectedModelKey);
  }
  return args.options.filter((option) => featuredKeys.has(option.key));
}

/**
 * The model rows the selector offers before the user expands the list.
 *
 * Baseline is the current model per lineage, so a runtime catalog that
 * advertises its whole history does not bury the models people actually pick.
 * Settings overrides win over the baseline in both directions, and the selected
 * model is always kept so switching providers can never blank the trigger.
 */
export function listDefaultModelOptions(args: {
  providerId: ProviderId;
  options: readonly ModelSelectorOption[];
  visibility?: ModelVisibility;
  selectedModelKey?: string;
}): ModelSelectorOption[] {
  const featured = listFeaturedModelOptions({
    options: args.options,
    ...(args.selectedModelKey
      ? { selectedModelKey: args.selectedModelKey }
      : {}),
  });
  const baselineKeys = new Set(
    (args.providerId === "cursor"
      ? expandCursorModelFamilies({ options: args.options, featured })
      : featured
    ).map((option) => option.key),
  );
  return args.options.filter((option) => {
    if (option.key === args.selectedModelKey) {
      return true;
    }
    const override = readModelVisibilityOverride({
      ...(args.visibility ? { visibility: args.visibility } : {}),
      providerId: option.providerId,
      model: option.model,
    });
    return override ?? baselineKeys.has(option.key);
  });
}

export function listProviderEffortScale(
  providerId: ProviderId,
): readonly ModelEffortOption[] {
  if (providerId === "claude-code") {
    return CLAUDE_EFFORT_OPTIONS as readonly ModelEffortOption[];
  }
  if (providerId === "codex") {
    return CODEX_EFFORT_OPTIONS as readonly ModelEffortOption[];
  }
  if (providerId === "cursor" || providerId === "kiro") {
    return KIRO_EFFORT_OPTIONS as readonly ModelEffortOption[];
  }
  return [];
}

function normalizeCatalogEffort(
  value: string | undefined,
): ModelEffortValue | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (
    normalized === "x-high" ||
    normalized === "extra-high" ||
    normalized === "extra_high"
  ) {
    return "xhigh";
  }
  return KIRO_EFFORT_OPTIONS.some((effort) => effort.value === normalized)
    ? (normalized as ModelEffortValue)
    : undefined;
}

export function listModelEfforts(
  option: ModelSelectorOption,
): readonly ModelEffortOption[] {
  const scale = listProviderEffortScale(option.providerId);
  if (option.providerId === "codex") {
    const supported = new Set(
      listCodexReasoningEffortsForModel({ model: option.model }),
    );
    return scale.filter((effort) => supported.has(effort.value as never));
  }
  if (option.providerId === "cursor") {
    const embeddedEffort = normalizeCatalogEffort(option.defaultEffort);
    return embeddedEffort
      ? scale.filter((effort) => effort.value === embeddedEffort)
      : [];
  }
  if (
    option.providerId === "kiro" &&
    (option.supportedEfforts?.length ?? 0) > 0
  ) {
    const supported = new Set(
      option.supportedEfforts?.map(normalizeCatalogEffort).filter(Boolean),
    );
    return scale.filter((effort) => supported.has(effort.value));
  }
  return scale;
}

export function resolveDefaultModelEffort(
  option: ModelSelectorOption,
): ModelEffortValue | undefined {
  if (option.providerId === "claude-code") {
    return resolveDefaultClaudeEffortForModel({
      model: option.model,
    }) as ModelEffortValue;
  }
  if (option.providerId === "codex") {
    return resolveDefaultCodexEffortForModel({
      model: option.model,
    }) as ModelEffortValue;
  }
  if (option.providerId === "cursor") {
    return listModelEfforts(option)[0]?.value;
  }
  if (option.providerId === "kiro") {
    const efforts = listModelEfforts(option);
    return (
      efforts.find((effort) => effort.value === option.defaultEffort)?.value ??
      efforts.find((effort) => effort.value === "medium")?.value ??
      efforts[0]?.value
    );
  }
  return undefined;
}

export function isClaudeContext1MModel(model: string) {
  return model.trim().toLowerCase().endsWith("[1m]");
}

function getClaudeContextBaseModel(model: string) {
  return model.trim().replace(/\[1m\]$/i, "");
}

export function getClaudeContextBaseLabel(label: string) {
  return label.replace(/\s*\(1m\)\s*$/i, "").trim();
}

export function resolveClaudeContextOption(args: {
  options: readonly ModelSelectorOption[];
  option: ModelSelectorOption;
  context1M: boolean;
}) {
  if (args.option.providerId !== "claude-code") {
    return args.option;
  }
  const baseModel = getClaudeContextBaseModel(args.option.model);
  const targetModel = args.context1M ? `${baseModel}[1m]` : baseModel;
  return (
    args.options.find(
      (option) =>
        !option.isAuto &&
        option.providerId === "claude-code" &&
        option.model.toLowerCase() === targetModel.toLowerCase(),
    ) ?? args.option
  );
}

export function supportsClaudeContextToggle(args: {
  options: readonly ModelSelectorOption[];
  option: ModelSelectorOption;
}) {
  if (args.option.providerId !== "claude-code" || args.option.isAuto) {
    return false;
  }
  const baseModel = getClaudeContextBaseModel(args.option.model).toLowerCase();
  const variants = new Set(
    args.options
      .filter((option) => !option.isAuto && option.providerId === "claude-code")
      .map((option) => option.model.toLowerCase()),
  );
  return variants.has(baseModel) && variants.has(`${baseModel}[1m]`);
}

export function collapseClaudeContextOptions(args: {
  options: readonly ModelSelectorOption[];
  context1M: boolean;
}) {
  const optionByModel = new Map(
    args.options.map((option) => [option.model.toLowerCase(), option] as const),
  );
  const seen = new Set<string>();
  const collapsed: ModelSelectorOption[] = [];

  for (const option of args.options) {
    const baseModel = getClaudeContextBaseModel(option.model).toLowerCase();
    if (seen.has(baseModel)) {
      continue;
    }
    seen.add(baseModel);
    const base = optionByModel.get(baseModel);
    const context = optionByModel.get(`${baseModel}[1m]`);
    collapsed.push(
      args.context1M && context ? context : (base ?? context ?? option),
    );
  }
  return collapsed;
}
