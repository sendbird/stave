import type {
  McpConfigProvider,
  McpConfigScope,
  McpConfigTransport,
  McpHeaderEnvBinding,
  McpServerConfigDraft,
  McpServerConfigSnapshot,
} from "./mcp-config.types";

export type McpConfigFormState = {
  provider: McpConfigProvider;
  installProviders: McpConfigProvider[];
  scope: McpConfigScope;
  name: string;
  transport: McpConfigTransport;
  command: string;
  argsText: string;
  replaceArgs: boolean;
  url: string;
  replaceUrl: boolean;
  envVarsText: string;
  bearerTokenEnvVar: string;
  headerBindingsText: string;
  enabled: boolean;
};

const ENV_VAR_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SERVER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatHeaderBindings(bindings: McpHeaderEnvBinding[]) {
  return bindings.map(({ name, envVar }) => `${name}=${envVar}`).join("\n");
}

export function parseMcpHeaderBindings(value: string) {
  const bindings: McpHeaderEnvBinding[] = [];
  for (const entry of lines(value)) {
    const separatorIndex = entry.indexOf("=");
    const name = entry.slice(0, separatorIndex).trim();
    const envVar = entry.slice(separatorIndex + 1).trim();
    if (
      separatorIndex < 1 ||
      !HEADER_NAME_PATTERN.test(name) ||
      !ENV_VAR_PATTERN.test(envVar)
    ) {
      throw new Error(
        `Header binding “${entry}” must use the format Header-Name=ENV_VAR.`,
      );
    }
    bindings.push({ name, envVar });
  }
  const normalizedNames = bindings.map((binding) => binding.name.toLowerCase());
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    throw new Error("Header binding names must be unique.");
  }
  return bindings;
}

export function createInitialMcpConfigForm(
  snapshot?: McpServerConfigSnapshot,
): McpConfigFormState {
  if (!snapshot) {
    return {
      provider: "claude-code",
      installProviders: ["claude-code", "codex"],
      scope: "user",
      name: "",
      transport: "stdio",
      command: "",
      argsText: "",
      replaceArgs: true,
      url: "",
      replaceUrl: true,
      envVarsText: "",
      bearerTokenEnvVar: "",
      headerBindingsText: "",
      enabled: true,
    };
  }
  return {
    provider: snapshot.provider,
    installProviders: [snapshot.provider],
    scope: snapshot.scope,
    name: snapshot.name,
    transport: snapshot.transport,
    command: snapshot.command ?? "",
    argsText: "",
    replaceArgs: false,
    url: snapshot.urlRedacted ? "" : (snapshot.url ?? ""),
    replaceUrl: !snapshot.urlRedacted,
    envVarsText: snapshot.envVars.join("\n"),
    bearerTokenEnvVar: snapshot.bearerTokenEnvVar ?? "",
    headerBindingsText: formatHeaderBindings(snapshot.headerEnvBindings),
    enabled: snapshot.enabled,
  };
}

export function validateMcpConfigForm(args: {
  form: McpConfigFormState;
  editing: boolean;
  workspaceCwd?: string;
}) {
  const { form } = args;
  if (!SERVER_NAME_PATTERN.test(form.name.trim())) {
    throw new Error(
      "Server name must start with a letter or number and use only letters, numbers, dots, underscores, or hyphens.",
    );
  }
  const installProviders = resolveMcpInstallProviders(form);
  if (installProviders.length === 0) {
    throw new Error("Choose at least one provider to install this MCP server.");
  }
  if (
    installProviders.includes("codex") &&
    form.scope !== "user" &&
    installProviders.length === 1
  ) {
    throw new Error("Codex configuration editing supports user scope only.");
  }
  if (installProviders.includes("codex") && form.transport === "sse") {
    throw new Error("Codex does not support creating SSE MCP servers.");
  }
  if (form.scope !== "user" && !args.workspaceCwd) {
    throw new Error(
      "Open a workspace before editing project-scoped MCP servers.",
    );
  }
  if (form.transport === "stdio" && !form.command.trim()) {
    throw new Error("Command is required for a stdio MCP server.");
  }
  if (
    form.transport !== "stdio" &&
    (!args.editing || form.replaceUrl) &&
    !form.url.trim()
  ) {
    throw new Error("URL is required for a remote MCP server.");
  }
  if (form.transport !== "stdio" && form.replaceUrl) {
    const parsed = new URL(form.url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Remote MCP URL must use HTTP or HTTPS.");
    }
  }
  const envVars = lines(form.envVarsText);
  if (envVars.some((name) => !ENV_VAR_PATTERN.test(name))) {
    throw new Error(
      "Environment variable names must use POSIX ENV_VAR syntax.",
    );
  }
  if (new Set(envVars).size !== envVars.length) {
    throw new Error("Environment variable names must be unique.");
  }
  if (
    form.bearerTokenEnvVar.trim() &&
    !ENV_VAR_PATTERN.test(form.bearerTokenEnvVar.trim())
  ) {
    throw new Error("Bearer token environment variable has an invalid name.");
  }
  parseMcpHeaderBindings(form.headerBindingsText);
}

export function resolveMcpInstallProviders(form: McpConfigFormState) {
  if (form.installProviders.length === 0) {
    return [];
  }
  const providers = form.installProviders.includes(form.provider)
    ? form.installProviders
    : [form.provider];
  return providers.filter(
    (provider, index) => providers.indexOf(provider) === index,
  );
}

export function buildMcpConfigDraft(args: {
  form: McpConfigFormState;
  editing: boolean;
}): McpServerConfigDraft {
  const { form } = args;
  return {
    provider: form.provider,
    scope: form.scope,
    name: form.name.trim(),
    transport: form.transport,
    ...(form.transport === "stdio"
      ? {
          command: form.command.trim(),
          ...(!args.editing || form.replaceArgs
            ? { args: lines(form.argsText) }
            : {}),
        }
      : {
          ...(!args.editing || form.replaceUrl ? { url: form.url.trim() } : {}),
        }),
    envVars: lines(form.envVarsText),
    ...(form.bearerTokenEnvVar.trim()
      ? { bearerTokenEnvVar: form.bearerTokenEnvVar.trim() }
      : {}),
    headerEnvBindings: parseMcpHeaderBindings(form.headerBindingsText),
    enabled: form.enabled,
  };
}
