import { describe, expect, test } from "bun:test";
import type { DockviewApi, IDockviewPanel } from "dockview-react";
import { splitPanelInDirection } from "@/components/panes/pane-split";

function createHarness(panelCount: number) {
  const group = { id: "new-group" };
  const calls: string[] = [];
  const panel = {
    id: "panel-1",
    group: { panels: Array.from({ length: panelCount }) },
    api: {
      moveTo: ({ group: target }: { group: unknown }) => {
        expect(target).toBe(group);
        calls.push("move");
      },
    },
  } as unknown as IDockviewPanel;
  const api = {
    addGroup: (options: {
      referencePanel: IDockviewPanel;
      direction: "right" | "below";
    }) => {
      expect(options.referencePanel).toBe(panel);
      calls.push(`add:${options.direction}`);
      return group;
    },
  } as unknown as DockviewApi;

  return { api, calls, panel };
}

describe("pane splitting", () => {
  test("keeps a new adjacent group when the source has one panel", () => {
    const { api, calls, panel } = createHarness(1);

    splitPanelInDirection(api, panel, "right");

    expect(calls).toEqual(["add:right"]);
  });

  test("moves the selected panel when the source group has siblings", () => {
    const { api, calls, panel } = createHarness(2);

    splitPanelInDirection(api, panel, "below");

    expect(calls).toEqual(["add:below", "move"]);
  });
});
