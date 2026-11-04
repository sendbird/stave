import { expect, test } from "bun:test";
import { tokenLiterals, tokenRatchetFailures } from "../scripts/stylex-token-literals.mjs";

test("token inventory distinguishes layout data from control, type and ink debt", () => {
  expect(tokenLiterals(`const styles = { control: { height: 32, lineHeight: "16px", borderRadius: 4, letterSpacing: "0.1em" }, chart: { height: 200 }, safe: { height: vars["--ads-control-height-sm"], lineHeight: 1, borderRadius: "50%" } };`)).toEqual({ "control-metric": 1, "line-height": 1, radius: 1, tracking: 1 });
});
test("ratchet rejects new debt, requires retired allowance removal, and accepts unchanged debt", () => {
  expect(tokenRatchetFailures({ a: { radius: 1 } }, {})).toHaveLength(1);
  expect(tokenRatchetFailures({}, { a: { radius: 1 } })).toHaveLength(1);
  expect(tokenRatchetFailures({ a: { radius: 1 } }, { a: { radius: 1 } })).toEqual([]);
});
