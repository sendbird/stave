import { describe, expect, test } from "bun:test";
import { shouldPreventPaneDropAboveTaskBar } from "../src/components/panes/pane-drop-guard";

describe("pane drop guard", () => {
  test("blocks root-level drops above the fixed task bar", () => {
    expect(
      shouldPreventPaneDropAboveTaskBar({
        kind: "edge",
        position: "top",
      }),
    ).toBe(true);
  });

  test("blocks top splits targeting a task group", () => {
    expect(
      shouldPreventPaneDropAboveTaskBar({
        kind: "content",
        position: "top",
        group: {
          panels: [{ id: "task:task-1" }, { id: "editor:file-1" }],
        },
      }),
    ).toBe(true);
  });

  test("preserves tab reordering and side or bottom splits", () => {
    const taskGroup = {
      panels: [{ id: "task:task-1" }],
    };

    expect(
      shouldPreventPaneDropAboveTaskBar({
        kind: "tab",
        position: "center",
        group: taskGroup,
      }),
    ).toBe(false);
    expect(
      shouldPreventPaneDropAboveTaskBar({
        kind: "content",
        position: "right",
        group: taskGroup,
      }),
    ).toBe(false);
    expect(
      shouldPreventPaneDropAboveTaskBar({
        kind: "content",
        position: "bottom",
        group: taskGroup,
      }),
    ).toBe(false);
  });

  test("allows top splits in groups without task tabs", () => {
    expect(
      shouldPreventPaneDropAboveTaskBar({
        kind: "content",
        position: "top",
        group: {
          panels: [{ id: "terminal:terminal-1" }],
        },
      }),
    ).toBe(false);
  });
});
