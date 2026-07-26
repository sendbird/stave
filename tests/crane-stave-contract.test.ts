import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CraneConnectorConfigArgsSchema,
  CraneConnectorPairArgsSchema,
  CraneDispatchApproveArgsSchema,
  CraneDispatchDeclineArgsSchema,
} from "../electron/main/ipc/schemas";
import {
  CRANE_STAVE_DISPATCH_LIMITS,
  CraneStaveJobV1Schema,
  CraneStaveReceiptV1Schema,
} from "../src/lib/crane-connector/contract";

const fixtureDirectory = new URL(
  "./fixtures/stave-dispatch-v1/",
  import.meta.url,
);

async function readFixture(name: string) {
  return Bun.file(new URL(name, fixtureDirectory)).json();
}

describe("Crane Stave dispatch V1 contract", () => {
  test("accepts the shared valid job and receipt fixtures", async () => {
    expect(
      CraneStaveJobV1Schema.safeParse(
        await readFixture("valid-job.json"),
      ).success,
    ).toBe(true);
    expect(
      CraneStaveReceiptV1Schema.safeParse(
        await readFixture("valid-receipt.json"),
      ).success,
    ).toBe(true);
  });

  test.each([
    "invalid-job-version.json",
    "invalid-job-kind.json",
    "invalid-job-forbidden-property.json",
    "invalid-job-oversized-title.json",
    "invalid-job-expiry.json",
  ])("rejects shared invalid job fixture %s", async (name) => {
    expect(
      CraneStaveJobV1Schema.safeParse(await readFixture(name)).success,
    ).toBe(false);
  });

  test.each([
    "invalid-receipt-state.json",
    "invalid-receipt-forbidden-property.json",
  ])("rejects shared invalid receipt fixture %s", async (name) => {
    expect(
      CraneStaveReceiptV1Schema.safeParse(await readFixture(name)).success,
    ).toBe(false);
  });

  test("enforces the total UTF-8 payload bounds", async () => {
    const job = await readFixture("valid-job.json");
    job.issue.description = "한".repeat(7_000);
    expect(CraneStaveJobV1Schema.safeParse(job).success).toBe(false);

    const receipt = await readFixture("valid-receipt.json");
    receipt.jobId = "j".repeat(CRANE_STAVE_DISPATCH_LIMITS.id);
    receipt.connectorId = "c".repeat(
      CRANE_STAVE_DISPATCH_LIMITS.id,
    );
    receipt.errorCode = `e${"x".repeat(
      CRANE_STAVE_DISPATCH_LIMITS.errorCode - 1,
    )}`;
    expect(CraneStaveReceiptV1Schema.safeParse(receipt).success).toBe(
      false,
    );
  });

  test("does not define fields for local paths or runtime options", () => {
    expect(
      CraneStaveJobV1Schema.safeParse({
        version: 1,
        id: "job",
        kind: "run_task",
        connectorId: "connector",
        issue: {
          id: "issue",
          key: "CRANE-1",
          title: "Title",
          description: "",
          href: "https://crane.example/issues/CRANE-1",
          updatedAt: "2026-07-26T00:00:00.000Z",
        },
        instruction: "Run the task.",
        requestedAt: "2026-07-26T00:01:00.000Z",
        expiresAt: "2026-07-27T00:01:00.000Z",
        localPath: "/private/project",
      }).success,
    ).toBe(false);
  });

  test("keeps connector IPC payloads strict and local choices local", () => {
    expect(
      CraneConnectorConfigArgsSchema.safeParse({
        enabled: true,
        baseUrl: "https://atelier.delight-tools.ai",
        pollIntervalSeconds: 15,
        connectorSecret: "stc_forbidden",
      }).success,
    ).toBe(false);
    expect(
      CraneConnectorPairArgsSchema.safeParse({
        baseUrl: "https://atelier.delight-tools.ai",
        code: "stp_test-only-code",
        name: "Stave Desktop",
      }).success,
    ).toBe(true);
    expect(
      CraneDispatchApproveArgsSchema.safeParse({
        jobId: "job-1",
        projectPath: "/tmp/project",
        workspace: {
          strategy: "existing",
          workspaceId: "workspace-1",
        },
        runtime: {
          provider: "codex",
          model: "gpt-5.6",
          codexFileAccess: "workspace-write",
          codexNetworkAccess: false,
          codexApprovalPolicy: "on-request",
          advisorTarget: null,
        },
      }).success,
    ).toBe(true);
    expect(
      CraneDispatchDeclineArgsSchema.safeParse({
        jobId: "job-1",
        reason: "remote-controlled",
      }).success,
    ).toBe(false);
  });

  test("keeps preload, renderer types, and main channels symmetric", () => {
    const repoRoot = path.join(import.meta.dir, "..");
    const preload = readFileSync(
      path.join(repoRoot, "electron", "preload.ts"),
      "utf8",
    );
    const rendererTypes = readFileSync(
      path.join(repoRoot, "src", "types", "window-api.d.ts"),
      "utf8",
    );
    const mainIpc = readFileSync(
      path.join(
        repoRoot,
        "electron",
        "main",
        "ipc",
        "crane-connector.ts",
      ),
      "utf8",
    );
    const endpoints = [
      ["getStatus", "crane-connector:get-status"],
      ["configure", "crane-connector:configure"],
      ["pair", "crane-connector:pair"],
      ["disconnect", "crane-connector:disconnect"],
      ["approve", "crane-connector:approve"],
      ["decline", "crane-connector:decline"],
    ] as const;

    for (const [bridgeMethod, channel] of endpoints) {
      expect(preload).toContain(`${bridgeMethod}:`);
      expect(preload).toContain(`"${channel}"`);
      expect(rendererTypes).toContain(`${bridgeMethod}?:`);
      expect(mainIpc).toContain(`"${channel}"`);
    }
  });
});
