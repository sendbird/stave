import { describe, expect, test } from "bun:test";
import {
  assertLensAutomationAllowed,
  bindLensAutomation,
  forgetLensAutomation,
  getLensAutomation,
  pauseLensAutomation,
  runLensAutomation,
} from "../electron/main/browser/browser-automation-control";

const target = () => ({ workspaceId: crypto.randomUUID(), lensSessionId: "preview" });
describe("Lens direct interaction", () => {
  test("takeover rejects pending commands even after access is resumed", async () => {
    const session = target();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    let clicks = 0;
    const action = runLensAutomation("click", async () => {
      bindLensAutomation(session);
      await wait;
      assertLensAutomationAllowed();
      clicks++;
    });
    expect(getLensAutomation(session).running).toBe(1);
    pauseLensAutomation(session, true);
    pauseLensAutomation(session, false);
    release();
    await expect(action).rejects.toThrow("paused");
    expect(clicks).toBe(0);
    expect(getLensAutomation(session).running).toBe(0);
  });
  test("paused calls do not decrement another in-flight lease", async () => {
    const session = target();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const pending = runLensAutomation("read", async () => { bindLensAutomation(session); await wait; });
    pauseLensAutomation(session, true);
    await expect(runLensAutomation("click", async () => bindLensAutomation(session))).rejects.toThrow("paused");
    expect(getLensAutomation(session).running).toBe(1);
    // User-owned IPC does not inherit the agent lease.
    expect(() => assertLensAutomationAllowed()).not.toThrow();
    const other = { ...session, lensSessionId: "other" };
    await runLensAutomation("click", async () => bindLensAutomation(other));
    release();
    await expect(pending).rejects.toThrow("paused");
  });
  test("preview failure cannot turn a completed action into a failure", async () => {
    const session = target();
    const result = await runLensAutomation("click", async () => { bindLensAutomation(session); return 42; }, async () => { throw new Error("capture failed"); });
    expect(result).toBe(42);
    expect(getLensAutomation(session).running).toBe(0);
  });
  test("forgetting a closed session clears its pause and leaves other sessions alone", () => {
    const session = target();
    const other = { ...session, lensSessionId: "other" };
    pauseLensAutomation(session, true);
    pauseLensAutomation(other, true);
    forgetLensAutomation(session);
    expect(getLensAutomation(session).paused).toBe(false);
    expect(getLensAutomation(other).paused).toBe(true);
  });
  test("state only exposes the public identity and discards previews on takeover", async () => {
    const session = { ...target(), secret: "must not enter IPC" };
    await runLensAutomation("click", async () => bindLensAutomation(session), async () => "data:image/jpeg;base64,test");
    expect(getLensAutomation(session)).not.toHaveProperty("secret");
    expect(getLensAutomation(session).preview).toBeDefined();
    pauseLensAutomation(session, true);
    expect(getLensAutomation(session).preview).toBeUndefined();
  });
});
