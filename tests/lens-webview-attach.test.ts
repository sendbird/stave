import { describe, expect, test } from "bun:test";
import {
  applyLensWebviewPreferences,
  decideLensWebviewAttach,
} from "../electron/main/browser/browser-webview-attach";
import {
  LENS_PARTITION_PREFIX,
  isLensGuestPartition,
  resolveLensSessionProfile,
} from "../electron/main/browser/browser-session-profile";

const GUEST_PRELOAD = "/app/out/preload/lens-guest.cjs";

describe("Lens partition recognition", () => {
  test("accepts every partition the profile resolver can produce", () => {
    const workspaceScoped = resolveLensSessionProfile({
      workspaceId: "ws-1",
      sessionScope: "workspace",
      projectKey: null,
    });
    const projectScoped = resolveLensSessionProfile({
      workspaceId: "ws-1",
      sessionScope: "project",
      projectKey: "/repo/stave",
    });

    expect(isLensGuestPartition(workspaceScoped.partition)).toBe(true);
    expect(isLensGuestPartition(projectScoped.partition)).toBe(true);
  });

  test("rejects the bare prefix, other partitions, and non-strings", () => {
    expect(isLensGuestPartition(LENS_PARTITION_PREFIX)).toBe(false);
    expect(isLensGuestPartition("persist:terminal-1")).toBe(false);
    expect(isLensGuestPartition("")).toBe(false);
    expect(isLensGuestPartition(undefined)).toBe(false);
    expect(isLensGuestPartition(null)).toBe(false);
    expect(isLensGuestPartition(42)).toBe(false);
  });

  test("does not accept a partition that merely contains the prefix", () => {
    expect(isLensGuestPartition(`evil-${LENS_PARTITION_PREFIX}ws`)).toBe(false);
  });
});

describe("webview attach decision", () => {
  test("refuses a tag that asks for no partition", () => {
    const decision = decideLensWebviewAttach({
      requestedPartition: undefined,
      guestPreloadPath: GUEST_PRELOAD,
    });

    expect(decision.allow).toBe(false);
    expect(decision.allow === false && decision.reason).toContain(
      "no Lens partition",
    );
  });

  test("refuses a tag pointed at a non-Lens partition", () => {
    const decision = decideLensWebviewAttach({
      requestedPartition: "persist:something-else",
      guestPreloadPath: GUEST_PRELOAD,
    });

    expect(decision.allow).toBe(false);
    expect(decision.allow === false && decision.reason).toContain(
      "persist:something-else",
    );
  });

  test("refuses to attach when main has no guest preload to force", () => {
    const decision = decideLensWebviewAttach({
      requestedPartition: `${LENS_PARTITION_PREFIX}ws-1`,
      guestPreloadPath: "",
    });

    expect(decision.allow).toBe(false);
  });

  test("forces the full preference set for a Lens partition", () => {
    const decision = decideLensWebviewAttach({
      requestedPartition: `${LENS_PARTITION_PREFIX}ws-1`,
      guestPreloadPath: GUEST_PRELOAD,
    });

    expect(decision).toEqual({
      allow: true,
      webPreferences: {
        preload: GUEST_PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        partition: `${LENS_PARTITION_PREFIX}ws-1`,
      },
    });
  });

  test("matches the preferences the native view path already runs with", () => {
    const decision = decideLensWebviewAttach({
      requestedPartition: `${LENS_PARTITION_PREFIX}ws-1`,
      guestPreloadPath: GUEST_PRELOAD,
    });

    // The rendering model changes; the sandboxing does not.
    expect(decision.allow && decision.webPreferences).toMatchObject({
      preload: GUEST_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    });
  });
});

describe("applying preferences to Electron's object", () => {
  test("overwrites whatever the tag asked for", () => {
    const decision = decideLensWebviewAttach({
      requestedPartition: `${LENS_PARTITION_PREFIX}ws-1`,
      guestPreloadPath: GUEST_PRELOAD,
    });
    if (!decision.allow) {
      throw new Error("expected the attach to be allowed");
    }

    const target: Record<string, unknown> = {
      preload: "/tmp/attacker.js",
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
      webviewTag: true,
      partition: "persist:something-else",
    };
    applyLensWebviewPreferences(target, decision.webPreferences);

    expect(target).toMatchObject({
      preload: GUEST_PRELOAD,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      partition: `${LENS_PARTITION_PREFIX}ws-1`,
    });
  });

  test("mutates in place, because Electron reads the same object back", () => {
    const decision = decideLensWebviewAttach({
      requestedPartition: `${LENS_PARTITION_PREFIX}ws-1`,
      guestPreloadPath: GUEST_PRELOAD,
    });
    if (!decision.allow) {
      throw new Error("expected the attach to be allowed");
    }

    const target: Record<string, unknown> = {};
    const same = target;
    applyLensWebviewPreferences(target, decision.webPreferences);

    expect(same.sandbox).toBe(true);
  });

  test("leaves unrelated keys alone rather than clearing the object", () => {
    const decision = decideLensWebviewAttach({
      requestedPartition: `${LENS_PARTITION_PREFIX}ws-1`,
      guestPreloadPath: GUEST_PRELOAD,
    });
    if (!decision.allow) {
      throw new Error("expected the attach to be allowed");
    }

    const target: Record<string, unknown> = { backgroundColor: "#000000" };
    applyLensWebviewPreferences(target, decision.webPreferences);

    expect(target.backgroundColor).toBe("#000000");
  });
});
