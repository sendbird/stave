import { describe, expect, test } from "bun:test";
import { shouldAutoCreateDockTerminalTab } from "../src/components/layout/terminal-dock.utils";

describe("shouldAutoCreateDockTerminalTab", () => {
  test("does not auto-create on the initial render while restoring dock state", () => {
    expect(shouldAutoCreateDockTerminalTab({
      isTerminalDocked: true,
      wasTerminalDocked: null,
      terminalTabCount: 0,
      workspacePath: "/tmp/stave",
    })).toBe(false);
  });

  test("creates an initial terminal tab only when the dock was just opened", () => {
    expect(shouldAutoCreateDockTerminalTab({
      isTerminalDocked: true,
      wasTerminalDocked: false,
      terminalTabCount: 0,
      workspacePath: "/tmp/stave",
    })).toBe(true);
  });

  test("does not auto-create during workspace switch when the dock was already open", () => {
    expect(shouldAutoCreateDockTerminalTab({
      isTerminalDocked: true,
      wasTerminalDocked: true,
      terminalTabCount: 0,
      workspacePath: "/tmp/stave",
    })).toBe(false);
  });

  test("does not auto-create when tabs already exist or the workspace path is missing", () => {
    expect(shouldAutoCreateDockTerminalTab({
      isTerminalDocked: true,
      wasTerminalDocked: false,
      terminalTabCount: 1,
      workspacePath: "/tmp/stave",
    })).toBe(false);
    expect(shouldAutoCreateDockTerminalTab({
      isTerminalDocked: true,
      wasTerminalDocked: false,
      terminalTabCount: 0,
      workspacePath: "   ",
    })).toBe(false);
  });
});
