import { expect, test } from "bun:test";
import { stopFleetItem } from "../src/lib/fleet/stop-control";
test("owned work pauses through its owner before stopping its turn without cancelling its run", async () => {
  const calls: string[] = [];
  expect(await stopFleetItem({ routeOwnership: async () => { calls.push("pause"); return "applied"; }, stop: async (keep) => { calls.push(`turn:${keep}`); return true; } })).toBe("stopped");
  expect(calls).toEqual(["pause","turn:true"]);
});
for (const refusal of ["held","rejected","failed"] as const) test(`ownership ${refusal} never stops work directly`, async () => {
  let stopped = false;
  expect(await stopFleetItem({ routeOwnership: async () => refusal, stop: async () => { stopped=true; } })).toBe("managed");
  expect(stopped).toBe(false);
});
test("a failed stop remains skipped", async () => {
  expect(await stopFleetItem({routeOwnership:async()=>"direct", stop:async()=>false})).toBe("changed");
});
