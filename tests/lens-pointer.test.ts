import { expect, test } from "bun:test";
import { getLensPointerScript } from "../electron/main/browser/browser-pointer";

test("pointer hover coalesces moves and rechecks the stationary pointer on scroll", () => {
  const listeners = new Map<string, () => void>();
  const frames = new Map<number, () => void>();
  let next = 0;
  const rendered: unknown[] = [];
  const { stavePointerTracker } = new Function(
    "window",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    `${getLensPointerScript()}; return { stavePointerTracker };`,
  )(
    {
      addEventListener: (event: string, fn: () => void) =>
        listeners.set(event, fn),
      removeEventListener: (event: string) => listeners.delete(event),
    },
    (fn: () => void) => {
      frames.set(++next, fn);
      return next;
    },
    (id: number) => frames.delete(id),
  );
  const tracker = stavePointerTracker((point: unknown) => rendered.push(point));
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn());
  };
  tracker.move({ clientX: 10, clientY: 20 });
  tracker.move({ clientX: 30, clientY: 40 });
  expect(frames.size).toBe(1);
  flush();
  expect(rendered).toEqual([{ clientX: 30, clientY: 40, altKey: undefined }]);
  listeners.get("scroll")!();
  flush();
  expect(rendered).toHaveLength(2);
  tracker.move({ clientX: 50, clientY: 60 });
  tracker.dispose();
  expect(frames.size).toBe(0);
  expect(listeners.size).toBe(0);
});

test("hit testing preserves the document selector boundary for shadow hosts", () => {
  const host = { shadowRoot: { elementFromPoint: () => ({}) } };
  const hit = new Function(
    "document",
    `${getLensPointerScript()}; return staveElementAtPoint;`,
  )({ elementFromPoint: () => host });
  expect(hit(10, 20)).toBe(host);
});
