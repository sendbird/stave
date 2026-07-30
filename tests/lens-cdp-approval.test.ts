import { afterEach, describe, expect, mock, test } from "bun:test";

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
  afterEach(() => {
    sentApprovalRequests.length = 0;
    setUnattendedAutomationAuthorizations([]);
    setLensSecurityConfig({
      allowedHosts: [],
      blockedHosts: [],
      developerModeCdp: true,
      cdpApprovedHosts: [],
    });
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
    const host = "127.0.0.1";
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

  test("persists a remembered approval after settling its request", async () => {
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
