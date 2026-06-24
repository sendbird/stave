import { describe, expect, test } from "bun:test";
import { resolveLensSessionProfile } from "../electron/main/browser/browser-session-profile";
import { assertNavigationAllowed } from "../electron/main/browser/browser-security";
import { normalizeLensUrl } from "../electron/main/browser/browser-url";

describe("normalizeLensUrl", () => {
  test("defaults localhost targets to http", () => {
    expect(normalizeLensUrl("localhost:8888")).toBe("http://localhost:8888");
    expect(normalizeLensUrl("127.0.0.1:3000/path")).toBe(
      "http://127.0.0.1:3000/path",
    );
  });

  test("defaults remote targets to https", () => {
    expect(normalizeLensUrl("example.com")).toBe("https://example.com");
  });

  test("preserves explicit protocols", () => {
    expect(normalizeLensUrl("http://localhost:5173")).toBe(
      "http://localhost:5173",
    );
    expect(normalizeLensUrl("https://example.com")).toBe(
      "https://example.com",
    );
  });

  test("blocks dangerous protocols", () => {
    expect(() => normalizeLensUrl("javascript:alert(1)")).toThrow(
      "Blocked protocol: javascript:alert(1)",
    );
  });
});

describe("assertNavigationAllowed", () => {
  test("allows remote hosts when lists are empty", () => {
    expect(() =>
      assertNavigationAllowed("https://example.com", {
        allowedHosts: [],
        blockedHosts: [],
        developerModeCdp: true,
        cdpApprovedHosts: [],
      }),
    ).not.toThrow();
  });

  test("blocked hosts win over allowed hosts", () => {
    expect(() =>
      assertNavigationAllowed("https://app.example.com", {
        allowedHosts: ["example.com"],
        blockedHosts: ["app.example.com"],
        developerModeCdp: true,
        cdpApprovedHosts: [],
      }),
    ).toThrow("Lens navigation blocked");
  });

  test("allowlist matches subdomains", () => {
    expect(() =>
      assertNavigationAllowed("https://app.example.com", {
        allowedHosts: ["example.com"],
        blockedHosts: [],
        developerModeCdp: true,
        cdpApprovedHosts: [],
      }),
    ).not.toThrow();
  });

  test("loopback targets are always allowed", () => {
    expect(() =>
      assertNavigationAllowed("http://localhost:5173", {
        allowedHosts: ["example.com"],
        blockedHosts: ["localhost"],
        developerModeCdp: true,
        cdpApprovedHosts: [],
      }),
    ).not.toThrow();
  });

  test("throws for unparseable urls", () => {
    expect(() =>
      assertNavigationAllowed("https://not a url", {
        allowedHosts: [],
        blockedHosts: [],
        developerModeCdp: true,
        cdpApprovedHosts: [],
      }),
    ).toThrow("Invalid Lens URL");
  });
});

describe("resolveLensSessionProfile", () => {
  test("uses a project-scoped hashed partition when a project key is available", () => {
    const first = resolveLensSessionProfile({
      workspaceId: "workspace-a",
      sessionScope: "project",
      projectKey: "/tmp/stave-project",
    });
    const second = resolveLensSessionProfile({
      workspaceId: "workspace-b",
      sessionScope: "project",
      projectKey: "/tmp/stave-project",
    });

    expect(first.scope).toBe("project");
    expect(first.partition).toBe(second.partition);
    expect(first.partition.startsWith("persist:lens-project-")).toBe(true);
    expect(first.partition).not.toContain("/tmp/stave-project");
  });

  test("keeps the existing workspace partition for isolated sessions", () => {
    const profile = resolveLensSessionProfile({
      workspaceId: "workspace-a",
      sessionScope: "workspace",
      projectKey: "/tmp/stave-project",
    });

    expect(profile.scope).toBe("workspace");
    expect(profile.partition).toBe("persist:lens-workspace-a");
  });

  test("falls back to workspace scope when project scope has no project key", () => {
    const profile = resolveLensSessionProfile({
      workspaceId: "workspace-a",
      sessionScope: "project",
      projectKey: "",
    });

    expect(profile.scope).toBe("workspace");
    expect(profile.partition).toBe("persist:lens-workspace-a");
  });
});
