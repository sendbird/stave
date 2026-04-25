import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canExecutePath,
  resolveExecutablePath,
  toAsarUnpackedPath,
} from "../../providers/executable-path";
import type { ResolvedWorkspaceScriptOrbitConfig } from "../../../src/lib/workspace-scripts/types";

export const ORBIT_URL_MARKER = "__STAVE_ORBIT_URL__=";
export const DEFAULT_ORBIT_PROXY_PORT = 1355;
const UNSUPPORTED_SHELL_META_CHARS = new Set([
  "|",
  "&",
  ";",
  "<",
  ">",
  "(",
  ")",
  "$",
  "`",
  "*",
  "?",
  "[",
  "]",
  "{",
  "}",
  "~",
]);

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

function formatCommandForDisplay(args: string[]) {
  return args.map(shellQuote).join(" ");
}

export function sanitizeOrbitName(value: string | undefined) {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9.-]+/g, "-")
    .replaceAll(/(^[.-]+)|([.-]+$)/g, "")
    .replaceAll(/-{2,}/g, "-");
  return normalized || "app";
}

function resolveBundledPortlessPath() {
  try {
    const portlessEntryUrl = import.meta.resolve?.("portless");
    if (!portlessEntryUrl) {
      return null;
    }
    const portlessEntryPath = fileURLToPath(portlessEntryUrl);
    const candidate = toAsarUnpackedPath(
      path.resolve(path.dirname(portlessEntryPath), "cli.js"),
    );
    return canExecutePath({ path: candidate }) ? candidate : null;
  } catch {
    return null;
  }
}

export function resolvePortlessCommand() {
  const bundled = resolveBundledPortlessPath();
  if (bundled) {
    return bundled;
  }

  return resolveExecutablePath({
    absolutePathEnvVar: "STAVE_PORTLESS_PATH",
    commandEnvVar: "STAVE_PORTLESS_COMMAND",
    defaultCommand: "portless",
  });
}

export function buildOrbitEnv(args: {
  orbit: ResolvedWorkspaceScriptOrbitConfig;
}) {
  return {
    PORTLESS_PORT: String(args.orbit.proxyPort ?? DEFAULT_ORBIT_PROXY_PORT),
    ...(args.orbit.noTls ? { PORTLESS_HTTPS: "0" } : {}),
  };
}

export function tokenizeOrbitCommand(command: string) {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  const pushCurrent = () => {
    if (current.length > 0) {
      tokens.push(current);
      current = "";
    }
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (quote === "'") {
      if (char === "'") {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (quote === '"') {
      if (char === '"') {
        quote = null;
      } else if (char === "\\") {
        escaping = true;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      pushCurrent();
      continue;
    }

    if (UNSUPPORTED_SHELL_META_CHARS.has(char)) {
      return null;
    }

    current += char;
  }

  if (escaping || quote) {
    return null;
  }

  pushCurrent();

  if (tokens.length === 0) {
    return null;
  }

  if (tokens[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) {
    return null;
  }

  return tokens;
}

export function buildOrbitRunArgs(args: {
  commandArgs: string[];
  orbit: ResolvedWorkspaceScriptOrbitConfig;
  defaultName: string;
}) {
  return [
    "run",
    "--name",
    sanitizeOrbitName(args.orbit.name || args.defaultName),
    ...args.commandArgs,
  ];
}

export function buildOrbitShellWrapperRunArgs(args: {
  command: string;
  orbit: ResolvedWorkspaceScriptOrbitConfig;
  defaultName: string;
}) {
  const childScript = `printf '%s%s\n' ${shellQuote(ORBIT_URL_MARKER)} "$PORTLESS_URL"; ${args.command}`;
  return buildOrbitRunArgs({
    commandArgs: ["sh", "-lc", childScript],
    orbit: args.orbit,
    defaultName: args.defaultName,
  });
}

export function buildOrbitGetArgs(args: {
  orbit: ResolvedWorkspaceScriptOrbitConfig;
  defaultName: string;
}) {
  return ["get", sanitizeOrbitName(args.orbit.name || args.defaultName)];
}

export function buildOrbitDisplayCommand(args: {
  portlessCommand: string;
  orbitArgs: string[];
}) {
  return formatCommandForDisplay([args.portlessCommand, ...args.orbitArgs]);
}

export function buildOrbitCommand(args: {
  command: string;
  orbit: ResolvedWorkspaceScriptOrbitConfig;
  defaultName: string;
  portlessCommand: string;
}) {
  return buildOrbitDisplayCommand({
    portlessCommand: args.portlessCommand,
    orbitArgs: buildOrbitShellWrapperRunArgs({
      command: args.command,
      orbit: args.orbit,
      defaultName: args.defaultName,
    }),
  });
}

function usesNodeScriptInterpreter(command: string) {
  return [".js", ".cjs", ".mjs"].includes(path.extname(command).toLowerCase());
}

export function buildPortlessLaunchSpec(args: {
  portlessCommand: string;
  orbitArgs: string[];
}) {
  if (!usesNodeScriptInterpreter(args.portlessCommand)) {
    return {
      command: args.portlessCommand,
      args: args.orbitArgs,
      env: {} as Record<string, string>,
    };
  }

  return {
    command: process.execPath,
    args: [args.portlessCommand, ...args.orbitArgs],
    env: {
      ELECTRON_RUN_AS_NODE: "1",
    },
  };
}

export function extractOrbitOutput(args: { buffer: string; chunk: string }) {
  const combined = args.buffer + args.chunk;
  const lines = combined.split(/\r?\n/);
  if (combined.endsWith("\n")) {
    lines.pop();
  }
  const nextBuffer = combined.endsWith("\n") ? "" : (lines.pop() ?? "");
  const orbitUrls: string[] = [];
  const passthroughLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(ORBIT_URL_MARKER)) {
      const url = line.slice(ORBIT_URL_MARKER.length).trim();
      if (url) {
        orbitUrls.push(url);
      }
      continue;
    }
    passthroughLines.push(line);
  }

  return {
    buffer: nextBuffer,
    orbitUrls,
    output:
      passthroughLines.length > 0 ? `${passthroughLines.join("\n")}\n` : "",
  };
}
