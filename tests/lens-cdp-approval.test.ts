import { afterEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RouteStore } from "portless";
import { normalizePersistedLensSettings } from "../src/store/app-settings";
import type { LensCdpPolicyConfig } from "../electron/main/browser/browser-cdp-policy";
import {
  deleteWorkspaceScriptProcess,
  getScriptProcessKey,
  hasWorkspaceOrbitHost,
  setWorkspaceScriptProcess,
} from "../electron/main/workspace-scripts/state";

const sentApprovalRequests: Array<{
  channel: string;
  payload: {
    workspaceId: string;
    lensSessionId?: string;
    requestId: string;
    host: string;
    reason: string;
    expiresAt?: number;
  };
}> = [];

mock.module("../electron/main/window", () => ({
  getMainWindow: () => ({
    webContents: {
      isDestroyed: () => false,
      send: (
        channel: string,
        payload: (typeof sentApprovalRequests)[number]["payload"],
      ) => {
        sentApprovalRequests.push({ channel, payload });
      },
    },
  }),
}));

mock.module("../electron/main/host-service-client", () => ({
  invokeHostService: async (_method: string, args: { workspaceId: string; host: string }) => ({
    matches: hasWorkspaceOrbitHost(args.workspaceId, args.host),
  }),
}));

const {
  assertCdpAllowed,
  getLensSecurityConfig,
  respondCdpApproval,
  runWithUnattendedAutomationAuthorization,
  setLensSecurityConfig,
  setUnattendedAutomationAuthorizations,
} = await import("../electron/main/browser/browser-security");
const { subscribeLensCdpPolicy } =
  await import("../electron/main/browser/browser-cdp-policy");

