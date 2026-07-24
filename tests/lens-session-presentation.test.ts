import { describe, expect, test } from "bun:test";
import { presentLensSessionInWorkspace } from "@/lib/lens/lens-session-presentation";

describe("Lens session presentation", () => {
  test("adopts and focuses the requested session in the active workspace", async () => {
    const opened: string[] = [];
    const focused: string[] = [];

    const presented = await presentLensSessionInWorkspace(
      { workspaceId: "ws-a", lensSessionId: "lens-a" },
      {
        hasWorkspace: () => true,
        getActiveWorkspaceId: () => "ws-a",
        switchWorkspace: async () => {},
        openLensTab: (lensSessionId) => {
          opened.push(lensSessionId);
          return lensSessionId;
        },
        focusLensSurface: (lensSessionId) => {
          focused.push(lensSessionId);
        },
      },
    );

    expect(presented).toBe(true);
    expect(opened).toEqual(["lens-a"]);
    expect(focused).toEqual(["lens-a"]);
  });

  test("switches workspace before presenting the same session", async () => {
    let activeWorkspaceId = "ws-a";
    const steps: string[] = [];

    const presented = await presentLensSessionInWorkspace(
      { workspaceId: "ws-b", lensSessionId: "lens-b" },
      {
        hasWorkspace: (workspaceId) => workspaceId === "ws-b",
        getActiveWorkspaceId: () => activeWorkspaceId,
        switchWorkspace: async (workspaceId) => {
          steps.push(`switch:${workspaceId}`);
          activeWorkspaceId = workspaceId;
        },
        openLensTab: (lensSessionId) => {
          steps.push(`open:${lensSessionId}`);
          return lensSessionId;
        },
        focusLensSurface: (lensSessionId) => {
          steps.push(`focus:${lensSessionId}`);
        },
      },
    );

    expect(presented).toBe(true);
    expect(steps).toEqual(["switch:ws-b", "open:lens-b", "focus:lens-b"]);
  });

  test("does not present a session for an unknown workspace", async () => {
    let mutated = false;

    const presented = await presentLensSessionInWorkspace(
      { workspaceId: "missing", lensSessionId: "lens-a" },
      {
        hasWorkspace: () => false,
        getActiveWorkspaceId: () => "ws-a",
        switchWorkspace: async () => {
          mutated = true;
        },
        openLensTab: () => {
          mutated = true;
          return null;
        },
        focusLensSurface: () => {
          mutated = true;
        },
      },
    );

    expect(presented).toBe(false);
    expect(mutated).toBe(false);
  });
});
