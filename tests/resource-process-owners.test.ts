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
