import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type {
  McpDiscoveryResponse,
  McpDiscoveredServer,
} from "../../src/lib/providers/provider.types";

type Source = McpDiscoveredServer["sources"][number];

async function readOptionalJson(filePath: string) {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return { __error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function discoverClaudeEntries(args: {
  document: Record<string, unknown>;
  source: Source;
}) {
  const servers =
    asRecord(args.document.mcpServers) ?? asRecord(args.document.mcp_servers);
  if (!servers) return [];
  return Object.entries(servers).map(([name, config]) => {
    const value = asRecord(config) ?? {};
    return {
      name,
      sources: [args.source],
      claude: { configured: true },
      codex: { configured: false },
      transport: typeof value.url === "string" ? "http" : "stdio",
    } satisfies McpDiscoveredServer;
  });
}

export function discoverCodexEntries(toml: string) {
  const servers: McpDiscoveredServer[] = [];
  const pattern = /^\s*\[mcp_servers\.(["']?)([^\]"']+)\1\]\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(toml))) {
    const name = match[2]?.trim();
    if (!name) continue;
    const next = toml.slice(match.index + match[0].length).search(/^\s*\[/m);
    const section = toml.slice(
      match.index,
      next < 0 ? undefined : match.index + match[0].length + next,
    );
    servers.push({
      name,
      sources: ["codex-user"],
      claude: { configured: false },
      codex: { configured: true },
      transport: /^\s*url\s*=/m.test(section) ? "http" : "stdio",
    });
  }
  return servers;
}

function mergeServers(servers: McpDiscoveredServer[]) {
  const merged = new Map<string, McpDiscoveredServer>();
  for (const server of servers) {
    const key = server.name.toLowerCase();
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, server);
      continue;
    }
    existing.sources.push(...server.sources);
    existing.claude.configured ||= server.claude.configured;
    existing.codex.configured ||= server.codex.configured;
    if (existing.transport !== server.transport) existing.transport = "unknown";
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function discoverMcpServers(args: {
  cwd?: string;
}): Promise<McpDiscoveryResponse> {
  const cwd = args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
  const home = homedir();
  const claudeFiles: Array<[string, Source]> = [
    [path.join(home, ".claude", "settings.json"), "claude-user"],
    [path.join(cwd, ".claude", "settings.json"), "claude-project"],
    [path.join(cwd, ".mcp.json"), "claude-project"],
  ];
  const discovered: McpDiscoveredServer[] = [];
  const errors: string[] = [];
  for (const [filePath, source] of claudeFiles) {
    const document = await readOptionalJson(filePath);
    if (!document) continue;
    if (typeof document.__error === "string") {
      errors.push(`${path.basename(filePath)}: ${document.__error}`);
      continue;
    }
    discovered.push(...discoverClaudeEntries({ document, source }));
  }
  try {
    discovered.push(
      ...discoverCodexEntries(
        await readFile(path.join(home, ".codex", "config.toml"), "utf8"),
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      errors.push(
        `config.toml: ${error instanceof Error ? error.message : "Unreadable"}`,
      );
  }
  return {
    ok: errors.length === 0,
    servers: mergeServers(discovered),
    errors,
    discoveredAt: Date.now(),
  };
}
