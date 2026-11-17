import { expect, test } from "bun:test";
import { isTerminalSessionBusy } from "../electron/host-service/terminal-session-busy";

test("an idle interactive shell does not block a file restore", () => {
  expect(isTerminalSessionBusy({ command: "/bin/zsh", readForeground: () => "zsh" })).toBe(false);
  expect(isTerminalSessionBusy({ command: "/usr/local/bin/bash", readForeground: () => "-bash" })).toBe(false);
});

test("a running command, a CLI session or an unknown foreground process blocks a file restore", () => {
  expect(isTerminalSessionBusy({ command: "/bin/zsh", readForeground: () => "node" })).toBe(true);
  expect(isTerminalSessionBusy({ command: "/opt/tools/agent-cli", readForeground: () => "agent-cli" })).toBe(true);
  expect(isTerminalSessionBusy({ command: "/bin/zsh", readForeground: () => { throw new Error("unsupported"); } })).toBe(true);
  expect(isTerminalSessionBusy({ command: "/bin/zsh", readForeground: () => "" })).toBe(true);
});
