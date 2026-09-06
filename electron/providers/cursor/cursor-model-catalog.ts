import path from "node:path";
import type {
  ProviderModelCatalogEntry,
  ProviderModelCatalogResponse,
  ProviderRuntimeOptions,
} from "../../../src/lib/providers/provider.types";
import { AcpProtocolClient } from "../acp/acp-protocol";
import { AcpConfigSelectGroupSchema, type AcpSessionConfigOption } from "../acp/acp-schemas";
import {
  buildCursorAgentEnv,
  resolveCursorAgentExecutablePath,
} from "../cursor-cli-env";

const CURSOR_AUTH_METHOD_ID = "cursor_login";
const CURSOR_MODEL_CONFIG_ID = "model";
const CURSOR_MODEL_CATALOG_TIMEOUT_MS = 15_000;

function humanizeModelFamily(value: string) {
  const acronyms = new Map([
    ["gpt", "GPT"],
    ["glm", "GLM"],
    ["kimi", "Kimi"],
  ]);
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => {
      const normalized = part.toLowerCase();
      return (
        acronyms.get(normalized) ??
        `${part.charAt(0).toUpperCase()}${part.slice(1)}`
      );
    })
    .join(" ");
}

function formatEffort(value: string) {
  if (value === "xhigh" || value === "extra-high") {
    return "Extra High";
  }
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function parseModelParameters(value: string) {
  const match = value.match(/\[([^\]]*)\]$/);
  const parameters = new Map<string, string>();
  for (const pair of match?.[1]?.split(",") ?? []) {
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    parameters.set(
      pair.slice(0, separator).trim(),
      pair.slice(separator + 1).trim(),
    );
  }
  return parameters;
}

function formatModelDisplayName(args: { name: string; value: string }) {
  if (args.value.startsWith("auto-")) {
    return humanizeModelFamily(args.name);
  }
  const parameters = parseModelParameters(args.value);
  const details: string[] = [];
  const context = parameters.get("context");
  if (context) {
    details.push(context.toUpperCase());
  }
  if (parameters.get("thinking") === "true") {
    details.push("Thinking");
  }
  const effort = parameters.get("effort") ?? parameters.get("reasoning");
  if (effort) {
    details.push(formatEffort(effort));
  }
  if (parameters.get("fast") === "true") {
    details.push("Fast");
  }
  const family = humanizeModelFamily(args.name);
  return details.length > 0 ? `${family} · ${details.join(" · ")}` : family;
}

function flattenConfigOptions(option: AcpSessionConfigOption) {
  return (option.options ?? []).flatMap((item) => {
    if (typeof item.value === "string") {
      return [{ value: item.value, name: item.name, description: typeof item.description === "string" ? item.description : "" }];
    }
    const group = AcpConfigSelectGroupSchema.safeParse(item);
    return group.success ? group.data.options : [];
  });
}

export function mapCursorAcpModelCatalog(args: {
  configOptions?: AcpSessionConfigOption[] | null;
}): ProviderModelCatalogEntry[] {
  const modelConfig = args.configOptions?.find(
    (option) => option.id === CURSOR_MODEL_CONFIG_ID,
  );
  if (!modelConfig || typeof modelConfig.currentValue !== "string") {
    return [];
  }
  return flattenConfigOptions(modelConfig).map((option) => {
    const parameters = parseModelParameters(option.value);
    return {
      model: option.value,
      displayName: formatModelDisplayName({
        name: option.name,
        value: option.value,
      }),
      description: option.description ?? "",
      hidden: false,
      isDefault: option.value === modelConfig.currentValue,
      defaultEffort:
        parameters.get("effort") ?? parameters.get("reasoning") ?? null,
      supportedEfforts: [],
    };
  });
}

export async function getCursorModelCatalog(args: {
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}): Promise<ProviderModelCatalogResponse> {
  const executablePath = resolveCursorAgentExecutablePath({
    explicitPath: args.runtimeOptions?.cursorBinaryPath,
  });
  if (!executablePath) {
    return {
      providerId: "cursor",
      ok: false,
      detail: "Cursor Agent CLI was not found.",
      models: [],
    };
  }

  const cwd = args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
  const client = new AcpProtocolClient({
    command: executablePath,
    args: ["acp"],
    cwd,
    env: buildCursorAgentEnv({ executablePath }),
    requestTimeoutMs: CURSOR_MODEL_CATALOG_TIMEOUT_MS,
  });
  try {
    const initialize = await client.initialize({
      clientName: "Stave",
      clientVersion: "1",
    });
    if (
      !initialize.authMethods?.some(
        (method) => method.id === CURSOR_AUTH_METHOD_ID,
      )
    ) {
      throw new Error("Cursor Agent CLI did not advertise cursor_login.");
    }
    await client.authenticate(CURSOR_AUTH_METHOD_ID);
    const session = await client.openSession({ cwd });
    const models = mapCursorAcpModelCatalog({
      configOptions: session.configOptions,
    });
    return {
      providerId: "cursor",
      ok: models.length > 0,
      detail:
        models.length > 0
          ? "Loaded the model catalog advertised by the Cursor ACP session."
          : "Cursor ACP returned an empty model catalog.",
      models,
    };
  } catch (error) {
    return {
      providerId: "cursor",
      ok: false,
      detail:
        error instanceof Error
          ? error.message
          : "Failed to load the Cursor model catalog.",
      models: [],
    };
  } finally {
    client.close("Cursor model catalog probe completed.");
  }
}
