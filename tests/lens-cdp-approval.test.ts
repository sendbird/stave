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
  setLensSecurityConfig,
} = await import("../electron/main/browser/browser-security");

describe("Lens CDP approval coordination", () => {
  afterEach(() => {
    sentApprovalRequests.length = 0;
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
});
