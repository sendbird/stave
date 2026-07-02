import { describe, expect, test } from "bun:test";
import {
  buildOpenLensLayoutPatch,
  openOrbitUrlWithLensPriority,
} from "../src/components/layout/workspace-scripts-panel.utils";

describe("workspace scripts panel Lens/Orbit helpers", () => {
  test("opens Orbit URLs in Lens before the external browser", async () => {
    const createViewCalls: unknown[] = [];
    const navigateCalls: unknown[] = [];
    const layoutPatches: unknown[] = [];
    const externalUrls: string[] = [];

    const result = await openOrbitUrlWithLensPriority({
      url: " https://dev.stave.localhost ",
      workspaceId: "ws-1",
      projectPath: "/workspace",
      lensSessionScope: "project",
      isLargeViewport: true,
      lensApi: {
        createView: async (args) => {
          createViewCalls.push(args);
          return { ok: true };
        },
        navigate: async (args) => {
          navigateCalls.push(args);
          return { ok: true };
        },
      },
      setLayout: ({ patch }) => layoutPatches.push(patch),
      openExternalUrl: (url) => externalUrls.push(url),
    });

    expect(result).toEqual({ ok: true, target: "lens" });
    expect(layoutPatches).toEqual([
      { sidebarOverlayVisible: true, sidebarOverlayTab: "lens" },
    ]);
    expect(createViewCalls).toEqual([
      {
        workspaceId: "ws-1",
        sessionScope: "project",
        projectKey: "/workspace",
      },
    ]);
    expect(navigateCalls).toEqual([
      { workspaceId: "ws-1", url: "https://dev.stave.localhost" },
    ]);
    expect(externalUrls).toEqual([]);
  });

  test("hides the editor when opening Lens from a small viewport", () => {
    expect(buildOpenLensLayoutPatch({ isLargeViewport: false })).toEqual({
      sidebarOverlayVisible: true,
      sidebarOverlayTab: "lens",
      editorVisible: false,
    });
  });

  test("falls back to the external browser when Lens is unavailable", async () => {
    const layoutPatches: unknown[] = [];
    const externalUrls: string[] = [];

    const result = await openOrbitUrlWithLensPriority({
      url: "https://dev.stave.localhost",
      workspaceId: "ws-1",
      projectPath: "/workspace",
      lensSessionScope: "project",
      isLargeViewport: true,
      lensApi: null,
      setLayout: ({ patch }) => layoutPatches.push(patch),
      openExternalUrl: (url) => externalUrls.push(url),
    });

    expect(result).toEqual({
      ok: true,
      target: "external",
      reason: "lens-unavailable",
    });
    expect(layoutPatches).toEqual([]);
    expect(externalUrls).toEqual(["https://dev.stave.localhost"]);
  });

  test("does not automatically open the external browser when Lens navigation fails", async () => {
    const externalUrls: string[] = [];

    const result = await openOrbitUrlWithLensPriority({
      url: "https://blocked.stave.localhost",
      workspaceId: "ws-1",
      projectPath: "/workspace",
      lensSessionScope: "project",
      isLargeViewport: true,
      lensApi: {
        createView: async () => ({ ok: true }),
        navigate: async () => ({ ok: false, message: "Blocked host" }),
      },
      setLayout: () => {},
      openExternalUrl: (url) => externalUrls.push(url),
    });

    expect(result).toEqual({
      ok: false,
      target: "lens",
      message: "Blocked host",
    });
    expect(externalUrls).toEqual([]);
  });
});
