import { describe, expect, test } from "bun:test";
import { createProviderTurnLifecycle } from "../electron/providers/provider-turn-lifecycle";

describe("provider turn terminal lifecycle", () => {
  test("delivers exactly one terminal event and drops every event after it", () => {
    const delivered: string[] = [];
    const lifecycle = createProviderTurnLifecycle({
      onEvent: (event) => delivered.push(event.type),
    });

    lifecycle.emit({ type: "text", text: "working" });
    lifecycle.emit({
      type: "approval",
      requestId: "approval-1",
      toolName: "Bash",
      description: "Run tests",
    });
    lifecycle.finish("completed");
    lifecycle.finish("runtime_failure");
    lifecycle.emit({ type: "text", text: "too late" });

    expect(delivered).toEqual(["text", "approval", "done"]);
    expect(
      lifecycle.events().filter((event) => event.type === "done"),
    ).toHaveLength(1);
    expect(lifecycle.snapshot()).toEqual({
      eventCount: 3,
      terminalCount: 1,
      droppedAfterTerminalCount: 2,
      pendingDecisionCount: 0,
    });
  });
});
