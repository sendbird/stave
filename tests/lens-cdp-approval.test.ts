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
});
