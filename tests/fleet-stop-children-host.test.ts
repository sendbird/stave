import { expect, test } from "bun:test";
import { stopFleetChildren } from "../electron/main/ipc/fleet-stop-children";

for (const ownership of ["managed", "owner"] as const) test(`host refuses child cascade for ${ownership} parent before listing children`, async () => {
  let listed = false;
  const store = {
    loadWorkspaceShell: () => ({ tasks: [{ id: "parent", controlMode: ownership === "managed" ? "managed" : "interactive" }] }),
    tars: { snapshot: () => ({ responsibilities: ownership === "owner" ? [{ taskId: "parent", executionWorkspaceId: "workspace", state: "running" }] : [] }) },
    getRunAggregate: () => null,
  } as unknown as Parameters<typeof stopFleetChildren>[0];
  const coordinator = { list: async () => { listed = true; return []; } } as unknown as Parameters<typeof stopFleetChildren>[1];
  const result = await stopFleetChildren(store, coordinator, { workspaceId: "workspace", taskId: "parent" });
  expect(result.ok).toBe(false);
  expect(result.reason).toBe(ownership === "managed" ? "managed" : "owner-managed");
  expect(listed).toBe(false);
});
