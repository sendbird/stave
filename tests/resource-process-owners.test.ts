import { expect, test } from "bun:test";
import { retainResourceProcessOwner, getResourceProcessOwners, forgetResourceProcess } from "../electron/shared/resource-process-owners";

test("concurrent turns retain ownership until exit without duplicating a task", () => {
  const first = retainResourceProcessOwner(123, { workspaceId: "w1", taskId: "t1" });
  const second = retainResourceProcessOwner(123, { workspaceId: "w1", taskId: "t1" });
  const other = retainResourceProcessOwner(123, { workspaceId: "w2", taskId: "t2" });
  first(); first();
  expect(getResourceProcessOwners().get(123)).toHaveLength(2);
  expect(getResourceProcessOwners().get(123)?.[0]?.active).toBe(true);
  second(); other();
  expect(getResourceProcessOwners().get(123)?.every((owner) => !owner.active)).toBe(true);
  forgetResourceProcess(123);
  expect(getResourceProcessOwners().has(123)).toBe(false);
  retainResourceProcessOwner(123, { workspaceId: "new" });
  expect(getResourceProcessOwners().get(123)).toEqual([{ workspaceId: "new", taskId: undefined, active: true }]);
  forgetResourceProcess(123);
});

test("a long-lived process keeps its active owners and only the 20 most recently released ones", () => {
  const running = retainResourceProcessOwner(456, { workspaceId: "w1", taskId: "running" });
  for (let index = 0; index < 30; index += 1) {
    retainResourceProcessOwner(456, { workspaceId: "w1", taskId: `t${index}` })();
  }
  const owners = getResourceProcessOwners().get(456) ?? [];
  expect(owners).toHaveLength(21);
  expect(owners.filter((owner) => owner.active).map((owner) => owner.taskId)).toEqual(["running"]);
  expect(owners.filter((owner) => !owner.active).map((owner) => owner.taskId))
    .toEqual(Array.from({ length: 20 }, (_, index) => `t${index + 10}`));

  // A released owner that comes back is active again and counts as fresh when released.
  retainResourceProcessOwner(456, { workspaceId: "w1", taskId: "t10" })();
  retainResourceProcessOwner(456, { workspaceId: "w1", taskId: "t30" })();
  const inactive = (getResourceProcessOwners().get(456) ?? []).filter((owner) => !owner.active).map((owner) => owner.taskId);
  expect(inactive).toHaveLength(20);
  expect(inactive).toContain("t10");
  expect(inactive).not.toContain("t11");
  running();
  forgetResourceProcess(456);
});
