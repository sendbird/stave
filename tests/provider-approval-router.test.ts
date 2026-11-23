import { describe, expect, test } from "bun:test";

import { createProviderApprovalRouter } from "../electron/providers/provider-approval-router";

const unknown = (pendingRequestIds: string[]) => ({
  ok: false as const,
  reason: "unknown-request" as const,
  pendingRequestIds,
});

describe("provider approval router", () => {
  test("delivers primary and nested Worker approvals through one turn", async () => {
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
      await router.respond({ requestId: "worker:approval-1", approved: true }),
    ).toEqual({ ok: true });
    expect(await router.respond({ requestId: "primary-1", approved: true })).toEqual({
      ok: true,
    });
    expect(calls).toEqual([
      "worker:worker:approval-1",
      "primary:primary-1",
    ]);
  });

  test("returns a delivery failure from the request owner without probing other responders", async () => {
    const router = createProviderApprovalRouter();
    const failure = { ok: false, reason: "write-failed", pendingRequestIds: ["primary-1"] } as const;
    router.registerPrimary(async () => ({ ...failure, pendingRequestIds: [...failure.pendingRequestIds] }));
    router.registerNested(() => { throw new Error("Unexpected fallback"); });

    expect(await router.respond({ requestId: "primary-1", approved: true })).toEqual(failure);
  });

  test("removes a Worker responder when its nested session ends", async () => {
    const router = createProviderApprovalRouter();
    router.registerPrimary(() => unknown(["primary-1"]));
    const remove = router.registerNested(() => unknown(["worker:approval-1"]));
    remove();

    expect(
      await router.respond({ requestId: "worker:approval-1", approved: false }),
    ).toEqual({
      ok: false,
      reason: "unknown-request",
      pendingRequestIds: ["primary-1"],
    });
  });
});
