import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { requestClaudeBackgroundTask, trackClaudeBackgroundTasks } from "../electron/providers/claude-background-tasks";
import { readClaudeBackgroundTail } from "../electron/providers/claude-background-output";
import { BACKGROUND_LOG_TAIL_BYTES, canStopBackgroundTask, type BackgroundTaskEvent } from "../src/lib/providers/background-tasks";
import { NormalizedProviderEventSchema } from "../src/lib/providers/schemas";
import { reduceProviderTurnActivityEvents } from "../src/lib/providers/turn-status";

const owner = { workspaceId: "workspace", taskId: "task", turnId: "turn" };
const sessionId = "example-session";
const nativeId = "background-1";
const sdk = (message: Record<string, unknown>) => ({ session_id: sessionId, ...message }) as SDKMessage;
const system = (subtype: string, data: Record<string, unknown>) => sdk({ type: "system", subtype, ...data });

function setup(stopTask?: (id: string) => Promise<void>) {
  const events: BackgroundTaskEvent[] = [];
  const tracker = trackClaudeBackgroundTasks({
    owner,
    getQuery: () => stopTask ? { stopTask } : undefined,
    emit: (event) => { events.push(NormalizedProviderEventSchema.parse(event) as BackgroundTaskEvent); },
    now: () => 1000,
  });
  return { tracker, events };
}

