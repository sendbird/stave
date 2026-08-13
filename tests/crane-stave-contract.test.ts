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
import { resolveCraneJiraReference } from "../src/lib/crane-connector/jira-reference";

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
      CraneStaveJobV1Schema.safeParse(await readFixture("valid-job.json"))
        .success,
    ).toBe(true);
    expect(
      CraneStaveReceiptV1Schema.safeParse(
        await readFixture("valid-receipt.json"),
      ).success,
    ).toBe(true);
  });

  test("reads the Jira link from issue.links and ignores other rels", async () => {
    const parsed = CraneStaveJobV1Schema.safeParse(
      await readFixture("valid-job-with-issue-links.json"),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.issue.links).toHaveLength(2);
      expect(resolveCraneJiraReference(parsed.data)).toEqual({
        key: "DFE-2898",
        url: "https://sendbird.atlassian.net/browse/DFE-2898",
        source: "crane_link",
      });
    }
  });

  test("ignores additive Crane fields instead of rejecting the job", async () => {
    const job = await readFixture("valid-job.json");
    job.issue.labels = ["frontend"];
    job.issue.assignee = { name: "Jacob" };
    job.issue.links = [
      { rel: "design", url: "https://figma.com/file/abc", note: "later" },
    ];
    job.deliveredAt = "2026-07-26T01:05:00.000Z";
    const parsed = CraneStaveJobV1Schema.safeParse(job);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // Unknown fields are stripped, so they can never reach runtime code.
      expect(parsed.data).not.toHaveProperty("deliveredAt");
      expect(parsed.data.issue).not.toHaveProperty("labels");
      expect(parsed.data.issue.links?.[0]).toEqual({
        rel: "design",
        url: "https://figma.com/file/abc",
      });
      expect(resolveCraneJiraReference(parsed.data)).toBeNull();
    }
  });

  test("rejects host-control fields wherever they are nested", async () => {
    const nested = await readFixture("valid-job.json");
    nested.issue.runtime = { provider: "codex" };
    expect(CraneStaveJobV1Schema.safeParse(nested).success).toBe(false);

    const cased = await readFixture("valid-job.json");
    cased.issue.local_path = "/private/project";
    expect(CraneStaveJobV1Schema.safeParse(cased).success).toBe(false);

    const inLink = await readFixture("valid-job.json");
    inLink.issue.links = [
      {
        rel: "jira",
        url: "https://example.atlassian.net/browse/AB-1",
        cwd: "/",
      },
    ];
    expect(CraneStaveJobV1Schema.safeParse(inLink).success).toBe(false);
  });

  test("caps the number of declared links", async () => {
    const job = await readFixture("valid-job-with-issue-links.json");
    job.issue.links = Array.from(
      { length: CRANE_STAVE_DISPATCH_LIMITS.links + 1 },
      (_unused, index) => ({
        rel: "jira",
        url: `https://sendbird.atlassian.net/browse/DFE-${index + 1}`,
      }),
    );
    expect(CraneStaveJobV1Schema.safeParse(job).success).toBe(false);
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
    receipt.connectorId = "c".repeat(CRANE_STAVE_DISPATCH_LIMITS.id);
    receipt.errorCode = `e${"x".repeat(
      CRANE_STAVE_DISPATCH_LIMITS.errorCode - 1,
    )}`;
    expect(CraneStaveReceiptV1Schema.safeParse(receipt).success).toBe(false);
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
          providerTimeoutMs: 43_200_000,
          codexFileAccess: "workspace-write",
          codexNetworkAccess: false,
          codexApprovalPolicy: "on-request",
          codexWebSearch: "live",
          codexReasoningEffort: "xhigh",
          codexFastMode: false,
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

  test("requires an explicit reasoning effort on every dispatch runtime", () => {
    // Effort used to be absent from this contract, so an approved Crane job
    // ran at the provider SDK default instead of the approver's choice. Keep
    // the field required so the same omission fails loudly at the IPC edge.
    const claudeBase = {
      jobId: "job-1",
      projectPath: "/tmp/project",
      workspace: { strategy: "existing", workspaceId: "workspace-1" },
      runtime: {
        provider: "claude-code",
        model: "claude-opus-4-5",
        providerTimeoutMs: 43_200_000,
        claudePermissionMode: "acceptEdits",
        claudeSandboxEnabled: false,
        claudeAllowUnsandboxedCommands: true,
        claudeAllowDangerouslySkipPermissions: false,
        advisorTarget: null,
      },
    };
    expect(CraneDispatchApproveArgsSchema.safeParse(claudeBase).success).toBe(
      false,
    );
    expect(
      CraneDispatchApproveArgsSchema.safeParse({
        ...claudeBase,
        runtime: { ...claudeBase.runtime, claudeEffort: "high" },
      }).success,
    ).toBe(true);
    // Claude has no Codex-only tier, so a Codex-scale effort must be rejected
    // rather than silently coerced.
    expect(
      CraneDispatchApproveArgsSchema.safeParse({
        ...claudeBase,
        runtime: { ...claudeBase.runtime, claudeEffort: "ultra" },
      }).success,
    ).toBe(false);

    const codexRuntime = {
      provider: "codex",
      model: "gpt-5.6",
      providerTimeoutMs: 43_200_000,
      codexFileAccess: "workspace-write",
      codexNetworkAccess: false,
      codexApprovalPolicy: "on-request",
      codexWebSearch: "cached",
      advisorTarget: null,
    };
    expect(
      CraneDispatchApproveArgsSchema.safeParse({
        ...claudeBase,
        runtime: codexRuntime,
      }).success,
    ).toBe(false);
    expect(
      CraneDispatchApproveArgsSchema.safeParse({
        ...claudeBase,
        runtime: {
          ...codexRuntime,
          codexReasoningEffort: "ultra",
          codexFastMode: true,
        },
      }).success,
    ).toBe(true);
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
      path.join(repoRoot, "electron", "main", "ipc", "crane-connector.ts"),
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

    const taskControlIpc = readFileSync(
      path.join(repoRoot, "electron", "main", "ipc", "task-control.ts"),
      "utf8",
    );
    expect(preload).toContain("taskControl:");
    expect(preload).toContain('"task-control:take-over"');
    expect(preload).toContain('"task-control:stop"');
    expect(rendererTypes).toContain("taskControl?:");
    expect(rendererTypes).toContain("takeOver?:");
    expect(rendererTypes).toContain("stop?:");
    expect(taskControlIpc).toContain('"task-control:take-over"');
    expect(taskControlIpc).toContain('"task-control:stop"');
  });
});
