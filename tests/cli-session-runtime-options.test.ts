import { describe, expect, test } from "bun:test";
import { buildCliSessionRuntimeOptions } from "@/lib/terminal/cli-session-runtime-options";

describe("buildCliSessionRuntimeOptions", () => {
  test("forces Claude CLI sessions into auto mode", () => {
    expect(buildCliSessionRuntimeOptions({
      providerId: "claude-code",
      claudeBinaryPath: " /tmp/claude ",
    })).toEqual({
      claudeBinaryPath: "/tmp/claude",
      claudePermissionMode: "auto",
    });
  });

  test("returns only the configured Codex binary override for Codex sessions", () => {
    expect(buildCliSessionRuntimeOptions({
      providerId: "codex",
      codexBinaryPath: " /tmp/codex ",
    })).toEqual({
      codexBinaryPath: "/tmp/codex",
    });
  });

  test("omits empty Codex CLI session overrides", () => {
    expect(buildCliSessionRuntimeOptions({
      providerId: "codex",
      codexBinaryPath: "   ",
    })).toBeUndefined();
  });
});
