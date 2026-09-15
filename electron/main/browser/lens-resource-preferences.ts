import { app } from "electron";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

let kept: Set<string> | undefined;
const key = (workspaceId: string, sessionId: string) => JSON.stringify([workspaceId, sessionId]);
const filePath = () => join(app.getPath("userData"), "lens-keep-active.json");

function readPreferences(): Set<string> {
  if (kept) return kept;
  if (!existsSync(filePath())) return kept = new Set();
  const data: unknown = JSON.parse(readFileSync(filePath(), "utf8"));
  if (!Array.isArray(data) || data.length > 1000 || !data.every((value) => typeof value === "string")) {
    throw new Error("Invalid Lens keep-active preferences");
  }
  return kept = new Set(data);
}

export function isLensKeptActive(workspaceId: string, sessionId: string): boolean {
  // An unreadable preference file must never silently discard protected pages.
  try { return readPreferences().has(key(workspaceId, sessionId)); }
  catch { return true; }
}

export function setLensKeptActive(workspaceId: string, sessionId: string, value: boolean): void {
  const next = new Set(readPreferences());
  if (value) next.add(key(workspaceId, sessionId));
  else next.delete(key(workspaceId, sessionId));
  if (next.size > 1000) throw new Error("Keep-active limit reached");
  const path = filePath();
  writeFileSync(`${path}.tmp`, JSON.stringify([...next]), { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
  kept = next;
}
