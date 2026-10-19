import { describe, expect, test } from "bun:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  buildClaudeBackgroundHoldNotice,
  createClaudePostResultBackgroundHold,
  readClaudeStreamUntilBackgroundHold,
} from "../electron/providers/claude-background-hold";

const tasks = (...entries: Array<{ id: string; type: string; description?: string; ambient?: boolean }>) =>
  ({
    type: "system",
    subtype: "background_tasks_changed",
    tasks: entries.map((entry) => ({
      task_id: entry.id,
      task_type: entry.type,
      description: entry.description ?? entry.id,
      ...(entry.ambient === undefined ? {} : { ambient: entry.ambient }),
    })),
  }) as unknown as SDKMessage;
const result = (fields: Record<string, unknown> = {}) =>
  ({ type: "result", subtype: "success", is_error: false, ...fields }) as unknown as SDKMessage;
const message = (type: string, subtype?: string) =>
  ({ type, ...(subtype ? { subtype } : {}), message: { content: [] } }) as unknown as SDKMessage;
const shell = tasks({ id: "b1", type: "local_bash", description: "sleep 7000 | yarn start" });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const typeOf = (entry: SDKMessage) => {
  const subtype = (entry as { subtype?: string }).subtype;
  return entry.type === "system" && subtype ? `${entry.type}:${subtype}` : entry.type;
};

async function readAll(
  source: AsyncIterable<SDKMessage>,
  hold = createClaudePostResultBackgroundHold(),
  onMessage?: (entry: SDKMessage) => Promise<void> | void,
) {
  const seen: string[] = [];
  for await (const entry of readClaudeStreamUntilBackgroundHold(source, hold, { graceMs: 30, minQuietMs: 5 })) {
    seen.push(typeOf(entry));
    await onMessage?.(entry);
  }
  return { seen, held: hold.heldTasks() };
}

/** Never settles until the test ends: the CLI holding the stream open. */
const heldOpen = () => new Promise<void>(() => {});

describe("createClaudePostResultBackgroundHold", () => {
  test("holds only an idle session after result while background shells run", () => {
    const hold = createClaudePostResultBackgroundHold();
    hold.observe(shell);
    expect(hold.holdingTasks()).toBeNull();
    hold.observe(result());
    expect(hold.holdingTasks()?.map((task) => task.id)).toEqual(["b1"]);
  });

  test("a shell started after result is held too, and an empty set lets go", () => {
    const hold = createClaudePostResultBackgroundHold();
    hold.observe(result());
    expect(hold.holdingTasks()).toBeNull();
    hold.observe(tasks({ id: "m1", type: "monitor_mcp" }));
    expect(hold.holdingTasks()?.map((task) => task.id)).toEqual(["m1"]);
    hold.observe(tasks());
    expect(hold.holdingTasks()).toBeNull();
  });

  test("a result with queued input is not idle: another user turn follows", () => {
    const hold = createClaudePostResultBackgroundHold();
    hold.observe(shell);
    hold.observe(result({ queued_turn_count: 1 }));
    expect(hold.holdingTasks()).toBeNull();
    hold.observe(result({ queued_turn_count: 0 }));
    expect(hold.holdingTasks()).not.toBeNull();
  });

  test("activity after result lets go until the next result; idle messages do not", () => {
    for (const activity of [
      message("assistant"),
      message("stream_event"),
      message("user"),
      message("system", "init"),
      message("tool_progress"),
      message("something_new"),
    ]) {
      const hold = createClaudePostResultBackgroundHold();
      hold.observe(shell);
      hold.observe(result());
      hold.observe(activity);
      expect(hold.holdingTasks()).toBeNull();
      hold.observe(result());
      expect(hold.holdingTasks()).not.toBeNull();
    }
    const hold = createClaudePostResultBackgroundHold();
    hold.observe(shell);
    hold.observe(result());
    for (const idle of [
      message("prompt_suggestion"),
      message("rate_limit_event"),
      message("system", "files_persisted"),
      message("system", "task_updated"),
      message("system", "task_notification"),
    ]) {
      hold.observe(idle);
      expect(hold.holdingTasks()).not.toBeNull();
    }
  });

  test("subagents, workflows and unknown task types keep the old wait", () => {
    for (const type of ["local_agent", "local_workflow", "mcp_task", "remote_agent", "something_new"]) {
      const hold = createClaudePostResultBackgroundHold();
      hold.observe(tasks({ id: "t1", type }));
      hold.observe(result());
      expect(hold.holdingTasks()).toBeNull();
    }
    const mixed = createClaudePostResultBackgroundHold();
    mixed.observe(tasks({ id: "w1", type: "local_workflow" }, { id: "b1", type: "local_bash" }));
    mixed.observe(result());
    expect(mixed.holdingTasks()).toBeNull();
    mixed.observe(tasks({ id: "b1", type: "local_bash" }));
    expect(mixed.holdingTasks()?.map((task) => task.id)).toEqual(["b1"]);
  });

  test("ignores ambient tasks, which the CLI never waits for", () => {
    const hold = createClaudePostResultBackgroundHold();
    hold.observe(tasks({ id: "a1", type: "monitor_ws", ambient: true }));
    hold.observe(result());
    expect(hold.holdingTasks()).toBeNull();
  });

  test("never holds while the runtime waits on an approval or a question", () => {
    let busy = true;
    const hold = createClaudePostResultBackgroundHold({ isTurnBusy: () => busy });
    hold.observe(shell);
    hold.observe(result());
    expect(hold.holdingTasks()).toBeNull();
    busy = false;
    expect(hold.holdingTasks()).not.toBeNull();
  });
});

