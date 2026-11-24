/**
 * Runs scratch retention (`utils/workspace-scratch-retention.ts`) for every
 * registered project's main checkout: shortly after the app starts, then at
 * most once a day. The last run time is kept in a small file under app data,
 * so restarting the app several times a day does not repeat the pass.
 *
 * Worktree workspaces are skipped: archiving one removes its folder.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { app } from "electron";
import {
  isScratchRetentionDue,
  mainCheckoutRoots,
  runWorkspaceScratchRetention,
} from "./utils/workspace-scratch-retention";

/** Let startup (window, host service, persistence) finish before touching disk. */
const STARTUP_DELAY_MS = 90_000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const MARKER_FILE_NAME = "workspace-scratch-retention.json";

function markerPath() {
  return path.join(app.getPath("userData"), MARKER_FILE_NAME);
}

async function readLastRunAt(): Promise<number | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(markerPath(), "utf8")) as { lastRunAt?: unknown };
    return typeof parsed.lastRunAt === "number" && Number.isFinite(parsed.lastRunAt) ? parsed.lastRunAt : null;
  } catch {
    return null;
  }
}

async function writeLastRunAt(lastRunAt: number) {
  await fs.writeFile(markerPath(), JSON.stringify({ lastRunAt }), "utf8");
}

let startupTimer: ReturnType<typeof setTimeout> | null = null;
let checkTimer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function runIfDue() {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    if (!isScratchRetentionDue(await readLastRunAt(), now)) return;
    // Recorded first: a pass that crashes the app is not retried on every start.
    await writeLastRunAt(now);
    const { ensurePersistenceReady } = await import("./state");
    const registry = (await ensurePersistenceReady()).loadRepositoryRegistry();
    const result = await runWorkspaceScratchRetention({ roots: mainCheckoutRoots(registry), now });
    if (result.removedFiles > 0) {
      console.info("[workspace-scratch] removed old scratch files", result);
    }
  } catch (error) {
    console.warn("[workspace-scratch] retention failed", { error: String(error) });
  } finally {
    running = false;
  }
}

export function startWorkspaceScratchRetentionRuntime() {
  if (startupTimer || checkTimer) return;
  startupTimer = setTimeout(() => {
    startupTimer = null;
    void runIfDue();
    checkTimer = setInterval(() => void runIfDue(), CHECK_INTERVAL_MS);
    checkTimer.unref?.();
  }, STARTUP_DELAY_MS);
  startupTimer.unref?.();
}

export function stopWorkspaceScratchRetentionRuntime() {
  if (startupTimer) clearTimeout(startupTimer);
  if (checkTimer) clearInterval(checkTimer);
  startupTimer = null;
  checkTimer = null;
}