describe("Lens CDP approval coordination", () => {
  async function expectPromptFor(workspaceId: string, url: string, host: string) {
    const requestCount = sentApprovalRequests.length;
    const pending = assertCdpAllowed({ workspaceId, url });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sentApprovalRequests).toHaveLength(requestCount + 1);
    const { payload } = sentApprovalRequests[requestCount];
    expect(payload).toMatchObject({ workspaceId, host });
    respondCdpApproval({ requestId: payload.requestId, approved: true });
    await pending;
  }

  afterEach(() => {
    setSystemTime();
    sentApprovalRequests.length = 0;
    setUnattendedAutomationAuthorizations([]);
    // Disabling CDP clears grants and settles any pending requests.
    setLensSecurityConfig({ ...getLensSecurityConfig(), developerModeCdp: false });
    setLensSecurityConfig({
      allowedHosts: [],
      blockedHosts: [],
      developerModeCdp: true,
      cdpLocalHostExemption: true,
      cdpApprovedHosts: [],
    });
  });

  test("defaults the exemption on and preserves a saved opt-out", () => {
    expect(normalizePersistedLensSettings({}).lensCdpLocalHostExemption).toBe(true);
    expect(
      normalizePersistedLensSettings({ lensCdpLocalHostExemption: false })
        .lensCdpLocalHostExemption,
    ).toBe(false);
  });

  test.each([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://[::1]:5173",
    "https://fix-ui.stave.localhost",
  ])("exempts %s when local development prompts are skipped", async (url) => {
    await expect(
      assertCdpAllowed({ workspaceId: "local-workspace", url }),
    ).resolves.toBeUndefined();
    expect(sentApprovalRequests).toHaveLength(0);
  });

  test.each([
    ["http://localhost:5173", "localhost"],
    ["http://127.0.0.1:5173", "127.0.0.1"],
    ["http://[::1]:5173", "::1"],
    ["https://fix-ui.stave.localhost", "fix-ui.stave.localhost"],
  ])("prompts for %s when the exemption is off", async (url, host) => {
    setLensSecurityConfig({ ...getLensSecurityConfig(), cdpLocalHostExemption: false });
    await expectPromptFor("opt-out-workspace", url, host);
  });

  test.each(["0.0.0.0", "127.0.0.2", "localhost.example.test"])(
    "does not exempt %s from CDP approval",
    async (host) => {
      await expectPromptFor("other-host-workspace", `http://${host}:5173`, host);
    },
  );

  test("exempts only exact active Orbit routes owned by the workspace", async () => {
    const directory = mkdtempSync(join(tmpdir(), "stave-lens-orbit-"));
    const workspaceId = "orbit-workspace";
    const identity = { workspaceId, scriptId: "dev", scriptKind: "service" } as const;
    const key = getScriptProcessKey(identity);
    const store = new RouteStore(directory);
    const host = "worktree.dev.orbit.test";
    const url = `https://${host}:1355`;
    store.addRoute(host, 4000, process.pid);
    setWorkspaceScriptProcess(key, {
      ...identity,
      process: { pid: process.pid } as import("node:child_process").ChildProcess,
      runId: "orbit-run",
      aborted: false,
      source: { kind: "manual" },
      log: "",
      orbitRouteStores: [store],
      orbitUrl: "https://fake-orbit.test",
    });

    try {
      await expect(assertCdpAllowed({ workspaceId, url })).resolves.toBeUndefined();
      expect(sentApprovalRequests).toHaveLength(0);
      await expectPromptFor("another-workspace", url, host);
      await expectPromptFor(workspaceId, `https://child.${host}`, `child.${host}`);
      await expectPromptFor(workspaceId, "https://fake-orbit.test", "fake-orbit.test");

      setLensSecurityConfig({ ...getLensSecurityConfig(), cdpLocalHostExemption: false });
      await expectPromptFor(workspaceId, url, host);

      setLensSecurityConfig({ ...getLensSecurityConfig(), developerModeCdp: false });
      setLensSecurityConfig({
        ...getLensSecurityConfig(),
        developerModeCdp: true,
        cdpLocalHostExemption: true,
      });
      store.removeRoute(host, process.pid);
      store.addRoute(host, 4000, 0); // A Portless alias has no owning process.
      await expectPromptFor(workspaceId, url, host);
    } finally {
      deleteWorkspaceScriptProcess(key);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("blocks loopback when Developer Mode is off", async () => {
    setLensSecurityConfig({ ...getLensSecurityConfig(), developerModeCdp: false });
    await expect(
      assertCdpAllowed({ workspaceId: "local-workspace", url: "http://localhost:5173" }),
    ).rejects.toThrow("Lens Developer Mode CDP is disabled");
    expect(sentApprovalRequests).toHaveLength(0);
  });

  test("renews and publishes Allow once on use until 15 minutes of inactivity", async () => {
    const workspaceId = "sliding-workspace";
    const host = "sliding.approval.test";
    const url = `https://${host}`;
    const start = Date.now();
    const minute = 60_000;
    const policies: LensCdpPolicyConfig[] = [];
    const unsubscribe = subscribeLensCdpPolicy((policy) => policies.push(policy));
    try {
      setSystemTime(new Date(start));
      await expectPromptFor(workspaceId, url, host);
      expect(policies.at(-1)?.transientCdpApprovals).toContainEqual({
        workspaceId, host, expiresAt: start + 15 * minute,
      });

      setSystemTime(new Date(start + 14 * minute));
      await assertCdpAllowed({ workspaceId, url: `${url}:8443/settings` });
      expect(policies.at(-1)?.transientCdpApprovals).toContainEqual({
        workspaceId, host, expiresAt: start + 29 * minute,
      });

      setSystemTime(new Date(start + 28 * minute));
      await assertCdpAllowed({ workspaceId, url });
      expect(sentApprovalRequests).toHaveLength(1);
      expect(policies.at(-1)?.transientCdpApprovals).toContainEqual({
        workspaceId, host, expiresAt: start + 43 * minute,
      });
      await expectPromptFor("another-workspace", url, host);
      await expectPromptFor(workspaceId, `https://child.${host}`, `child.${host}`);

      setSystemTime(new Date(start + 43 * minute));
      await expectPromptFor(workspaceId, url, host);
    } finally {
      unsubscribe();
    }
  });

  test("deduplicates concurrent prompts and grants temporary access", async () => {
    const workspaceId = `workspace-${Date.now()}`;
    const host = `${Date.now()}.approval.test`;
    const first = assertCdpAllowed({
      workspaceId,
      lensSessionId: "hidden-session",
      url: `https://${host}/first`,
      reason: "Capture a screenshot",
    });
    const second = assertCdpAllowed({
      workspaceId,
      lensSessionId: "another-session",
      url: `https://${host}/second`,
      reason: "Read page HTML",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sentApprovalRequests).toHaveLength(1);
    const request = sentApprovalRequests[0];
    expect(request.channel).toBe("lens:cdp-approval-request");
    expect(request.payload).toMatchObject({
      workspaceId,
      lensSessionId: "hidden-session",
      host,
      reason: "Capture a screenshot",
    });
    expect(request.payload.expiresAt).toBeGreaterThan(Date.now());

    expect(
      respondCdpApproval({
        requestId: request.payload.requestId,
        approved: true,
      }),
    ).toBe(true);
    await Promise.all([first, second]);

    await expect(
      assertCdpAllowed({
        workspaceId,
        url: `https://${host}/third`,
      }),
    ).resolves.toBeUndefined();
    expect(sentApprovalRequests).toHaveLength(1);
  });

  test("unblocks a pending request when persisted host settings arrive", async () => {
    const workspaceId = `workspace-${Date.now()}`;
    const host = "hydrate.approval.test";
    const pending = assertCdpAllowed({
      workspaceId,
      lensSessionId: "startup-race",
      url: `http://${host}:5173`,
      reason: "Capture a screenshot",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sentApprovalRequests).toHaveLength(1);

    setLensSecurityConfig({
      allowedHosts: [],
      blockedHosts: [],
      developerModeCdp: true,
      cdpLocalHostExemption: true,
      cdpApprovedHosts: [host],
    });

    const outcome = await Promise.race([
      pending.then(() => "approved" as const),
      new Promise<"pending">((resolve) => {
        setTimeout(() => resolve("pending"), 25);
      }),
    ]);

    if (outcome === "pending") {
      respondCdpApproval({
        requestId: sentApprovalRequests[0].payload.requestId,
        approved: true,
      });
      await pending;
    }

    expect(outcome).toBe("approved");
  });

  test("rechecks persisted host settings before opening a prompt", async () => {
    const workspaceId = `workspace-${Date.now()}`;
    const host = "127.0.0.2";
    const pending = assertCdpAllowed({
      workspaceId,
      lensSessionId: "startup-race-before-prompt",
      url: `http://${host}:5173`,
      reason: "Capture a screenshot",
    });

    setLensSecurityConfig({
      allowedHosts: [],
      blockedHosts: [],
      developerModeCdp: true,
      cdpLocalHostExemption: true,
      cdpApprovedHosts: [host],
    });

    const outcome = await Promise.race([
      pending.then(() => "approved" as const),
      new Promise<"pending">((resolve) => {
        setTimeout(() => resolve("pending"), 25);
      }),
    ]);

    if (outcome === "pending") {
      const request = sentApprovalRequests[0];
      if (request) {
        respondCdpApproval({
          requestId: request.payload.requestId,
          approved: true,
        });
        await pending;
      }
    }

    expect(outcome).toBe("approved");
    expect(sentApprovalRequests).toHaveLength(0);
  });

  test("persists Always allow without creating an Allow once grant", async () => {
    const workspaceId = `workspace-${Date.now()}`;
    const host = `${Date.now()}.remember.test`;
    const pending = assertCdpAllowed({
      workspaceId,
      url: `https://${host}`,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const request = sentApprovalRequests[0];

    expect(
      respondCdpApproval({
        requestId: request.payload.requestId,
        approved: true,
        remember: true,
      }),
    ).toBe(true);
    await pending;

    expect(getLensSecurityConfig().cdpApprovedHosts).toContain(host);
    setLensSecurityConfig({ ...getLensSecurityConfig(), cdpApprovedHosts: [] });
    await expectPromptFor(workspaceId, `https://${host}`, host);
  });

  test("skips prompts only for requests carrying an active unattended authorization", async () => {
    const workspaceId = `workspace-${Date.now()}-unattended`;
    const host = `${Date.now()}.unattended.test`;
    const authorizationToken = `authorization-${Date.now()}`;
    setUnattendedAutomationAuthorizations([
      { workspaceId, authorizationToken },
    ]);

    await expect(
      runWithUnattendedAutomationAuthorization(authorizationToken, () =>
        assertCdpAllowed({
          workspaceId,
          url: `https://${host}/dashboard`,
          reason: "Capture a screenshot",
        }),
      ),
    ).resolves.toBeUndefined();
    expect(sentApprovalRequests).toHaveLength(0);

    // An attended request in the same workspace still needs approval.
    const attended = assertCdpAllowed({
      workspaceId,
      url: `https://${host}/dashboard`,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sentApprovalRequests).toHaveLength(1);
    respondCdpApproval({
      requestId: sentApprovalRequests[0].payload.requestId,
      approved: true,
    });
    await attended;
  });

  test("releases only the matching pending automation request", async () => {
    const workspaceId = `workspace-${Date.now()}-late`;
    const host = `${Date.now()}.late.test`;
    const authorizationToken = `authorization-${Date.now()}-late`;
    const automationPending = runWithUnattendedAutomationAuthorization(
      authorizationToken,
      () =>
        assertCdpAllowed({
          workspaceId,
          url: `https://${host}`,
          reason: "Automation request",
        }),
    );
    const attendedPending = assertCdpAllowed({
      workspaceId,
      url: `https://${host}`,
      reason: "Attended request",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sentApprovalRequests).toHaveLength(2);

    setUnattendedAutomationAuthorizations([
      { workspaceId, authorizationToken },
    ]);

    await expect(automationPending).resolves.toBeUndefined();
    const attendedOutcome = await Promise.race([
      attendedPending.then(() => "approved" as const),
      new Promise<"pending">((resolve) => {
        setTimeout(() => resolve("pending"), 10);
      }),
    ]);
    expect(attendedOutcome).toBe("pending");

    const attendedRequest = sentApprovalRequests.find(
      (request) => request.payload.reason === "Attended request",
    );
    expect(attendedRequest).toBeDefined();
    respondCdpApproval({
      requestId: attendedRequest!.payload.requestId,
      approved: true,
    });
    await attendedPending;
  });

  test("still refuses CDP for unattended runs when Developer Mode is off", async () => {
    const workspaceId = `workspace-${Date.now()}-devmode`;
    const authorizationToken = `authorization-${Date.now()}-devmode`;
    setUnattendedAutomationAuthorizations([
      { workspaceId, authorizationToken },
    ]);
    setLensSecurityConfig({
      allowedHosts: [],
      blockedHosts: [],
      developerModeCdp: false,
      cdpLocalHostExemption: true,
      cdpApprovedHosts: [],
    });

    await expect(
      runWithUnattendedAutomationAuthorization(authorizationToken, () =>
        assertCdpAllowed({
          workspaceId,
          url: "https://devmode-off.test",
        }),
      ),
    ).rejects.toThrow("Lens Developer Mode CDP is disabled");
    expect(sentApprovalRequests).toHaveLength(0);
  });

  test("revokes automation approvals immediately when the run ends", async () => {
    const workspaceId = `workspace-${Date.now()}-revoked`;
    const host = `${Date.now()}.revoked.test`;
    const authorizationToken = `authorization-${Date.now()}-revoked`;
    setUnattendedAutomationAuthorizations([
      { workspaceId, authorizationToken },
    ]);

    await runWithUnattendedAutomationAuthorization(authorizationToken, () =>
      assertCdpAllowed({
        workspaceId,
        url: `https://${host}`,
      }),
    );
    setUnattendedAutomationAuthorizations([]);

    const afterRun = runWithUnattendedAutomationAuthorization(
      authorizationToken,
      () =>
        assertCdpAllowed({
          workspaceId,
          url: `https://${host}`,
        }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sentApprovalRequests).toHaveLength(1);
    respondCdpApproval({
      requestId: sentApprovalRequests[0].payload.requestId,
      approved: true,
    });
    await afterRun;
  });

  test("keeps allow-once approval active when persisted policy is republished", async () => {
    const workspaceId = `workspace-${Date.now()}`;
    const host = `${Date.now()}.transient.test`;
    const policies: Array<{
      transientCdpApprovals: ReadonlyArray<{
        workspaceId: string;
        host: string;
        expiresAt: number;
      }>;
    }> = [];
    const unsubscribe = subscribeLensCdpPolicy((policy) => {
      policies.push(policy);
    });

    try {
      const pending = assertCdpAllowed({
        workspaceId,
        url: `https://${host}`,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const request = sentApprovalRequests[0];

      expect(
        respondCdpApproval({
          requestId: request.payload.requestId,
          approved: true,
          remember: false,
        }),
      ).toBe(true);
      await pending;

      setLensSecurityConfig({
        allowedHosts: [],
        blockedHosts: [],
        developerModeCdp: true,
        cdpLocalHostExemption: true,
        cdpApprovedHosts: [],
      });

      expect(policies.at(-1)?.transientCdpApprovals).toContainEqual({
        workspaceId,
        host,
        expiresAt: expect.any(Number),
      });
    } finally {
      unsubscribe();
    }
  });
});
