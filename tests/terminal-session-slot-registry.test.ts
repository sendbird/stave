import { describe, expect, test } from "bun:test";
import {
  bindTerminalSessionSlot,
  clearTerminalSessionSlotRegistry,
  createTerminalSessionSlotRegistry,
  getTerminalSessionIdForSlotKey,
  unbindTerminalSessionSlotBySessionId,
  unbindTerminalSessionSlotBySlotKey,
} from "../electron/main/terminal-session-slot-registry";

describe("terminal session slot registry", () => {
  test("binds a slot key to a session id", () => {
    const registry = createTerminalSessionSlotRegistry();

    bindTerminalSessionSlot({
      registry,
      sessionId: "session-a",
      slotKey: "cli:workspace-a:tab-a",
    });

    expect(getTerminalSessionIdForSlotKey({
      registry,
      slotKey: "cli:workspace-a:tab-a",
    })).toBe("session-a");
  });

  test("rebinds an existing slot key to the latest session id", () => {
    const registry = createTerminalSessionSlotRegistry();

    bindTerminalSessionSlot({
      registry,
      sessionId: "session-a",
      slotKey: "cli:workspace-a:tab-a",
    });
    bindTerminalSessionSlot({
      registry,
      sessionId: "session-b",
      slotKey: "cli:workspace-a:tab-a",
    });

    expect(getTerminalSessionIdForSlotKey({
      registry,
      slotKey: "cli:workspace-a:tab-a",
    })).toBe("session-b");
    expect(registry.slotKeyBySessionId.has("session-a")).toBe(false);
  });

  test("moves a session id to a new slot key", () => {
    const registry = createTerminalSessionSlotRegistry();

    bindTerminalSessionSlot({
      registry,
      sessionId: "session-a",
      slotKey: "cli:workspace-a:tab-a",
    });
    bindTerminalSessionSlot({
      registry,
      sessionId: "session-a",
      slotKey: "cli:workspace-a:tab-b",
    });

    expect(getTerminalSessionIdForSlotKey({
      registry,
      slotKey: "cli:workspace-a:tab-a",
    })).toBeNull();
    expect(getTerminalSessionIdForSlotKey({
      registry,
      slotKey: "cli:workspace-a:tab-b",
    })).toBe("session-a");
  });

  test("unbinds by session id", () => {
    const registry = createTerminalSessionSlotRegistry();

    bindTerminalSessionSlot({
      registry,
      sessionId: "session-a",
      slotKey: "cli:workspace-a:tab-a",
    });
    unbindTerminalSessionSlotBySessionId({
      registry,
      sessionId: "session-a",
    });

    expect(getTerminalSessionIdForSlotKey({
      registry,
      slotKey: "cli:workspace-a:tab-a",
    })).toBeNull();
  });

  test("unbinds by slot key", () => {
    const registry = createTerminalSessionSlotRegistry();

    bindTerminalSessionSlot({
      registry,
      sessionId: "session-a",
      slotKey: "cli:workspace-a:tab-a",
    });
    unbindTerminalSessionSlotBySlotKey({
      registry,
      slotKey: "cli:workspace-a:tab-a",
    });

    expect(getTerminalSessionIdForSlotKey({
      registry,
      slotKey: "cli:workspace-a:tab-a",
    })).toBeNull();
    expect(registry.slotKeyBySessionId.has("session-a")).toBe(false);
  });

  test("clears all bindings", () => {
    const registry = createTerminalSessionSlotRegistry();

    bindTerminalSessionSlot({
      registry,
      sessionId: "session-a",
      slotKey: "cli:workspace-a:tab-a",
    });
    bindTerminalSessionSlot({
      registry,
      sessionId: "session-b",
      slotKey: "terminal:workspace-a:tab-b",
    });
    clearTerminalSessionSlotRegistry({ registry });

    expect(registry.sessionIdBySlotKey.size).toBe(0);
    expect(registry.slotKeyBySessionId.size).toBe(0);
  });
});
