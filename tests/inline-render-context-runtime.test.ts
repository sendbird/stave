import { describe, expect, test } from "bun:test";
import type { InlineRenderModelContextEntry } from "@/lib/inline-render/inline-render-interaction";
import { INLINE_RENDER_MODEL_CONTEXT_SOURCE_ID } from "@/lib/inline-render/inline-render-interaction";
import {
  createInlineRenderContextRuntime,
  type InlineRenderModelContextBridge,
} from "@/store/inline-render-context-runtime";

const RENDER_A = "0123456789abcdef-0f0e0d0c-0b0a-4908-8706-050403020100";
const RENDER_B = "0123456789abcdef-1f0e0d0c-0b0a-4908-8706-050403020100";

function fakeBridge() {
  const stored = new Map<string, InlineRenderModelContextEntry & { taskId: string }>();
  const writes: Array<{ renderId: string; cleared: boolean }> = [];
  const bridge: InlineRenderModelContextBridge = {
    async setModelContext({ renderId, context }) {
      writes.push({ renderId, cleared: context === null });
      if (context === null) stored.delete(renderId);
      else
        stored.set(renderId, {
          renderId,
          taskId: "task-1",
          title: "Weekly spend",
          context,
          updatedAt: `2026-10-09T00:00:0${writes.length}.000Z`,
        });
      return { ok: true };
    },
    async readModelContext({ renderId }) {
      return { ok: true, entry: stored.get(renderId) ?? null };
    },
    async listTaskModelContexts({ taskId }) {
      return { ok: true, entries: [...stored.values()].filter((entry) => entry.taskId === taskId) };
    },
  };
  return { bridge, stored, writes };
}

describe("inline render context runtime", () => {
  test("the last update per page wins and one write follows a burst", async () => {
    const { bridge, stored, writes } = fakeBridge();
    const runtime = createInlineRenderContextRuntime({ getBridge: () => bridge, writeDelayMs: 5 });
    for (const selected of ["claude", "codex", "cursor"]) {
      runtime.update({
        renderId: RENDER_A,
        taskId: "task-1",
        title: "Weekly spend",
        context: { text: null, structured: { selected } },
      });
    }
    expect(runtime.getSnapshot(RENDER_A)?.context.structured).toEqual({ selected: "cursor" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(writes).toEqual([{ renderId: RENDER_A, cleared: false }]);
    expect(stored.get(RENDER_A)?.context.structured).toEqual({ selected: "cursor" });
  });

  test("a send flushes pending writes and gets one labelled part for the task", async () => {
    const { bridge } = fakeBridge();
    const runtime = createInlineRenderContextRuntime({ getBridge: () => bridge, writeDelayMs: 10_000 });
    runtime.update({
      renderId: RENDER_A,
      taskId: "task-1",
      title: "Weekly spend",
      context: { text: "Codex selected", structured: null },
    });
    const parts = await runtime.collectParts({ workspaceId: "ws-1", taskId: "task-1" });
    expect(parts).toHaveLength(1);
    expect(parts[0]?.sourceId).toBe(INLINE_RENDER_MODEL_CONTEXT_SOURCE_ID);
    expect(parts[0]?.content).toContain("Codex selected");
    expect(await runtime.collectParts({ workspaceId: "ws-1", taskId: "task-2" })).toEqual([]);
  });

  test("clearing removes it from the indicator and from the next turn", async () => {
    const { bridge, writes } = fakeBridge();
    const runtime = createInlineRenderContextRuntime({ getBridge: () => bridge, writeDelayMs: 0 });
    let notified = 0;
    runtime.subscribe(RENDER_A, () => {
      notified += 1;
    });
    runtime.update({
      renderId: RENDER_A,
      taskId: "task-1",
      title: "Weekly spend",
      context: { text: "x", structured: null },
    });
    await runtime.collectParts({ workspaceId: null, taskId: "task-1" });
    runtime.clear({ renderId: RENDER_A, taskId: "task-1" });
    expect(runtime.getSnapshot(RENDER_A)).toBeNull();
    expect(await runtime.collectParts({ workspaceId: null, taskId: "task-1" })).toEqual([]);
    expect(writes.map((write) => write.cleared)).toEqual([false, true]);
    expect(notified).toBe(2);
  });

  test("a stored context is loaded once for the indicator; an update in flight wins", async () => {
    const { bridge, stored } = fakeBridge();
    stored.set(RENDER_B, {
      renderId: RENDER_B,
      taskId: "task-1",
      title: "Old page",
      context: { text: "from disk", structured: null },
      updatedAt: "2026-10-08T00:00:00.000Z",
    });
    const runtime = createInlineRenderContextRuntime({ getBridge: () => bridge });
    expect(runtime.getSnapshot(RENDER_B)).toBeUndefined();
    await runtime.load({ renderId: RENDER_B, taskId: "task-1" });
    expect(runtime.getSnapshot(RENDER_B)?.context.text).toBe("from disk");

    const loading = runtime.load({ renderId: RENDER_A, taskId: "task-1" });
    runtime.update({ renderId: RENDER_A, taskId: "task-1", title: "New", context: { text: "live", structured: null } });
    await loading;
    expect(runtime.getSnapshot(RENDER_A)?.context.text).toBe("live");
  });

  test("without the desktop bridge contexts live in memory, per task", async () => {
    const runtime = createInlineRenderContextRuntime({ getBridge: () => undefined });
    runtime.update({ renderId: RENDER_A, taskId: "task-1", title: "A", context: { text: "a", structured: null } });
    runtime.update({ renderId: RENDER_B, taskId: "task-2", title: "B", context: { text: "b", structured: null } });
    const parts = await runtime.collectParts({ workspaceId: null, taskId: "task-1" });
    expect(parts).toHaveLength(1);
    expect(parts[0]?.content).toContain('"page": "A"');
    expect(parts[0]?.content).not.toContain('"page": "B"');
  });
});
