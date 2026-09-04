import {
  getDefaultModelForProvider,
  isManagedExecutionProviderId,
} from "@/lib/providers/model-catalog";
import {
  clampModelEffort,
  isModelEffort,
  listModelEffortOptions,
  resolveDefaultModelEffort,
} from "@/lib/providers/model-effort";
import { listModelsForPresetProvider } from "@/lib/task-presets";
import {
  MAX_MACROS,
  MAX_MACRO_BODY_LENGTH,
  MAX_MACRO_DESCRIPTION_LENGTH,
  MAX_MACRO_LABEL_LENGTH,
  MAX_MACRO_SLUG_LENGTH,
  MACRO_INSERT_MODES,
  type Macro,
  type MacroInsertMode,
  type MacroRuntime,
} from "./types";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function generateMacroId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `macro_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  }
  return `macro_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function slugifyMacroLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_MACRO_SLUG_LENGTH);
}

export function isMacroInsertMode(value: unknown): value is MacroInsertMode {
  return (
    typeof value === "string" &&
    (MACRO_INSERT_MODES as readonly string[]).includes(value)
  );
}

function readTrimmedString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, maxLength);
}

function normalizeMacroRuntime(input: unknown): MacroRuntime | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const candidate = input as Partial<MacroRuntime>;
  const providerId = candidate.providerId;
  if (!providerId || !isManagedExecutionProviderId(providerId)) {
    return undefined;
  }
  const allowedModels = listModelsForPresetProvider(providerId);
  const rawModel =
    typeof candidate.model === "string" ? candidate.model.trim() : "";
  const model = allowedModels.includes(rawModel)
    ? rawModel
    : getDefaultModelForProvider({ providerId });
  const requestedEffort = isModelEffort(candidate.effort)
    ? candidate.effort
    : undefined;
  const effort = requestedEffort
    ? clampModelEffort({
        providerId,
        model,
        effort: requestedEffort,
        fallback: resolveDefaultModelEffort({
          providerId,
          model,
        }),
      })
    : undefined;
  const supported = listModelEffortOptions({
    providerId,
    model,
  }).some((option) => option.value === effort);

  return {
    providerId,
    model,
    ...(effort && supported ? { effort } : {}),
  };
}

export function normalizeMacro(input: unknown): Macro | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const candidate = input as Partial<Macro>;
  const label = readTrimmedString(candidate.label, MAX_MACRO_LABEL_LENGTH);
  const slugSource =
    typeof candidate.slug === "string" && candidate.slug.trim().length > 0
      ? candidate.slug
      : label;
  const slug = slugifyMacroLabel(slugSource);
  const body =
    typeof candidate.body === "string"
      ? candidate.body.slice(0, MAX_MACRO_BODY_LENGTH)
      : "";
  if (!label || !slug || !SLUG_PATTERN.test(slug)) {
    return null;
  }

  const createdAt =
    typeof candidate.createdAt === "string" && candidate.createdAt.trim()
      ? candidate.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof candidate.updatedAt === "string" && candidate.updatedAt.trim()
      ? candidate.updatedAt
      : createdAt;
  const description = readTrimmedString(
    candidate.description,
    MAX_MACRO_DESCRIPTION_LENGTH,
  );
  const id =
    typeof candidate.id === "string" && candidate.id.trim().length > 0
      ? candidate.id.trim()
      : generateMacroId();

  return {
    id,
    label,
    slug,
    ...(description ? { description } : {}),
    body,
    insertMode: isMacroInsertMode(candidate.insertMode)
      ? candidate.insertMode
      : "replace",
    runtime: normalizeMacroRuntime(candidate.runtime),
    ...(candidate.instantRun === true ? { instantRun: true } : {}),
    createdAt,
    updatedAt,
  };
}

export function normalizePersistedMacros(input: unknown): Macro[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const normalised: Macro[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  for (const candidate of input) {
    const macro = normalizeMacro(candidate);
    if (!macro) {
      continue;
    }
    if (seenIds.has(macro.id)) {
      macro.id = generateMacroId();
    }
    if (seenSlugs.has(macro.slug)) {
      continue;
    }
    seenIds.add(macro.id);
    seenSlugs.add(macro.slug);
    normalised.push(macro);
    if (normalised.length >= MAX_MACROS) {
      break;
    }
  }
  return normalised;
}
