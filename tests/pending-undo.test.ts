import { afterEach, describe, expect, test } from "bun:test";
import {
  clearPendingUndos,
  hasPendingUndo,
  offerUndoToast,
  registerPendingUndo,
  runPendingUndo,
  withdrawPendingUndo,
} from "@/lib/notifications/pending-undo";
import { notificationToastManager } from "@/lib/notifications/toast";

afterEach(() => clearPendingUndos());

describe("pending undo", () => {
  test("runs nothing and reports false when empty", () => {
    expect(hasPendingUndo()).toBe(false);
    expect(runPendingUndo()).toBe(false);
  });

  test("runs the newest offer once, then the older one", () => {
    const ran: string[] = [];
    registerPendingUndo({ id: "a", run: () => ran.push("a") });
    registerPendingUndo({ id: "b", run: () => ran.push("b") });
    expect(runPendingUndo()).toBe(true);
    expect(runPendingUndo()).toBe(true);
    expect(runPendingUndo()).toBe(false);
    expect(ran).toEqual(["b", "a"]);
  });

  test("a withdrawn offer cannot run", () => {
    const ran: string[] = [];
    const withdraw = registerPendingUndo({ id: "a", run: () => ran.push("a") });
    withdraw();
    withdrawPendingUndo("missing");
    expect(runPendingUndo()).toBe(false);
    expect(ran).toEqual([]);
  });

  test("an undo toast registers, undoes once, and closes", () => {
    const events: Array<{ action: string; options: { id?: string } }> = [];
    const unsubscribe = notificationToastManager[" subscribe"]((event) =>
      events.push(event),
    );
    let undone = 0;
    const id = offerUndoToast("Settled", {
      undoLabel: "Undo",
      onUndo: () => {
        undone += 1;
      },
    });
    expect(hasPendingUndo()).toBe(true);
    expect(runPendingUndo()).toBe(true);
    expect(undone).toBe(1);
    expect(hasPendingUndo()).toBe(false);
    expect(events.some((event) => event.action === "close" && event.options?.id === id)).toBe(true);
    unsubscribe();
  });
});
