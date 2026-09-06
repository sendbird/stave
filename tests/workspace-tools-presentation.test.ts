import { describe, expect, test } from "bun:test";
import { Blocks, TerminalSquare } from "lucide-react";
import { COMMAND_PALETTE_GROUP_LABELS } from "@/components/layout/command-palette-registry";
import { settingsSections } from "@/components/layout/settings-dialog.schema";
import { APP_SHORTCUT_DEFINITIONS } from "@/lib/app-shortcuts";
import {
  RIGHT_RAIL_PANEL_ICONS,
  RIGHT_RAIL_PANEL_TITLES,
} from "@/lib/right-rail-panels";
import { WORKSPACE_TOOLS_LABEL } from "@/lib/workspace-scripts/constants";
import {
  DEFAULT_WORKSPACE_TOOLS_VIEW,
  WORKSPACE_TOOLS_PRESENTATION,
  WORKSPACE_TOOLS_VIEWS,
  workspaceToolsRunningLabel,
} from "@/lib/workspace-tools-presentation";

describe("Workspace Tools presentation", () => {
  test("uses one umbrella name without collapsing its distinct tool types", () => {
    expect(RIGHT_RAIL_PANEL_TITLES.scripts).toBe(WORKSPACE_TOOLS_LABEL);
    expect(COMMAND_PALETTE_GROUP_LABELS.scripts).toBe(WORKSPACE_TOOLS_LABEL);
    expect(settingsSections.find(({ id }) => id === "scripts")?.label).toBe(
      WORKSPACE_TOOLS_LABEL,
    );
    expect(
      settingsSections.find(({ id }) => id === "scripts")?.description,
    ).toMatch(/^Long-running processes/);
    expect(
      APP_SHORTCUT_DEFINITIONS.find(
        ({ commandId }) => commandId === "view.show-scripts",
      )?.title,
    ).toBe(`Open ${WORKSPACE_TOOLS_LABEL}`);
  });

  test("uses a toolset icon that stays distinct from Terminal", () => {
    expect(WORKSPACE_TOOLS_PRESENTATION.icon).toBe(Blocks);
    expect(RIGHT_RAIL_PANEL_ICONS.scripts).toBe(Blocks);
    expect(settingsSections.find(({ id }) => id === "scripts")?.icon).toBe(
      Blocks,
    );
    expect(WORKSPACE_TOOLS_PRESENTATION.icon).not.toBe(TerminalSquare);
  });

  test("names views after executable concepts rather than a catalog", () => {
    expect(WORKSPACE_TOOLS_VIEWS.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "processes", label: "Processes" },
      { id: "commands", label: "Commands" },
      { id: "triggers", label: "Triggers" },
      { id: "runs", label: "Runs" },
    ]);
    expect(DEFAULT_WORKSPACE_TOOLS_VIEW).toBe("processes");
    expect(
      WORKSPACE_TOOLS_VIEWS.some(({ label }) =>
        label.toLowerCase().includes("catalog"),
      ),
    ).toBe(false);
  });

  test("names a live process count on the rail without collapsing the umbrella label", () => {
    expect(workspaceToolsRunningLabel(0)).toBe(WORKSPACE_TOOLS_LABEL);
    expect(workspaceToolsRunningLabel(1)).toBe(
      `${WORKSPACE_TOOLS_LABEL}, 1 process running`,
    );
    expect(workspaceToolsRunningLabel(3)).toBe(
      `${WORKSPACE_TOOLS_LABEL}, 3 processes running`,
    );
  });
});
