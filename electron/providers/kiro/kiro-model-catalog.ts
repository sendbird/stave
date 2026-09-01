import path from "node:path";
import { z } from "zod";
import type {
  ProviderModelCatalogEntry,
  ProviderModelCatalogResponse,
  ProviderRuntimeOptions,
} from "../../../src/lib/providers/provider.types";
import { buildKiroCliEnv, resolveKiroExecutablePath } from "../kiro-cli-env";
import { runExecutableProbe } from "../runtime-shared";

const KIRO_MODEL_CATALOG_TIMEOUT_MS = 15_000;
const KIRO_MODEL_CATALOG_MAX_BYTES = 512 * 1024;
const KIRO_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

const KiroModelEntrySchema = z.union([
  z.string(),
  z
    .object({
      id: z.string().optional(),
      modelId: z.string().optional(),
      model_id: z.string().optional(),
      name: z.string().optional(),
      model_name: z.string().optional(),
      displayName: z.string().optional(),
      description: z.string().optional(),
      isDefault: z.boolean().optional(),
      default: z.boolean().optional(),
      defaultEffort: z.string().optional(),
      default_effort: z.string().optional(),
      supportedEfforts: z.array(z.string()).optional(),
      supported_efforts: z.array(z.string()).optional(),
      reasoningEfforts: z.array(z.string()).optional(),
      reasoning_efforts: z.array(z.string()).optional(),
    })
    .passthrough(),
]);

const KiroModelCatalogSchema = z.union([
  z.array(KiroModelEntrySchema),
  z
    .object({
      models: z.array(KiroModelEntrySchema),
      defaultModel: z.string().optional(),
      default_model: z.string().optional(),
    })
    .passthrough(),
]);

function parseJsonOutput(value: string): unknown {
  const objectStart = value.indexOf("{");
  const arrayStart = value.indexOf("[");
  const start =
    objectStart === -1
      ? arrayStart
      : arrayStart === -1
        ? objectStart
        : Math.min(objectStart, arrayStart);
  if (start < 0) {
    throw new Error("Kiro CLI model output did not contain JSON.");
  }
  return JSON.parse(value.slice(start));
}

function humanizeModelId(model: string) {
  return model
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "gpt" || lower === "glm") {
        return lower.toUpperCase();
      }
      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");
}

export function parseKiroModelCatalog(
  value: string,
): ProviderModelCatalogEntry[] {
  const parsed = KiroModelCatalogSchema.parse(parseJsonOutput(value));
  const entries = Array.isArray(parsed) ? parsed : parsed.models;
  const defaultModel = Array.isArray(parsed)
    ? undefined
    : parsed.defaultModel?.trim() || parsed.default_model?.trim();
  return entries.flatMap((entry) => {
    if (typeof entry === "string") {
      return [
        {
          model: entry,
          displayName: humanizeModelId(entry),
          description: "",
          hidden: false,
          isDefault: entry === (defaultModel || "auto"),
          defaultEffort: null,
          supportedEfforts: [],
        },
      ];
    }
    const model =
      entry.id?.trim() || entry.modelId?.trim() || entry.model_id?.trim() || "";
    if (!model) {
      return [];
    }
    const supportedEfforts = (
      entry.supportedEfforts ??
      entry.supported_efforts ??
      entry.reasoningEfforts ??
      entry.reasoning_efforts ??
      []
    ).filter((effort) => KIRO_EFFORTS.has(effort));
    const explicitLabel = entry.displayName?.trim() || entry.name?.trim();
    const snakeLabel = entry.model_name?.trim();
    const defaultEffort = entry.defaultEffort ?? entry.default_effort;
    return [
      {
        model,
        displayName:
          explicitLabel ||
          (snakeLabel && snakeLabel !== model
            ? snakeLabel
            : humanizeModelId(model)),
        description: entry.description?.trim() || "",
        hidden: false,
        isDefault:
          entry.isDefault ??
          entry.default ??
          model === (defaultModel || "auto"),
        defaultEffort:
          defaultEffort && KIRO_EFFORTS.has(defaultEffort)
            ? defaultEffort
            : null,
        supportedEfforts,
      },
    ];
  });
}

export async function getKiroModelCatalog(args: {
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}): Promise<ProviderModelCatalogResponse> {
  const executablePath = resolveKiroExecutablePath({
    explicitPath: args.runtimeOptions?.kiroBinaryPath,
  });
  if (!executablePath) {
    return {
      providerId: "kiro",
      ok: false,
      detail: "Kiro CLI was not found.",
      models: [],
    };
  }

  const cwd = args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
  const env = buildKiroCliEnv({ executablePath });
  const authProbe = await runExecutableProbe({
    executablePath,
    commandArgs: ["whoami"],
    cwd,
    env,
    timeoutMs: 5_000,
  });
  if (authProbe.status !== 0) {
    return {
      providerId: "kiro",
      ok: false,
      detail:
        "Kiro CLI is installed but not authenticated. Run `kiro-cli login`, then retry the model catalog.",
      models: [],
    };
  }
  const result = await runExecutableProbe({
    executablePath,
    commandArgs: ["chat", "--list-models", "--format", "json"],
    cwd,
    env,
    timeoutMs: KIRO_MODEL_CATALOG_TIMEOUT_MS,
    maxBytes: KIRO_MODEL_CATALOG_MAX_BYTES,
  });
  if (result.status !== 0) {
    return {
      providerId: "kiro",
      ok: false,
      detail: "Kiro CLI could not load its model catalog.",
      models: [],
    };
  }
  try {
    const models = parseKiroModelCatalog(result.stdout);
    return {
      providerId: "kiro",
      ok: models.length > 0,
      detail:
        models.length > 0
          ? "Loaded the model catalog reported by Kiro CLI."
          : "Kiro CLI returned an empty model catalog.",
      models,
    };
  } catch (error) {
    return {
      providerId: "kiro",
      ok: false,
      detail:
        error instanceof Error
          ? error.message
          : "Failed to parse the Kiro model catalog.",
      models: [],
    };
  }
}
