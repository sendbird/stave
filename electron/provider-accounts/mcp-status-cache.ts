import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ProviderAccountProfileIdSchema } from "../../src/lib/providers/provider-accounts";
import { NEVER_SHARED_MCP_SERVER_NAMES } from "./shared-mcp";

const ClaudeAccountMcpReadingSchema = z.object({
  connected: z.array(z.string()),
  observedAt: z.number().finite().nonnegative(),
}).strict();

export type ClaudeAccountMcpReading = z.infer<typeof ClaudeAccountMcpReadingSchema>;

const READING_MAX_AGE_MS = 12 * 60 * 60 * 1_000;
const readings = new Map<string, ClaudeAccountMcpReading>();

function readingPath(accountProfileId: string, userDataPath?: string) {
  if (!userDataPath || !path.isAbsolute(userDataPath) || !ProviderAccountProfileIdSchema.safeParse(accountProfileId).success) return null;
  // Main and the host both observe MCP status. Separate files let them update
  // different accounts independently, with atomic replacement for readers.
  return path.join(userDataPath, "provider-accounts", "mcp-status", `${accountProfileId}.json`);
}

function loadReading(file: string): ClaudeAccountMcpReading | null {
  try {
    return ClaudeAccountMcpReadingSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

/** Store only connected names and the observation time, never server config or diagnostics. */
export function recordClaudeAccountMcpStatus(
  accountProfileId: string,
  servers: readonly { name: string; status: string }[],
  now = Date.now(),
  options: { userDataPath?: string; authoritative?: boolean } = {},
) {
  const own = servers.filter((server) => !NEVER_SHARED_MCP_SERVER_NAMES.has(server.name));
  // A turn that loads only Stave's own tools does not describe the whole account.
  if ((!options.authoritative && own.length === 0) || own.some((server) => server.status === "pending")) return;
  const reading = {
    connected: [...new Set(own.filter((server) => server.status === "connected").map((server) => server.name))].sort(),
    observedAt: now,
  };
  const file = readingPath(accountProfileId, options.userDataPath ?? process.env.STAVE_USER_DATA_PATH);
  if (!file) {
    readings.set(accountProfileId, reading);
    return;
  }
  if ((loadReading(file)?.observedAt ?? 0) > now) return;
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(temporary, JSON.stringify(reading), { mode: 0o600 });
    renameSync(temporary, file);
  } catch {
    // Status is advisory. A disk failure must not interrupt a turn.
    try { rmSync(temporary, { force: true }); } catch { /* Best effort. */ }
  }
}

/** Read from disk so observations in main and the host are visible to each other immediately. */
export function readClaudeAccountMcpStatus(accountProfileId: string, now = Date.now(), userDataPath = process.env.STAVE_USER_DATA_PATH): ClaudeAccountMcpReading | null {
  const file = readingPath(accountProfileId, userDataPath);
  const reading = file ? loadReading(file) : readings.get(accountProfileId);
  return reading && now - reading.observedAt <= READING_MAX_AGE_MS ? reading : null;
}

export function removeClaudeAccountMcpStatus(accountProfileId: string, userDataPath: string) {
  const file = readingPath(accountProfileId, userDataPath);
  readings.delete(accountProfileId);
  if (!file) return;
  try { rmSync(file, { force: true }); } catch { /* The account is already removed. */ }
}

/** Tests only. */
export function clearClaudeAccountMcpStatus() {
  readings.clear();
}
