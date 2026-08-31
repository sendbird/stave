import { describe, expect, test } from "bun:test";

import { createProviderApprovalRouter } from "../electron/providers/provider-approval-router";

const unknown = (pendingRequestIds: string[]) => ({
  ok: false as const,
  reason: "unknown-request" as const,
  pendingRequestIds,
});

describe("provider approval router", () => {
  test("delivers primary and nested Worker approvals through one turn", () => {
    const router = createProviderApprovalRouter();
    const calls: string[] = [];
    router.registerPrimary(({ requestId }) => {
      calls.push(`primary:${requestId}`);
      return requestId === "primary-1" ? { ok: true } : unknown(["primary-1"]);
    });
    router.registerNested(({ requestId }) => {
      calls.push(`worker:${requestId}`);
      return requestId === "worker:approval-1"
        ? { ok: true }
        : unknown(["worker:approval-1"]);
    });

    expect(
      router.respond({ requestId: "worker:approval-1", approved: true }),
    ).toEqual({ ok: true });
    expect(router.respond({ requestId: "primary-1", approved: true })).toEqual({
      ok: true,
    });
    expect(calls).toEqual([
      "worker:worker:approval-1",
      "primary:primary-1",
    ]);
  });

  test("removes a Worker responder when its nested session ends", () => {
    const router = createProviderApprovalRouter();
    router.registerPrimary(() => unknown(["primary-1"]));
    const remove = router.registerNested(() => unknown(["worker:approval-1"]));
    remove();

    expect(
      router.respond({ requestId: "worker:approval-1", approved: false }),
    ).toEqual({
      ok: false,
      reason: "unknown-request",
      pendingRequestIds: ["primary-1"],
    });
  });
});
