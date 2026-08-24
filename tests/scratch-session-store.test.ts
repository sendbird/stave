import { beforeEach, describe, expect, test } from "bun:test";
import { useScratchSessionStore } from "../src/store/scratch-session.store";

beforeEach(() => {
  useScratchSessionStore.getState().reset();
});

describe("scratch session folder guard", () => {
  test("stores an absolute directory path", () => {
    const result = useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "/tmp/downloads" });

    expect(result.ok).toBe(true);
    expect(useScratchSessionStore.getState().folderPath).toBe("/tmp/downloads");
    expect(useScratchSessionStore.getState().error).toBeNull();
  });

  test("rejects a relative path", () => {
    const result = useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "./relative" });

    expect(result.ok).toBe(false);
    expect(useScratchSessionStore.getState().folderPath).toBeNull();
    expect(useScratchSessionStore.getState().error).toBe(
      "Scratch sessions need an absolute folder path.",
    );
  });

  test("adopts the folder the directory picker returned", async () => {
    const result = await useScratchSessionStore.getState().pickFolder({
      pickDirectory: async () => ({ ok: true, directoryPath: "/tmp/picked" }),
    });

    expect(result.ok).toBe(true);
    expect(useScratchSessionStore.getState().folderPath).toBe("/tmp/picked");
  });

  test("keeps the previous folder when the picker is cancelled", async () => {
    useScratchSessionStore.getState().setFolder({ directoryPath: "/tmp/kept" });

    const result = await useScratchSessionStore.getState().pickFolder({
      pickDirectory: async () => ({ ok: false, stderr: "No folder selected." }),
    });

    expect(result.ok).toBe(false);
    expect(useScratchSessionStore.getState().folderPath).toBe("/tmp/kept");
  });

  test("issues a distinct task id per session", () => {
    const first = useScratchSessionStore.getState().taskId;
    useScratchSessionStore.getState().reset();
    expect(useScratchSessionStore.getState().taskId).not.toBe(first);
    expect(first.startsWith("scratch-")).toBe(true);
  });
});