describe("readClaudeStreamUntilBackgroundHold", () => {
  test("ends a stream that stays open after result while a shell runs", async () => {
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    async function* source(): AsyncGenerator<SDKMessage> {
      yield shell;
      yield result();
      await released;
      throw new Error("Query closed");
    }
    const started = Date.now();
    const { seen, held } = await readAll(source());
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(seen).toEqual(["system:background_tasks_changed", "result"]);
    expect(held?.map((task) => task.id)).toEqual(["b1"]);
    // Closing the query later settles the abandoned read without an unhandled rejection.
    release();
    await sleep(0);
  });

  test("passes a stream that ends by itself through unchanged", async () => {
    async function* source(): AsyncGenerator<SDKMessage> {
      yield shell;
      yield result();
    }
    const { seen, held } = await readAll(source());
    expect(seen).toEqual(["system:background_tasks_changed", "result"]);
    expect(held).toBeNull();
  });

  test("time the caller spends handling result does not count, so messages that arrive next are read", async () => {
    async function* source(): AsyncGenerator<SDKMessage> {
      yield shell;
      yield result();
      yield message("system", "files_persisted");
      yield message("prompt_suggestion");
      yield result();
      await heldOpen();
    }
    // Like `await mcpAppViews.settle()` after result: longer than the grace.
    const { seen, held } = await readAll(source(), undefined, async (entry) => {
      if (entry.type === "result") await sleep(80);
    });
    expect(seen).toEqual([
      "system:background_tasks_changed",
      "result",
      "system:files_persisted",
      "prompt_suggestion",
      "result",
    ]);
    expect(held).not.toBeNull();
  });

  test("a follow-up turn after result (a steer) is not cut, even through a long pause", async () => {
    async function* source(): AsyncGenerator<SDKMessage> {
      yield shell;
      yield result();
      await sleep(10);
      yield message("system", "init");
      // Time to first token, or a question waiting for the user: past the grace.
      await sleep(120);
      yield message("assistant");
      yield result();
      await heldOpen();
    }
    const { seen, held } = await readAll(source());
    expect(seen).toEqual([
      "system:background_tasks_changed",
      "result",
      "system:init",
      "assistant",
      "result",
    ]);
    expect(held).not.toBeNull();
  });

  test("a question that starts while the session looks idle keeps the turn open", async () => {
    let busy = false;
    async function* source(): AsyncGenerator<SDKMessage> {
      yield shell;
      yield result();
      busy = true;
      await sleep(120);
      busy = false;
      yield message("system", "task_updated");
      await heldOpen();
    }
    const hold = createClaudePostResultBackgroundHold({ isTurnBusy: () => busy });
    const { seen, held } = await readAll(source(), hold);
    expect(seen).toEqual(["system:background_tasks_changed", "result", "system:task_updated"]);
    expect(held).not.toBeNull();
  });

  test("a stream that fails while held open passes the error to the caller", async () => {
    async function* source(): AsyncGenerator<SDKMessage> {
      yield shell;
      yield result();
      await sleep(5);
      throw new Error("Claude Code process exited");
    }
    await expect(readAll(source())).rejects.toThrow("Claude Code process exited");
  });

  test("a shell that finishes inside the grace lets the CLI's notification turn finish", async () => {
    async function* source(): AsyncGenerator<SDKMessage> {
      yield shell;
      yield result();
      await sleep(10);
      yield tasks();
      yield message("system", "task_notification");
      yield message("system", "init");
      await sleep(60);
      yield message("assistant");
      yield result();
    }
    const { seen, held } = await readAll(source());
    expect(seen.slice(-3)).toEqual(["system:init", "assistant", "result"]);
    expect(held).toBeNull();
  });
});

describe("buildClaudeBackgroundHoldNotice", () => {
  test("names the stopped work, clips long descriptions and counts the rest", () => {
    const notice = buildClaudeBackgroundHoldNotice([
      { id: "b1", type: "local_bash", description: "Start local dev server for staging repro" },
      { id: "b2", type: "local_bash", description: "x".repeat(120) },
      { id: "b3", type: "local_bash", description: "" },
      { id: "b4", type: "monitor_mcp", description: "watch" },
    ]);
    expect(notice).toContain("Start local dev server for staging repro");
    expect(notice).toContain(`${"x".repeat(79)}…`);
    expect(notice).toContain("b3");
    expect(notice).toContain("and 1 more");
    expect(notice).not.toContain("watch");
  });
});
