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
        openLensTab: (lensSessionId, options) => {
          opened.push(`${lensSessionId}:${options.activate}`);
          return lensSessionId;
        },
        openLensSurface: (lensSessionId, options) => {
          focused.push(
            `${lensSessionId}:${options.activate}:${options.splitRight}`,
          );
          return true;
        },
      },
    );

    expect(presented).toBe(true);
    expect(opened).toEqual(["lens-a:true"]);
    expect(focused).toEqual(["lens-a:true:false"]);
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
        openLensTab: (lensSessionId, options) => {
          steps.push(`open:${lensSessionId}:${options.activate}`);
          return lensSessionId;
        },
        openLensSurface: (lensSessionId, options) => {
          steps.push(
            `surface:${lensSessionId}:${options.activate}:${options.splitRight}`,
          );
          return true;
        },
      },
    );

    expect(presented).toBe(true);
    expect(steps).toEqual([
      "switch:ws-b",
      "open:lens-b:true",
      "surface:lens-b:true:false",
    ]);
  });

  test("opens automatic visual activity in a right split without stealing focus", async () => {
    const steps: string[] = [];

    const presented = await presentLensSessionInWorkspace(
      {
        workspaceId: "ws-a",
        lensSessionId: "lens-a",
        requestKind: "agent-activity",
        activityKind: "visual",
      },
      {
        hasWorkspace: () => true,
        getActiveWorkspaceId: () => "ws-a",
        switchWorkspace: async () => {
          steps.push("switch");
        },
        openLensTab: (lensSessionId, options) => {
          steps.push(`open:${lensSessionId}:${options.activate}`);
          return lensSessionId;
        },
        openLensSurface: (lensSessionId, options) => {
          steps.push(
            `surface:${lensSessionId}:${options.activate}:${options.splitRight}`,
          );
          return true;
        },
      },
      {
        placement: "split-right",
        allowWorkspaceSwitch: false,
      },
    );

    expect(presented).toBe(true);
    expect(steps).toEqual([
      "open:lens-a:false",
      "surface:lens-a:false:true",
    ]);
  });

  test("adds automatic activity as a background tab when configured", async () => {
    const steps: string[] = [];

    const presented = await presentLensSessionInWorkspace(
      {
        workspaceId: "ws-a",
        lensSessionId: "lens-a",
        requestKind: "agent-activity",
        activityKind: "interaction",
      },
      {
        hasWorkspace: () => true,
        getActiveWorkspaceId: () => "ws-a",
        switchWorkspace: async () => {},
        openLensTab: (lensSessionId, options) => {
          steps.push(`open:${lensSessionId}:${options.activate}`);
          return lensSessionId;
        },
        openLensSurface: (lensSessionId, options) => {
          steps.push(
            `surface:${lensSessionId}:${options.activate}:${options.splitRight}`,
          );
          return true;
        },
      },
      {
        placement: "background-tab",
        allowWorkspaceSwitch: false,
      },
    );

    expect(presented).toBe(true);
    expect(steps).toEqual([
      "open:lens-a:false",
      "surface:lens-a:false:false",
    ]);
  });

  test("defers automatic presentation instead of switching workspaces", async () => {
    let mutated = false;

    const presented = await presentLensSessionInWorkspace(
      {
        workspaceId: "ws-b",
        lensSessionId: "lens-b",
        requestKind: "agent-activity",
        activityKind: "interaction",
      },
      {
        hasWorkspace: () => true,
        getActiveWorkspaceId: () => "ws-a",
        switchWorkspace: async () => {
          mutated = true;
        },
        openLensTab: () => {
          mutated = true;
          return "lens-b";
        },
        openLensSurface: () => {
          mutated = true;
          return true;
        },
      },
      {
        placement: "background-tab",
        allowWorkspaceSwitch: false,
      },
    );

    expect(presented).toBe(false);
    expect(mutated).toBe(false);
  });

  test("reports failure when the pane host cannot open the surface", async () => {
    // The pane host drops/queues the open when no Dockview api is mounted yet.
    // Reporting success there made callers discard their pending request, so
    // the session was never revealed and never retried.
    const presented = await presentLensSessionInWorkspace(
      { workspaceId: "ws-a", lensSessionId: "lens-a" },
      {
        hasWorkspace: () => true,
        getActiveWorkspaceId: () => "ws-a",
        switchWorkspace: async () => {},
        openLensTab: (lensSessionId) => lensSessionId,
        openLensSurface: () => false,
      },
    );

    expect(presented).toBe(false);
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
        openLensSurface: () => {
          mutated = true;
          return true;
        },
      },
    );

    expect(presented).toBe(false);
    expect(mutated).toBe(false);
  });
});
