import { describe, expect, test } from "bun:test";
import { mapCodexServerRequestPresentation } from "../electron/providers/codex-server-request-mapping";

describe("Codex server request presentation", () => {
  test("keeps command details and pending response kind for approval", () => {
    expect(
      mapCodexServerRequestPresentation({
        method: "item/commandExecution/requestApproval",
        requestId: "42",
        params: { command: "bun test", reason: "Requires network access" },
      }),
    ).toEqual({
      kind: "approval",
      pending: { responseKind: "commandExecution" },
      event: {
        type: "approval",
        toolName: "bash",
        requestId: "42",
        description: "bun test\n\nRequires network access",
        input: "bun test",
        // Stave keeps "Always allow" as a trusted entry for the exact command.
        supportsAllowAlways: true,
        trustedToolEntry: "bash:bun test",
      },
    });
  });

  test("names a managed-network command's risk from the request, not its reason text", () => {
    const withContext = mapCodexServerRequestPresentation({
      method: "item/commandExecution/requestApproval",
      requestId: "net-1",
      params: { command: "curl https://example.test", networkApprovalContext: { host: "example.test", protocol: "https" } },
    });
    expect(withContext?.kind === "approval" ? withContext.event.risk : null).toBe("network-access");
    const reasonOnly = mapCodexServerRequestPresentation({
      method: "item/commandExecution/requestApproval",
      requestId: "net-2",
      params: { command: "bun test", reason: "Requires network access" },
    });
    expect(reasonOnly?.kind === "approval" ? reasonOnly.event.risk : null).toBeUndefined();
  });

  test("offers no Always allow for terminal input, extra write roots, permissions or MCP elicitation", () => {
    const events = [
      mapCodexServerRequestPresentation({
        method: "item/commandExecution/requestApproval",
        requestId: "stdin-1",
        params: { kind: "writeStdin", command: "y" },
      }),
      mapCodexServerRequestPresentation({
        method: "item/fileChange/requestApproval",
        requestId: "file-2",
        params: { grantRoot: "/tmp/elsewhere" },
      }),
      mapCodexServerRequestPresentation({
        method: "item/permissions/requestApproval",
        requestId: "permission-2",
        params: { permissions: { network: { enabled: true } } },
      }),
      mapCodexServerRequestPresentation({
        method: "mcpServer/elicitation/request",
        requestId: "mcp-2",
        params: {
          mode: "form",
          message: 'Allow tool "stave_list_repositories"?',
          requestedSchema: { type: "object", properties: {} },
          _meta: { codex_approval_kind: "mcp_tool_call" },
        },
      }),
    ];
    for (const mapped of events) {
      expect(mapped?.kind).toBe("approval");
      if (mapped?.kind !== "approval") continue;
      expect(mapped.event.supportsAllowAlways).toBeUndefined();
      expect(mapped.event.trustedToolEntry).toBeUndefined();
    }
    const patch = mapCodexServerRequestPresentation({
      method: "item/fileChange/requestApproval",
      requestId: "file-3",
      params: { reason: "Edit a source file" },
    });
    expect(patch?.kind === "approval" ? patch.event.trustedToolEntry : null).toBe("apply_patch");
  });

  test("keeps file grant root and permissions payload distinct", () => {
    expect(
      mapCodexServerRequestPresentation({
        method: "item/fileChange/requestApproval",
        requestId: "file-1",
        params: { grantRoot: "/tmp/project", reason: "Write generated output" },
      }),
    ).toEqual({
      kind: "approval",
      pending: { responseKind: "fileChange" },
      event: {
        type: "approval",
        toolName: "apply_patch",
        requestId: "file-1",
        description: "Write generated output\n\nGrant root: /tmp/project",
      },
    });
    expect(
      mapCodexServerRequestPresentation({
        method: "item/permissions/requestApproval",
        requestId: "permission-1",
        params: { permissions: { network: { enabled: true } } },
      }),
    ).toEqual({
      kind: "approval",
      pending: {
        responseKind: "permissions",
        permissions: { network: { enabled: true } },
      },
      event: {
        type: "approval",
        toolName: "permissions",
        requestId: "permission-1",
        description:
          "Codex requested approval for item/permissions/requestApproval.",
        risk: "network-access",
      },
    });
  });

  test("maps questions and preserves an empty malformed question list", () => {
    const params = {
      questions: [
        {
          key: "scope",
          header: "Scope",
          question: "Which scope?",
          options: [
            { label: "Current task", description: "Narrow change" },
            { label: "Whole app", description: "Broad change" },
          ],
        },
      ],
    };
    expect(
      mapCodexServerRequestPresentation({
        method: "item/tool/requestUserInput",
        requestId: "input-1",
        params,
      }),
    ).toMatchObject({
      kind: "user_input",
      pending: { responseKind: "tool" },
      event: {
        type: "user_input",
        toolName: "request_user_input",
        requestId: "input-1",
        questions: [
          {
            key: "scope",
            header: "Scope",
            question: "Which scope?",
            options: [
              { label: "Current task", description: "Narrow change" },
              { label: "Whole app", description: "Broad change" },
            ],
          },
        ],
      },
    });
    expect(
      mapCodexServerRequestPresentation({
        method: "item/tool/requestUserInput",
        requestId: "input-2",
        params: { questions: "invalid" },
      }),
    ).toMatchObject({ event: { questions: [] } });
  });

  test("keys questions by the App Server question id so answers return under it", () => {
    const mapped = mapCodexServerRequestPresentation({
      method: "item/tool/requestUserInput",
      requestId: "input-3",
      params: {
        threadId: "t1", turnId: "turn-1", itemId: "call_1", isBlocking: true, autoResolutionMs: null,
        questions: [{ id: "scope_choice", header: "Scope", question: "Which scope?", isOther: true, isSecret: false,
          options: [{ label: "Focused", description: "Narrow change" }] }],
      },
    });
    expect(mapped).toMatchObject({ event: { questions: [{ key: "scope_choice", question: "Which scope?" }] } });
  });

  test("maps MCP approval and rejects unrenderable elicitation", () => {
    expect(
      mapCodexServerRequestPresentation({
        method: "mcpServer/elicitation/request",
        requestId: "mcp-1",
        params: {
          mode: "form",
          message: 'Allow tool "stave_list_repositories"?',
          requestedSchema: { type: "object", properties: {} },
          _meta: {
            codex_approval_kind: "mcp_tool_call",
            tool_description: "List local projects.",
          },
        },
      }),
    ).toEqual({
      kind: "approval",
      pending: { responseKind: "elicitation" },
      event: {
        type: "approval",
        toolName: "stave_list_repositories",
        requestId: "mcp-1",
        description: "List local projects.",
      },
    });
    expect(
      mapCodexServerRequestPresentation({
        method: "mcpServer/elicitation/request",
        requestId: "mcp-2",
        params: { mode: "unknown", requestedSchema: null },
      }),
    ).toEqual({
      kind: "unrenderable",
      event: {
        type: "error",
        message: "Codex MCP elicitation could not be rendered by Stave.",
        recoverable: true,
      },
    });
    expect(
      mapCodexServerRequestPresentation({
        method: "unknown/request",
        requestId: "unknown",
        params: {},
      }),
    ).toBeNull();
  });

  test("keeps MCP form questions and response fields together", () => {
    expect(
      mapCodexServerRequestPresentation({
        method: "mcpServer/elicitation/request",
        requestId: "mcp-form",
        params: {
          mode: "form",
          message: "Choose an account.",
          requestedSchema: {
            type: "object",
            properties: {
              account: { type: "string", title: "Account" },
            },
            required: ["account"],
          },
        },
      }),
    ).toMatchObject({
      kind: "user_input",
      pending: {
        responseKind: "elicitation",
        elicitationMode: "form",
        elicitationFields: [{ key: "account", kind: "text" }],
      },
      event: {
        type: "user_input",
        toolName: "mcp_elicitation",
        requestId: "mcp-form",
        questions: [{ key: "account", required: true }],
      },
    });
  });
});
