import { describe, expect, test } from "bun:test";
import {
  CLOSED_TAB_STACK_LIMIT,
  ClosedTabRegistry,
  pushClosedTab,
  type ClosedPaneTab,
} from "@/lib/panes/closed-tab-stack";

const task = (taskId: string): ClosedPaneTab => ({ kind: "task", taskId });
const file = (filePath: string): ClosedPaneTab => ({
  kind: "editor",
  editorTabId: `file:${filePath}`,
  filePath,
  editorKind: "text",
});

describe("closed tab stack", () => {
  test("pushes newest last and moves a re-closed target to the top", () => {
    let stack = pushClosedTab([], task("a"));
    stack = pushClosedTab(stack, file("src/x.ts"));
    stack = pushClosedTab(stack, task("a"));
    expect(stack).toEqual([file("src/x.ts"), task("a")]);
  });

  test("keeps two closed Lens tabs even on the same page", () => {
    const lens: ClosedPaneTab = { kind: "lens", url: "http://localhost:3000" };
    expect(pushClosedTab(pushClosedTab([], lens), lens)).toHaveLength(2);
  });

  test("drops the oldest entries past the limit", () => {
    let stack = pushClosedTab([], task("t0"));
    for (let index = 1; index <= CLOSED_TAB_STACK_LIMIT + 4; index += 1) {
      stack = pushClosedTab(stack, task(`t${index}`));
    }
    expect(stack).toHaveLength(CLOSED_TAB_STACK_LIMIT);
    expect(stack[0]).toEqual(task("t5"));
    expect(stack.at(-1)).toEqual(task(`t${CLOSED_TAB_STACK_LIMIT + 4}`));
  });
});

describe("closed tab registry", () => {
  test("pops per workspace, newest first", async () => {
    const registry = new ClosedTabRegistry();
    registry.record("ws-1", task("a"));
    registry.record("ws-1", task("b"));
    registry.record("ws-2", task("c"));
    expect(await registry.take("ws-1", () => true)).toEqual(task("b"));
    expect(await registry.take("ws-1", () => true)).toEqual(task("a"));
    expect(await registry.take("ws-1", () => true)).toBeNull();
    expect(registry.peek("ws-2")).toEqual([task("c")]);
  });

  test("skips and forgets entries whose target is gone", async () => {
    const registry = new ClosedTabRegistry();
    registry.record("ws", task("kept"));
    registry.record("ws", file("deleted.ts"));
    registry.record("ws", task("archived"));
    const gone = new Set(["archived", "deleted.ts"]);
    const reopened = await registry.take("ws", async (entry) =>
      entry.kind === "task" ? !gone.has(entry.taskId) : entry.kind === "editor" ? !gone.has(entry.filePath) : true,
    );
    expect(reopened).toEqual(task("kept"));
    expect(registry.peek("ws")).toEqual([]);
  });

  test("keeps a tab closed while an async check runs", async () => {
    const registry = new ClosedTabRegistry();
    registry.record("ws", file("slow.ts"));
    const reopened = await registry.take("ws", async () => {
      registry.record("ws", task("closed-meanwhile"));
      return true;
    });
    expect(reopened).toEqual(file("slow.ts"));
    expect(registry.peek("ws")).toEqual([task("closed-meanwhile")]);
  });

  test("respects a custom bound and ignores an empty workspace id", () => {
    const registry = new ClosedTabRegistry(2);
    registry.record("", task("nowhere"));
    registry.record("ws", task("a"));
    registry.record("ws", task("b"));
    registry.record("ws", task("c"));
    expect(registry.peek("")).toEqual([]);
    expect(registry.peek("ws")).toEqual([task("b"), task("c")]);
  });
});
