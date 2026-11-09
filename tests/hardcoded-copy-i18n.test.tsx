import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { describeStageMeta } from "@/components/agent-runs/StageCard";
import { Thinking } from "@/components/aui/components/Thinking";
import type { AgentRunStageRow } from "@/lib/agent-runs/agent-run-view";
import { describeProviderAccountIdentity } from "@/lib/providers/provider-account-identity";
import { workspaceCleanupBlocker, workspaceCleanupRecommendation } from "@/lib/workspace-cleanup";
import { describeTurnVerification } from "@/lib/workspace-scripts/verification";

afterEach(() => {
  applyAppLocale("en");
});

const runningStage = {
  index: 0,
  stage: { id: "build", kind: "ai", title: "Build", instruction: "Build it" },
  record: null,
  status: "running",
  attempts: 1,
  current: true,
  asksFirst: false,
  durationMs: null,
  evidence: [],
} as unknown as AgentRunStageRow;


describe("copy that used to be hardcoded English", () => {
  test("a running stage says now in the app language", () => {
    expect(describeStageMeta(runningStage)).toBe("now");
    applyAppLocale("ko");
    expect(describeStageMeta(runningStage)).toBe("진행 중");
  });


  test("the thinking phase defaults to the app language", () => {
    const render = () => renderToStaticMarkup(createElement(Thinking, { status: "thinking" }));
    expect(render()).toContain("Thinking");
    applyAppLocale("ko");
    expect(render()).toContain("추론 중");
    expect(render()).not.toContain(">Thinking<");
  });

  test("cleanup blockers and recommendations are translated", () => {
    const state = {
      repositoryPath: "/tmp/repo",
      workspaces: [{ id: "ws-1" }],
      workspacePathById: { "ws-1": "/tmp/repo/.stave/ws-1" },
      workspaceDefaultById: {},
      activeWorkspaceId: "ws-1",
      activeTurnIdsByTask: {},
      taskWorkspaceIdById: {},
      notifications: [],
    } as unknown as Parameters<typeof workspaceCleanupBlocker>[0];
    const now = Date.parse("2026-11-03T00:00:00.000Z");
    const recommendation = () =>
      workspaceCleanupRecommendation({ lastActive: "2026-10-01T00:00:00.000Z", prState: "MERGED", prCheckedAt: now, unpushed: 0, now });
    expect(workspaceCleanupBlocker(state, "/tmp/repo", "ws-1", "/tmp/repo/.stave/ws-1")).toBe("Current workspace");
    expect(recommendation()).toBe("PR merged · no unpushed commits · inactive for at least 14 days");
    applyAppLocale("ko");
    expect(workspaceCleanupBlocker(state, "/tmp/repo", "ws-1", "/tmp/repo/.stave/ws-1")).toBe("현재 워크스페이스");
    expect(recommendation()).toBe("PR 병합됨 · 푸시하지 않은 커밋 없음 · 14일 이상 활동 없음");
  });

  test("a failed or warned verification is one translated sentence", () => {
    const result = (status: "fail" | "warn") => ({
      workspaceId: "ws-1",
      status,
      totalEntries: 2,
      executedEntries: 2,
      failures: [{ scriptId: "lint", message: "", blocking: status === "fail" }],
      completedAt: 0,
    });
    expect(describeTurnVerification(result("fail"))).toBe("Verification failed: lint");
    expect(describeTurnVerification(result("warn"))).toBe("Verification reported warnings: lint");
    applyAppLocale("ko");
    expect(describeTurnVerification(result("fail"))).toBe("검증 실패: lint");
    expect(describeTurnVerification(result("warn"))).toBe("검증 경고: lint");
  });

  test("a signed-in provider account reads in the app language", () => {
    const identity = { state: "signed-in", email: "dev@example.com" } as unknown as Parameters<typeof describeProviderAccountIdentity>[0];
    expect(describeProviderAccountIdentity(identity, "Claude").text).toBe("Signed in as dev@example.com");
    applyAppLocale("ko");
    expect(describeProviderAccountIdentity(identity, "Claude").text).toBe("dev@example.com(으)로 로그인됨");
  });
});
