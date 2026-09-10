import { describe, expect, test } from "bun:test";
import { buildCliSessionRuntimeOptions } from "@/lib/terminal/cli-session-runtime-options";

describe("buildCliSessionRuntimeOptions", () => {
  test("forces Claude CLI sessions into auto mode", () => {
    expect(
      buildCliSessionRuntimeOptions({
        providerId: "claude-code",
        claudeBinaryPath: " /tmp/claude ",
      }),
    ).toEqual({
      claudeBinaryPath: "/tmp/claude",
      claudePermissionMode: "auto",
    });
  });

  test("returns only the configured Codex binary override for Codex sessions", () => {
    expect(
      buildCliSessionRuntimeOptions({
        providerId: "codex",
        codexBinaryPath: " /tmp/codex ",
      }),
    ).toEqual({
      codexBinaryPath: "/tmp/codex",
    });
  });

  test("returns only the configured Cursor binary override for Cursor sessions", () => {
    expect(
      buildCliSessionRuntimeOptions({
        providerId: "cursor",
        cursorBinaryPath: " /tmp/agent ",
      }),
    ).toEqual({
      cursorBinaryPath: "/tmp/agent",
    });
  });

  test("returns only the configured Kiro binary override for Kiro sessions", () => {
    expect(
      buildCliSessionRuntimeOptions({
        providerId: "kiro",
        kiroBinaryPath: " /tmp/kiro-cli ",
      }),
    ).toEqual({
      kiroBinaryPath: "/tmp/kiro-cli",
    });
  });

  test("omits empty Cursor and Kiro CLI session overrides", () => {
    expect(
      buildCliSessionRuntimeOptions({
        providerId: "cursor",
        cursorBinaryPath: "   ",
      }),
    ).toBeUndefined();
    expect(
      buildCliSessionRuntimeOptions({
        providerId: "kiro",
        kiroBinaryPath: "",
      }),
    ).toBeUndefined();
  });

  test("omits empty Codex CLI session overrides", () => {
    expect(
      buildCliSessionRuntimeOptions({
        providerId: "codex",
        codexBinaryPath: "   ",
      }),
    ).toBeUndefined();
  });
});
