import { expect, test } from "bun:test";
import { fleetAnswerNotice } from "@/lib/fleet/answer-outcome";

test("an earlier answer delivered instead of this one is said in the panel, or as a toast once it closed", () => {
  expect(fleetAnswerNotice({ status: "delivered", earlierAnswer: true }, true)).toEqual({ kind: "earlier", via: "status" });
  // The request left the attention list and the panel closed, or the reused
  // panel moved on to another task's request, before the outcome came back.
  expect(fleetAnswerNotice({ status: "delivered", earlierAnswer: true }, false)).toEqual({ kind: "earlier", via: "toast" });
});

test("a plain delivery, a failure and a skip settle the panel showing the request; otherwise it stays untouched", () => {
  expect(fleetAnswerNotice({ status: "delivered" }, true)).toEqual({ kind: "delivered" });
  expect(fleetAnswerNotice({ status: "failed", message: "Refused." }, true)).toEqual({ kind: "failed", message: "Refused." });
  expect(fleetAnswerNotice({ status: "failed", message: "" }, true)).toEqual({ kind: "changed" });
  expect(fleetAnswerNotice({ status: "skipped" }, true)).toEqual({ kind: "changed" });
  for (const outcome of [{ status: "delivered" }, { status: "skipped" }, { status: "failed", message: "x" }] as const) {
    expect(fleetAnswerNotice(outcome, false)).toEqual({ kind: "none" });
  }
});
