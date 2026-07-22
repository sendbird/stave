import { describe, expect, test } from "bun:test";
import { openOrbitUrlWithLensPriority } from "../src/components/layout/workspace-scripts-panel.utils";

describe("workspace scripts panel Lens/Orbit helpers", () => {
  test("opens Orbit URLs in a lens tab before the external browser", async () => {
    const openSessionCalls: unknown[] = [];
    const navigateCalls: unknown[] = [];
    const focusedLensSessions: string[] = [];
    const externalUrls: string[] = [];

    const result = await openOrbitUrlWithLensPriority({
      url: " https://dev.stave.localhost ",
      workspaceId: "ws-1",
      projectPath: "/workspace",
      lensSessionScope: "project",
      lensApi: {
        openSession: async (args) => {
          openSessionCalls.push(args);
          return { ok: true };
        },
        navigate: async (args) => {
          navigateCalls.push(args);
          return { ok: true };
        },
      },
      resolveLensSessionId: () => "lens-1",
      focusLensSurface: (lensSessionId) => focusedLensSessions.push(lensSessionId),
      openExternalUrl: (url) => externalUrls.push(url),
    });

    expect(result).toEqual({
      ok: true,
      target: "lens",
      lensSessionId: "lens-1",
    });
    expect(focusedLensSessions).toEqual(["lens-1"]);
    expect(openSessionCalls).toEqual([
      {
        workspaceId: "ws-1",
        lensSessionId: "lens-1",
        sessionScope: "project",
        projectKey: "/workspace",
      },
    ]);
    expect(navigateCalls).toEqual([
      {
        workspaceId: "ws-1",
        lensSessionId: "lens-1",
        url: "https://dev.stave.localhost",
      },
    ]);
    expect(externalUrls).toEqual([]);
  });

  test("falls back to createView when openSession is unavailable", async () => {
    const createViewCalls: unknown[] = [];
    const navigateCalls: unknown[] = [];

    const result = await openOrbitUrlWithLensPriority({
      url: "https://dev.stave.localhost",
      workspaceId: "ws-1",
      projectPath: "/workspace",
      lensSessionScope: "workspace",
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
      resolveLensSessionId: () => "lens-2",
      focusLensSurface: () => {},
      openExternalUrl: () => {},
    });

    expect(result).toEqual({
      ok: true,
      target: "lens",
      lensSessionId: "lens-2",
    });
    expect(createViewCalls).toEqual([
      {
        workspaceId: "ws-1",
        lensSessionId: "lens-2",
        sessionScope: "workspace",
        projectKey: "/workspace",
      },
    ]);
    expect(navigateCalls).toEqual([
      {
        workspaceId: "ws-1",
        lensSessionId: "lens-2",
        url: "https://dev.stave.localhost",
      },
    ]);
  });

  test("falls back to the external browser when Lens is unavailable", async () => {
    const focusedLensSessions: string[] = [];
    const externalUrls: string[] = [];

    const result = await openOrbitUrlWithLensPriority({
      url: "https://dev.stave.localhost",
      workspaceId: "ws-1",
      projectPath: "/workspace",
      lensSessionScope: "project",
      lensApi: null,
      resolveLensSessionId: () => "lens-1",
      focusLensSurface: (lensSessionId) => focusedLensSessions.push(lensSessionId),
      openExternalUrl: (url) => externalUrls.push(url),
    });

    expect(result).toEqual({
      ok: true,
      target: "external",
      reason: "lens-unavailable",
    });
    expect(focusedLensSessions).toEqual([]);
    expect(externalUrls).toEqual(["https://dev.stave.localhost"]);
  });

  test("falls back to the external browser when no lens tab can be resolved", async () => {
    const externalUrls: string[] = [];
    const navigateCalls: unknown[] = [];

    const result = await openOrbitUrlWithLensPriority({
      url: "https://dev.stave.localhost",
      workspaceId: "ws-1",
      projectPath: "/workspace",
      lensSessionScope: "project",
      lensApi: {
        openSession: async () => ({ ok: true }),
        navigate: async (args) => {
          navigateCalls.push(args);
          return { ok: true };
        },
      },
      resolveLensSessionId: () => null,
      focusLensSurface: () => {},
      openExternalUrl: (url) => externalUrls.push(url),
    });

    expect(result).toEqual({
      ok: true,
      target: "external",
      reason: "missing-workspace",
    });
    expect(navigateCalls).toEqual([]);
    expect(externalUrls).toEqual(["https://dev.stave.localhost"]);
  });

  test("does not automatically open the external browser when Lens navigation fails", async () => {
    const externalUrls: string[] = [];

    const result = await openOrbitUrlWithLensPriority({
      url: "https://blocked.stave.localhost",
      workspaceId: "ws-1",
      projectPath: "/workspace",
      lensSessionScope: "project",
      lensApi: {
        openSession: async () => ({ ok: true }),
        navigate: async () => ({ ok: false, message: "Blocked host" }),
      },
      resolveLensSessionId: () => "lens-1",
      focusLensSurface: () => {},
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
