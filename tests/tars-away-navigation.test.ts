import { expect, test } from "bun:test";
import { tarsAwayDockId } from "../src/lib/tars/away-summary";
import { projectTarsDecisions } from "../src/lib/tars/decisions";
import { buildTarsAwayFixtures } from "../src/dev/tars-preview/tars-away-fixtures";

test("an away-summary decision link selects its waiting dock form; settled and missing decisions use the transcript", () => {
  const start = new Date("2026-11-05T09:00:00.000Z");
  const view = buildTarsAwayFixtures(start, false).at(start.getTime() + 45 * 60_000);
  const decisions = projectTarsDecisions({ ...view, records: [], answers: [] });
  const id = "ask:away-message-ask:0";
  const link = { kind: "decision", decisionId: id } as const;
  expect(decisions.find((decision) => decision.id === id)?.state).toBe("waiting");
  expect(tarsAwayDockId(link, decisions)).toBe(id);
  for (const state of ["answered", "retired", "dismissed", "withdrawn", "invalid"] as const)
    expect(tarsAwayDockId(link, decisions.map((decision) => ({ ...decision, state })))).toBeNull();
  expect(tarsAwayDockId(link, [])).toBeNull();
});

test("a publication link selects the matching dock item even when another form is first", () => {
  const link = { kind: "publishCard", requestId: "second" } as const;
  const proposals = [{ requestId: "first", state: "waiting" }, { requestId: "second", state: "waiting" }] as const;
  expect(tarsAwayDockId(link, [], proposals)).toBe("second");
  expect(tarsAwayDockId(link, [], [{ requestId: "second", state: "settled" }])).toBeNull();
  expect(tarsAwayDockId(link, [])).toBeNull();
  expect(tarsAwayDockId({ kind: "publishRecord", requestId: "second" }, [], proposals)).toBeNull();
  expect(tarsAwayDockId({ kind: "side", target: { kind: "report", responsibilityId: "work" } }, [], proposals)).toBeNull();
});
