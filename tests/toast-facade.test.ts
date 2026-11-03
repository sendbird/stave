import { afterEach, describe, expect, test } from "bun:test";

import {
  notificationToastManager,
  toast,
  workspaceToastManager,
} from "@/lib/notifications/toast";

type ManagerEvent = { action: string; options: Record<string, unknown> & { id?: string; updates?: Record<string, unknown> } };
type Subscribable = { " subscribe": (listener: (event: ManagerEvent) => void) => () => void };

function record(manager: unknown) {
  const events: ManagerEvent[] = [];
  const stop = (manager as Subscribable)[" subscribe"]((event) => events.push(event));
  return { events, stop };
}

const stops: Array<() => void> = [];
afterEach(() => {
  while (stops.length) stops.pop()!();
});

describe("toast facade", () => {
  test("loading is pinned until it settles; update rewrites the same toast and restarts the timer", () => {
    const notifications = record(notificationToastManager);
    stops.push(notifications.stop);
    const id = toast.loading("Creating workspace…", { description: "feat/meter" });
    const [added] = notifications.events;
    expect(added?.action).toBe("add");
    expect(added?.options).toMatchObject({ id, type: "loading", timeout: 0, title: "Creating workspace…" });
    toast.update(id, { title: "Workspace ready", tone: "success" });
    const updated = notifications.events.at(-1);
    expect(updated?.action).toBe("update");
    expect(updated?.options.id).toBe(id);
    expect(updated?.options.updates).toMatchObject({ title: "Workspace ready", type: "success", timeout: 5000 });
    // Only one card: the result replaced the loading toast instead of stacking.
    expect(notifications.events.filter((event) => event.action === "add")).toHaveLength(1);
  });

  test("update reaches the host the toast was shown on", () => {
    const notifications = record(notificationToastManager);
    const workspace = record(workspaceToastManager);
    stops.push(notifications.stop, workspace.stop);
    const id = toast.loading("Exporting", { position: "bottom-right" });
    toast.update(id, { tone: "error", title: "Export failed" });
    expect(workspace.events.map((event) => event.action)).toEqual(["add", "update"]);
    expect(workspace.events[1]?.options.updates).toMatchObject({ type: "danger", priority: "high" });
    expect(notifications.events).toHaveLength(0);
  });

  test("an explicit duration wins over the settled default", () => {
    const notifications = record(notificationToastManager);
    stops.push(notifications.stop);
    const id = toast.loading("Working");
    toast.update(id, { tone: "info", title: "Done", duration: 1200 });
    expect(notifications.events.at(-1)?.options.updates).toMatchObject({ timeout: 1200 });
  });

  test("promise settles one toast to success with the value, and to error while re-throwing", async () => {
    const notifications = record(notificationToastManager);
    stops.push(notifications.stop);
    const value = await toast.promise(Promise.resolve(412), {
      loading: "Importing",
      success: (rows) => `Imported ${rows} rows`,
      error: "Import failed",
    });
    expect(value).toBe(412);
    const [added, settled] = notifications.events;
    expect(added?.options).toMatchObject({ type: "loading", timeout: 0 });
    expect(settled?.options.id).toBe(added?.options.id);
    expect(settled?.options.updates).toMatchObject({ title: "Imported 412 rows", type: "success" });

    const failure = new Error("disk full");
    await expect(
      toast.promise(Promise.reject(failure), {
        loading: "Importing",
        success: "Imported",
        error: (cause) => `Import failed: ${(cause as Error).message}`,
      }),
    ).rejects.toBe(failure);
    expect(notifications.events.at(-1)?.options.updates).toMatchObject({ title: "Import failed: disk full", type: "danger" });
  });

  test("a secondary action rides on the toast's data and closes it after running", () => {
    const notifications = record(notificationToastManager);
    stops.push(notifications.stop);
    let viewed = 0;
    let undone = 0;
    const id = toast.success("Prompt enhanced", {
      secondaryAction: { label: "View changes", onClick: () => { viewed += 1; } },
      action: { label: "Undo", onClick: () => { undone += 1; } },
    });
    const added = notifications.events.find((event) => event.action === "add");
    const data = added?.options.data as { secondaryAction: { label: string; onClick: (event: unknown) => void } };
    expect(data.secondaryAction.label).toBe("View changes");
    data.secondaryAction.onClick({ defaultPrevented: false });
    expect(viewed).toBe(1);
    expect(undone).toBe(0);
    expect(notifications.events.at(-1)).toMatchObject({ action: "close", options: { id } });
  });
});
