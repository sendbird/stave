import { expect, test } from "bun:test";
import { createWorkPowerSaveController, type WorkPowerSnapshot } from "../electron/main/work-power-save";

const snapshot = (patch: Partial<WorkPowerSnapshot> = {}): WorkPowerSnapshot => ({ runs: [], responsibilities: [], reasoning: false, ...patch });

test("holds one app-suspension blocker across overlapping agent and Tars work, releases on idle and shutdown", () => {
  const starts: string[] = [], stops: number[] = [];
  const controller = createWorkPowerSaveController({ start: (type) => { starts.push(type); return starts.length; }, stop: (id) => { stops.push(id); } });
  controller.update(snapshot());
  expect(starts).toEqual([]);
  controller.update(snapshot({ runs: [{ state: "running" }, { state: "running" }] }));
  controller.update(snapshot({ runs: [{ state: "running" }], responsibilities: [{ state: "preparing" }] }));
  controller.update(snapshot({ responsibilities: [{ state: "running" }] }));
  expect(starts).toEqual(["prevent-app-suspension"]);
  expect(stops).toEqual([]);
  controller.update(snapshot({ runs: [{ state: "paused" }], responsibilities: [{ state: "waiting" }, { state: "paused" }, { state: "resultReady" }] }));
  expect(stops).toEqual([1]);
  controller.update(snapshot({ reasoning: true }));
  expect(starts).toHaveLength(2);
  controller.dispose();
  controller.dispose();
  expect(stops).toEqual([1, 2]);
});

test("reconciles startup and reconnect from durable state, drops stale activity after disconnect and unsubscribes on shutdown", async () => {
  const { trackWorkPowerSave } = await import("../electron/main/work-power-save");
  let current = snapshot({ runs: [{ state: "running" }] });
  const calls: string[] = [];
  let events!: Parameters<Parameters<typeof trackWorkPowerSave>[0]["subscribe"]>[0];
  const stop = trackWorkPowerSave({
    blocker: { start: (type) => { calls.push(type); return 42; }, stop: (id) => { calls.push(`stop:${id}`); } },
    read: () => current,
    subscribe: (handlers) => { events = handlers; return [() => { calls.push("unsubscribe"); }]; },
  });
  expect(calls).toEqual(["prevent-app-suspension"]);
  events.disconnected();
  events.changed(); // The database still says running after the host died.
  expect(calls).toEqual(["prevent-app-suspension", "stop:42"]);
  current = snapshot();
  events.ready();
  expect(calls).toHaveLength(2);
  current = snapshot({ responsibilities: [{ state: "preparing" }] });
  events.changed();
  stop();
  events.changed();
  expect(calls).toEqual(["prevent-app-suspension", "stop:42", "prevent-app-suspension", "unsubscribe", "stop:42"]);
});