describe("Claude background tasks", () => {
  test("maps the provider's live set, excludes foreground and ambient tasks, and settles unconfirmed endings", async () => {
    const { tracker, events } = setup();
    try {
      await tracker.observe(system("task_started", { task_id: "foreground", is_backgrounded: false }));
      await tracker.observe(system("background_tasks_changed", { tasks: [
        { task_id: nativeId, task_type: "local_bash", description: "Run tests", run_id: "b" },
        { task_id: "ambient", task_type: "local_bash", description: "Watch settings", ambient: true },
      ] }));
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        providerId: "claude-code", description: "Run tests", startedAt: 1000,
        status: "running", confidence: "confirmed", canStop: false,
      });
      await tracker.observe(system("task_notification", { task_id: nativeId, run_id: "a", status: "failed" }));
      expect(events).toHaveLength(1);
      await tracker.observe(system("background_tasks_changed", { tasks: [] }));
      expect(events.at(-1)).toMatchObject({ id: events[0].id, status: "unknown", confidence: "inferred" });
      await tracker.observe(system("task_notification", { task_id: nativeId, run_id: "b", status: "completed" }));
      expect(events.at(-1)).toMatchObject({ id: events[0].id, status: "completed", confidence: "confirmed" });
    } finally {
      tracker.close();
    }
  });

  test("retains failed and finished rows and freezes running rows when turn observation ends", async () => {
    const { tracker, events } = setup();
    try {
      for (const task_id of ["ok", "failed", "no-terminal-event"]) {
        await tracker.observe(system("task_started", { task_id, is_backgrounded: true, description: task_id }));
      }
      await tracker.observe(system("task_updated", { task_id: "ok", patch: { status: "completed" } }));
      await tracker.observe(system("task_notification", { task_id: "failed", status: "failed" }));
      const { retiredSnapshot } = reduceProviderTurnActivityEvents({
        activityByTask: {}, ...owner, providerId: "claude-code", events: [...events, { type: "done" }], now: 2000,
      });
      expect(retiredSnapshot?.backgroundTasks?.map((row) => [row.status, row.confidence, row.canStop])).toEqual([
        ["completed", "confirmed", false], ["failed", "confirmed", false], ["unknown", "inferred", false],
      ]);
    } finally {
      tracker.close();
    }
  });

  test("Stop requires the live query, a confirmed row and the exact owner, and waits for provider status", async () => {
    const ids: string[] = [];
    const { tracker, events } = setup(async (id) => { ids.push(id); });
    try {
      await tracker.observe(sdk({ type: "assistant", parent_tool_use_id: "spawn-worker", message: { content: [{ type: "tool_use", name: "Bash", id: "tool" }] } }));
      await tracker.observe(sdk({
        type: "user", tool_use_result: { backgroundTaskId: nativeId },
        message: { content: [{ type: "tool_result", tool_use_id: "tool", content: "" }] },
      }));
      const stop = { ...owner, operation: "stop" as const, id: events[0].id };
      expect(canStopBackgroundTask(events[0], true)).toBe(false);
      expect(await requestClaudeBackgroundTask(stop)).toEqual({ ok: false });
      await tracker.observe(system("task_started", { task_id: nativeId, description: "Run tests", is_backgrounded: true }));
      expect(events.at(-1)?.parentToolUseId).toBe("spawn-worker");
      expect(canStopBackgroundTask(events.at(-1)!, true)).toBe(true);
      expect(await requestClaudeBackgroundTask({ ...stop, workspaceId: "unrelated" })).toEqual({ ok: false });
      expect(await requestClaudeBackgroundTask(stop)).toEqual({ ok: true });
      expect(await requestClaudeBackgroundTask(stop)).toEqual({ ok: false });
      expect(ids).toEqual([nativeId]);
      expect(events.at(-1)?.status).toBe("running");
      await tracker.observe(system("task_started", { task_id: "late", is_backgrounded: true }));
      const lateId = events.at(-1)!.id;
      expect(events.at(-1)?.canStop).toBe(true);
      await tracker.observe(sdk({ type: "result" }));
      expect(events.findLast((row) => row.id === lateId)).toMatchObject({ status: "running", canStop: false });
      expect(await requestClaudeBackgroundTask({ ...stop, id: lateId })).toEqual({ ok: false });
      await tracker.observe(system("task_notification", { task_id: nativeId, status: "stopped" }));
      expect(events.at(-1)).toMatchObject({ status: "stopped", canStop: false });
    } finally {
      tracker.close();
    }
    expect(await requestClaudeBackgroundTask({ ...owner, operation: "stop", id: events[0].id })).toEqual({ ok: false });
  });

  test("reads a bounded suffix through the launch receipt and rejects other sessions and symlinked output", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "claude-background-test-"));
    const dir = path.join(root, "project", sessionId, "tasks");
    const file = path.join(dir, `${nativeId}.output`);
    const { tracker, events } = setup();
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(file, "x".repeat(BACKGROUND_LOG_TAIL_BYTES * 2) + "\x1b[31mlast line\x1b[0m\n");
      await tracker.observe(system("task_started", { task_id: nativeId, is_backgrounded: true }));
      await tracker.observe(sdk({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", id: "tool" }] } }));
      await tracker.observe(sdk({
        type: "user", tool_use_result: { backgroundTaskId: nativeId },
        message: { content: [{
          type: "tool_result", tool_use_id: "tool",
          content: `Command running in background with ID: ${nativeId}. Output is being written to: ${file}. You will be notified when it completes.`,
        }] },
      }));
      expect(events.at(-1)?.hasOutput).toBe(true);
      const response = await requestClaudeBackgroundTask({ ...owner, operation: "read", id: events[0].id });
      expect(response.ok).toBe(true);
      const output = response.ok ? response.output : undefined;
      expect(output?.truncated).toBe(true);
      expect(output?.text.endsWith("last line\n")).toBe(true);
      expect(output?.text).not.toContain("\x1b");
      expect(Buffer.byteLength(output!.text)).toBeLessThanOrEqual(BACKGROUND_LOG_TAIL_BYTES);
      await tracker.observe(system("task_notification", { task_id: nativeId, status: "completed", output_file: file }));
      expect(events.at(-1)?.finalOutput).toEqual(output);
      expect(await readClaudeBackgroundTail(file, "other-session", nativeId)).toBeUndefined();
      const alias = path.join(dir, "alias.output");
      await symlink(file, alias);
      expect(await readClaudeBackgroundTail(alias, sessionId, "alias")).toBeUndefined();
    } finally {
      tracker.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
