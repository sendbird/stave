import { expect, test } from "bun:test";
import { groupTarsTrayItems } from "../src/lib/tars/tray-projects";

test("project identity uses paths, preserves row order and never loses unknown ownership", () => {
  const items = [{ id: 1, path: "/one/app" }, { id: 2, path: undefined }, { id: 3, path: "/two/app" }, { id: 4, path: "/one/app" }];
  const groups = groupTarsTrayItems(items, (item) => item.path, [{ repositoryPath: "/one/app", repositoryName: "Known project" }]);
  expect(groups.map(({ key, label, items }) => [key, label, items.map((item) => item.id)])).toEqual([
    ["/one/app", "Known project", [1, 4]], ["unknown", null, [2]], ["/two/app", "app", [3]],
  ]);
  expect(groups.flatMap((group) => group.items).length).toBe(items.length);
  expect(groupTarsTrayItems(items.filter((item) => item.id === 4), (item) => item.path, [])[0]!.items).toEqual([items[3]!]);
  expect(groupTarsTrayItems([], () => null, [])).toEqual([]);
});
