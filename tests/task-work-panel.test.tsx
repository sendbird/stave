import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskWorkPanelHeader } from "../src/components/session/TaskWorkPanel";
import { RIGHT_RAIL_PANEL_IDS, RIGHT_RAIL_PANEL_TITLES } from "../src/lib/right-rail-panels";
import { DEFAULT_PLAYBOOK_PERMISSION_MODE } from "../src/lib/playbooks/schema";

test("a task panel names its task under a Task label", () => {
  const html = renderToStaticMarkup(createElement(TaskWorkPanelHeader, { title: "Fix the billing table" }));
  expect(html).toContain(">Task<");
  expect(html).toContain("Fix the billing table");
});

test("the team has its own right-rail panel", () => {
  expect(RIGHT_RAIL_PANEL_IDS).toContain("team");
  expect(RIGHT_RAIL_PANEL_TITLES.team).toBe("Team");
});

test("a playbook without a permission mode runs Auto", () => {
  expect(DEFAULT_PLAYBOOK_PERMISSION_MODE).toBe("auto");
});
