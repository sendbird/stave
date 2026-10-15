import path from "node:path";
import type {
  ProviderModelCatalogEntry,
  ProviderModelCatalogResponse,
  ProviderRuntimeOptions,
} from "../../../src/lib/providers/provider.types";
import {
  buildOpenCodeCliEnv,
  resolveOpenCodeExecutablePath,
} from "../opencode-cli-env";
import { runExecutableProbe } from "../runtime-shared";
import { OPENCODE_AUTHENTICATION_HELP } from "./opencode-auth";
import { resolveOpenCodeVersionSupport } from "./opencode-version";

const OPENCODE_MODEL_CATALOG_TIMEOUT_MS = 30_000;
const OPENCODE_MODEL_CATALOG_MAX_BYTES = 8 * 1024 * 1024;
/** Bounds the picker even when a misconfigured provider lists thousands of ids. */
export const OPENCODE_MODEL_CATALOG_MAX_ENTRIES = 2_000;
const MODEL_ID_LINE = /^[A-Za-z0-9][\w.@:-]*\/\S+$/;
/**
 * Variant names Stave can pass as an `effort` value. A model variant with
 * another name stays usable from OpenCode itself but is not offered here.
 */
const OPENCODE_EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh", "max"]);

/**
 * `opencode models` is read instead of an ACP session: an ACP `session/new`
 * stores an empty session in the user's OpenCode history on every read.
 *
 * 1.x prints one `provider/model` per line, and with `--verbose` a JSON
 * object after each id whose `variants` keys are the model's effort levels.
 * 2.x has no `--verbose` and needs `--standalone`, or it leaves OpenCode's
 * background service running after the read.
 */
export function buildOpenCodeModelCatalogArgs(major: number) {
  return major >= 2 ? ["models", "--standalone"] : ["models", "--verbose"];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** `vercel/zai/glm-5.3` → provider `vercel`, model `zai/glm-5.3`. */
export function splitOpenCodeModelId(model: string) {
  const slash = model.indexOf("/");
  return slash > 0
    ? { provider: model.slice(0, slash), name: model.slice(slash + 1) }
    : { provider: "", name: model };
}

type ParsedModel = {
  model: string;
  name?: string;
  efforts: string[];
  contextTokens?: number;
};

/** Reads the JSON object that starts at `start`, or null when it is not balanced JSON. */
function readJsonObject(lines: string[], start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < lines.length; index += 1) {
    for (const char of lines[index] ?? "") {
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
    }
    if (depth === 0) {
      try {
        return {
          value: JSON.parse(lines.slice(start, index + 1).join("\n")) as unknown,
          end: index,
        };
      } catch {
        return null;
      }
    }
  }
  return null;
}

function parseModels(output: string): ParsedModel[] {
  const lines = output.split(/\r?\n/);
  const models: ParsedModel[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (!MODEL_ID_LINE.test(line)) {
      continue;
    }
    const parsed: ParsedModel = { model: line, efforts: [] };
    const next = lines[index + 1]?.trim() ?? "";
    if (next.startsWith("{")) {
      const json = readJsonObject(lines, index + 1);
      const record = asRecord(json?.value);
      if (json && record) {
        index = json.end;
        if (typeof record.name === "string" && record.name.trim()) {
          parsed.name = record.name.trim();
        }
        parsed.efforts = Object.keys(asRecord(record.variants) ?? {}).filter(
          (effort) => OPENCODE_EFFORTS.has(effort),
        );
        const context = asRecord(record.limit)?.context;
        if (typeof context === "number" && Number.isFinite(context) && context > 0) {
          parsed.contextTokens = context;
        }
      }
    }
    models.push(parsed);
  }
  return models;
}

function formatContext(tokens: number) {
  return tokens >= 1_000_000
    ? `${Number((tokens / 1_000_000).toFixed(1))}M context`
    : `${Math.round(tokens / 1_000)}K context`;
}

/**
 * Parses `opencode models` output. Entries are grouped by the provider prefix
 * of the `provider/model` id; none is marked default because the CLI does not
 * report one. Stave's `auto` row stands for the model OpenCode would pick.
 */
export function parseOpenCodeModelCatalog(
  output: string,
): ProviderModelCatalogEntry[] {
  const seen = new Set<string>();
  const entries: ProviderModelCatalogEntry[] = [];
  for (const parsed of parseModels(output)) {
    if (seen.has(parsed.model)) {
      continue;
    }
    seen.add(parsed.model);
    const { provider, name } = splitOpenCodeModelId(parsed.model);
    entries.push({
      model: parsed.model,
      displayName: parsed.name ?? name,
      description: [
        parsed.model,
        parsed.contextTokens ? formatContext(parsed.contextTokens) : "",
      ]
        .filter(Boolean)
        .join(" · "),
      hidden: false,
      isDefault: false,
      defaultEffort: null,
      supportedEfforts: parsed.efforts,
      ...(provider ? { group: provider } : {}),
    });
    if (entries.length >= OPENCODE_MODEL_CATALOG_MAX_ENTRIES) {
      break;
    }
  }
  return entries.sort(
    (left, right) =>
      (left.group ?? "").localeCompare(right.group ?? "") ||
      left.model.localeCompare(right.model),
  );
}

export async function getOpenCodeModelCatalog(args: {
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
  /** Test seam; production spawns the resolved `opencode` binary. */
  runProbe?: typeof runExecutableProbe;
}): Promise<ProviderModelCatalogResponse> {
  const unavailable = (detail: string): ProviderModelCatalogResponse => ({
    providerId: "opencode",
    ok: false,
    detail,
    models: [],
  });
  const executablePath = resolveOpenCodeExecutablePath({
    explicitPath: args.runtimeOptions?.opencodeBinaryPath,
  });
  if (!executablePath) {
    return unavailable("OpenCode CLI was not found.");
  }
  const run = args.runProbe ?? runExecutableProbe;
  const cwd = args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
  const env = buildOpenCodeCliEnv({ executablePath });
  const versionProbe = await run({
    executablePath,
    commandArgs: ["--version"],
    cwd,
    env,
  });
  const support = resolveOpenCodeVersionSupport(versionProbe.text);
  if (!support.supported) {
    return unavailable(support.reason);
  }
  const result = await run({
    executablePath,
    commandArgs: buildOpenCodeModelCatalogArgs(support.version.major),
    cwd,
    env,
    timeoutMs: OPENCODE_MODEL_CATALOG_TIMEOUT_MS,
    maxBytes: OPENCODE_MODEL_CATALOG_MAX_BYTES,
  });
  if (result.status !== 0 || result.timedOut) {
    return unavailable(
      result.timedOut
        ? "OpenCode did not list its models in time."
        : "OpenCode could not list its models.",
    );
  }
  const models = parseOpenCodeModelCatalog(result.stdout);
  if (models.length === 0) {
    return unavailable(
      `OpenCode reported no models. ${OPENCODE_AUTHENTICATION_HELP}`,
    );
  }
  return {
    providerId: "opencode",
    ok: true,
    detail:
      models.length >= OPENCODE_MODEL_CATALOG_MAX_ENTRIES
        ? `Loaded the first ${OPENCODE_MODEL_CATALOG_MAX_ENTRIES} models reported by OpenCode.`
        : "Loaded the model catalog reported by OpenCode.",
    models,
  };
}
