import { expect, test } from "bun:test";
import { fleetAnswerNotice } from "@/lib/fleet/answer-outcome";

test("an earlier answer delivered instead of this one is said in the panel, or as a toast once it closed", () => {
  expect(fleetAnswerNotice({ status: "delivered", earlierAnswer: true }, true)).toEqual({ kind: "earlier", via: "status" });
  // The request left the attention list, so the panel closed before the outcome came back.
  expect(fleetAnswerNotice({ status: "delivered", earlierAnswer: true }, false)).toEqual({ kind: "earlier", via: "toast" });
});

test("a plain delivery, a failure and a skip settle the open panel; a closed one stays quiet", () => {
  expect(fleetAnswerNotice({ status: "delivered" }, true)).toEqual({ kind: "delivered" });
  expect(fleetAnswerNotice({ status: "failed", message: "Refused." }, true)).toEqual({ kind: "failed", message: "Refused." });
  expect(fleetAnswerNotice({ status: "failed", message: "" }, true)).toEqual({ kind: "changed" });
  expect(fleetAnswerNotice({ status: "skipped" }, true)).toEqual({ kind: "changed" });
  for (const outcome of [{ status: "delivered" }, { status: "skipped" }, { status: "failed", message: "x" }] as const) {
    expect(fleetAnswerNotice(outcome, false)).toEqual({ kind: "none" });
  }
});
