import { describe, expect, test } from "bun:test";
import {
  resolveCodexAppServerReasoningEffort,
  resolveEffectiveCodexApprovalPolicy,
  resolveEffectiveCodexFileAccessMode,
} from "@/lib/providers/codex-runtime-options";

describe("resolveEffectiveCodexFileAccessMode", () => {
  test("forces read-only file access while Codex plan mode is enabled", () => {
    expect(resolveEffectiveCodexFileAccessMode({
      fileAccessMode: "danger-full-access",
      planMode: true,
    })).toBe("read-only");
  });

  test("preserves the configured file access when Codex plan mode is disabled", () => {
    expect(resolveEffectiveCodexFileAccessMode({
      fileAccessMode: "workspace-write",
      planMode: false,
    })).toBe("workspace-write");
  });
});

describe("resolveEffectiveCodexApprovalPolicy", () => {
  test("forces never while Codex plan mode is enabled", () => {
    expect(resolveEffectiveCodexApprovalPolicy({
      approvalPolicy: "on-request",
      planMode: true,
    })).toBe("never");
  });

  test("preserves the configured approval policy when Codex plan mode is disabled", () => {
    expect(resolveEffectiveCodexApprovalPolicy({
      approvalPolicy: "untrusted",
      planMode: false,
    })).toBe("untrusted");
  });

  test("falls back to the App Server-aligned default when approval is missing", () => {
    expect(resolveEffectiveCodexApprovalPolicy({
      approvalPolicy: undefined,
      planMode: false,
    })).toBe("untrusted");
  });
});

describe("resolveCodexAppServerReasoningEffort", () => {
  test("passes through the GPT-5.6 max and ultra effort tiers", () => {
    expect(
      resolveCodexAppServerReasoningEffort({ reasoningEffort: "max" }),
    ).toBe("max");
    expect(
      resolveCodexAppServerReasoningEffort({ reasoningEffort: "ultra" }),
    ).toBe("ultra");
  });

  test("normalizes legacy minimal to low", () => {
    expect(
      resolveCodexAppServerReasoningEffort({ reasoningEffort: "minimal" }),
    ).toBe("low");
  });

  test("returns undefined for unknown or missing efforts", () => {
    expect(
      resolveCodexAppServerReasoningEffort({ reasoningEffort: undefined }),
    ).toBeUndefined();
  });
});
