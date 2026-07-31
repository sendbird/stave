import { describe, expect, test } from "bun:test";
import {
  createEmptyProviderRuntimeCapabilities,
  extractRuntimeVersion,
  resolveProviderRuntimeCapabilities,
} from "../src/lib/providers/runtime-capabilities";

describe("provider runtime capabilities", () => {
  test("fails closed when a runtime is unavailable", () => {
    expect(
      resolveProviderRuntimeCapabilities({
        providerId: "codex",
        versionText: "codex-cli 0.145.0",
        available: false,
      }),
    ).toEqual(createEmptyProviderRuntimeCapabilities());
  });

  test("gates Claude history, hook, and credential features by runtime version", () => {
    const legacy = resolveProviderRuntimeCapabilities({
      providerId: "claude-code",
      versionText: "2.1.178",
    });
    const mutationSurface = resolveProviderRuntimeCapabilities({
      providerId: "claude-code",
      versionText: "2.1.186",
    });
    const current = resolveProviderRuntimeCapabilities({
      providerId: "claude-code",
      versionText: "2.1.197",
    });

    expect(legacy.history.forkBoundary).toBeNull();
    expect(legacy.hooks.lifecycleEvents).toBe(false);
    expect(mutationSurface.history).toEqual({
      forkBoundary: "message",
      rewind: { files: true, conversation: false },
    });
    expect(mutationSurface.hooks.lifecycleEvents).toBe(true);
    expect(mutationSurface.sandbox.credentialGuards).toBe(false);
    expect(current.sandbox.credentialGuards).toBe(true);
  });

  test("gates Codex turn forks, hooks, writes approvals, and indexed search", () => {
    const legacy = resolveProviderRuntimeCapabilities({
      providerId: "codex",
      versionText: "codex-cli 0.116.0",
    });
    const forkCapable = resolveProviderRuntimeCapabilities({
      providerId: "codex",
      versionText: "codex-cli 0.117.0",
    });
    const hookCapable = resolveProviderRuntimeCapabilities({
      providerId: "codex",
      versionText: "codex-cli 0.124.0",
    });
    const current = resolveProviderRuntimeCapabilities({
      providerId: "codex",
      versionText: "codex-cli 0.145.0",
    });

    expect(legacy.history.forkBoundary).toBe("thread");
    expect(forkCapable.history.forkBoundary).toBe("turn");
    expect(hookCapable.hooks).toEqual({
      lifecycleEvents: true,
      inventory: true,
      trustManagement: false,
    });
    expect(current.approval.appToolModes).toEqual([
      "auto",
      "prompt",
      "writes",
      "approve",
    ]);
    expect(current.webSearchModes).toContain("indexed");
  });

  test("extracts a semantic version from runtime output", () => {
    expect(extractRuntimeVersion("codex-cli 0.145.0 (stable)")).toBe("0.145.0");
    expect(extractRuntimeVersion("unknown")).toBeUndefined();
  });
});
