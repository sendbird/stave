import { describe, expect, test } from "bun:test";
import {
  resolveCodexAppServerReasoningEffort,
  resolveEffectiveCodexApprovalPolicy,
  resolveEffectiveCodexFileAccessMode,
} from "@/lib/providers/codex-runtime-options";

describe("resolveEffectiveCodexFileAccessMode", () => {
  test("preserves the configured file access", () => {
    expect(resolveEffectiveCodexFileAccessMode({
      fileAccessMode: "workspace-write",
    })).toBe("workspace-write");
    expect(resolveEffectiveCodexFileAccessMode({
      fileAccessMode: "danger-full-access",
    })).toBe("danger-full-access");
  });

  test("falls back to workspace-write when file access is missing", () => {
    expect(resolveEffectiveCodexFileAccessMode({})).toBe("workspace-write");
  });
});

describe("resolveEffectiveCodexApprovalPolicy", () => {
  test("preserves the configured approval policy", () => {
    expect(resolveEffectiveCodexApprovalPolicy({
      approvalPolicy: "untrusted",
    })).toBe("untrusted");
    expect(resolveEffectiveCodexApprovalPolicy({
      approvalPolicy: "on-request",
    })).toBe("on-request");
  });

  test("falls back to the App Server-aligned default when approval is missing", () => {
    expect(resolveEffectiveCodexApprovalPolicy({
      approvalPolicy: undefined,
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
