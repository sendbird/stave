import { expect, test } from "bun:test";
import { planFleetControl } from "../src/lib/fleet/control-plan";
import type { FleetSelectionTarget } from "../src/store/fleet-selection-store";
const target = (key: string): FleetSelectionTarget => ({key,taskId:key,workspaceId:"w",repositoryPath:"/repo",task:{id:key,title:key} as FleetSelectionTarget["task"]});
test("S1 stop runs only on applicable targets and its count matches confirmation", () => {
  const plan = planFleetControl("stop", [target("idle"), target("running")], {running:new Set(["running"]),waiting:new Set()});
  expect(plan.applicable.map(item => item.taskId)).toEqual(["running"]);
  expect(plan.skipped).toEqual([{item:target("idle"),reason:"no-running-work"}]);
});
test("S2 archive skips active turns, pending requests, live children and runs with reasons", () => {
  const plan = planFleetControl("archive", ["idle","turn","approval","question","child","run"].map(target), {running:new Set(["turn","child","run"]),waiting:new Set(["approval","question"])});
  expect(plan.applicable.map(item => item.taskId)).toEqual(["idle"]);
  expect(plan.skipped.map(item => item.reason)).toEqual(["live-work","waiting","waiting","live-work","live-work"]);
});
test("permanent delete requires archive first even when a run ended", () => {
  const archived = target("archived"); archived.task = {...archived.task!,archivedAt:"2026-11-16T00:00:00Z"};
  expect(planFleetControl("delete",[target("ended"),archived],{running:new Set(),waiting:new Set()}).applicable).toEqual([archived]);
});
