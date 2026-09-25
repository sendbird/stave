import type { BridgeEvent } from "./types";
import {
  mapCodexElicitationToApproval,
  mapCodexElicitationToUserInput,
  type ElicitationFieldDescriptor,
} from "./codex-elicitation-mapping";
import { mapCodexUserInputQuestions } from "./codex-user-input-mapping";

type ApprovalMethod =
  | "item/commandExecution/requestApproval"
  | "item/fileChange/requestApproval"
  | "item/permissions/requestApproval"
  | "applyPatchApproval"
  | "execCommandApproval";

type ApprovalPresentation = {
  kind: "approval";
  event: Extract<BridgeEvent, { type: "approval" }>;
  pending: {
    responseKind:
      | "review"
      | "commandExecution"
      | "fileChange"
      | "permissions"
      | "elicitation";
    permissions?: { network?: unknown; fileSystem?: unknown } | null;
  };
};

type UserInputPresentation = {
  kind: "user_input";
  event: Extract<BridgeEvent, { type: "user_input" }>;
  pending: {
    responseKind: "tool" | "elicitation";
    elicitationMode?: "form" | "url";
    elicitationFields?: ElicitationFieldDescriptor[];
  };
};

type UnrenderablePresentation = {
  kind: "unrenderable";
  event: Extract<BridgeEvent, { type: "error" }>;
};

export type CodexServerRequestPresentation =
  | ApprovalPresentation
  | UserInputPresentation
  | UnrenderablePresentation;

function buildApprovalDescription(args: {
  method: ApprovalMethod;
  params: Record<string, unknown>;
}) {
  const reason =
    typeof args.params.reason === "string" &&
    args.params.reason.trim().length > 0
      ? args.params.reason.trim()
      : null;
  if (
    typeof args.params.command === "string" &&
    args.params.command.trim().length > 0
  ) {
    return reason ? `${args.params.command}\n\n${reason}` : args.params.command;
  }
  if (args.method === "item/fileChange/requestApproval") {
    const grantRoot =
      typeof args.params.grantRoot === "string"
        ? args.params.grantRoot.trim()
        : "";
    if (grantRoot) {
      return reason
        ? `${reason}\n\nGrant root: ${grantRoot}`
        : `Grant root: ${grantRoot}`;
    }
  }
  return reason ?? `Codex requested approval for ${args.method}.`;
}

function buildApprovalInput(params: Record<string, unknown>) {
  return typeof params.command === "string" &&
    params.command.trim().length > 0
    ? params.command.trim()
    : undefined;
}

function mapApprovalToolName(method: ApprovalMethod) {
  switch (method) {
    case "item/commandExecution/requestApproval":
    case "execCommandApproval":
      return "bash";
    case "item/fileChange/requestApproval":
    case "applyPatchApproval":
      return "apply_patch";
    case "item/permissions/requestApproval":
      return "permissions";
  }
}

/** Translate the request for presentation; the runtime still owns its response. */
export function mapCodexServerRequestPresentation(args: {
  method: string;
  params: Record<string, unknown>;
  requestId: string;
}): CodexServerRequestPresentation | null {
  const { method, params, requestId } = args;
  if (
    method === "item/commandExecution/requestApproval" ||
    method === "item/fileChange/requestApproval" ||
    method === "item/permissions/requestApproval" ||
    method === "applyPatchApproval" ||
    method === "execCommandApproval"
  ) {
    const responseKind =
      method === "item/commandExecution/requestApproval"
        ? "commandExecution"
        : method === "item/fileChange/requestApproval"
          ? "fileChange"
          : method === "item/permissions/requestApproval"
            ? "permissions"
            : "review";
    const approvalInput =
      method === "item/commandExecution/requestApproval" ||
      method === "applyPatchApproval" ||
      method === "execCommandApproval"
        ? buildApprovalInput(params)
        : undefined;
    return {
      kind: "approval",
      pending: {
        responseKind,
        ...(responseKind === "permissions"
          ? {
              permissions:
                typeof params.permissions === "object" && params.permissions
                  ? (params.permissions as ApprovalPresentation["pending"]["permissions"])
                  : null,
            }
          : {}),
      },
      event: {
        type: "approval",
        toolName: mapApprovalToolName(method),
        requestId,
        description: buildApprovalDescription({ method, params }),
        ...(approvalInput ? { input: approvalInput } : {}),
      },
    };
  }

  if (method === "item/tool/requestUserInput") {
    const questions = Array.isArray(params.questions)
      ? mapCodexUserInputQuestions(
          params.questions as Array<Record<string, unknown>>,
        )
      : [];
    return {
      kind: "user_input",
      pending: { responseKind: "tool" },
      event: {
        type: "user_input",
        toolName: "request_user_input",
        requestId,
        questions,
      },
    };
  }

  if (method === "mcpServer/elicitation/request") {
    const approval = mapCodexElicitationToApproval(params);
    if (approval) {
      return {
        kind: "approval",
        pending: { responseKind: "elicitation" },
        event: {
          type: "approval",
          toolName: approval.toolName,
          requestId,
          description: approval.description,
        },
      };
    }
    const elicitation = mapCodexElicitationToUserInput(params);
    if (!elicitation) {
      return {
        kind: "unrenderable",
        event: {
          type: "error",
          message: "Codex MCP elicitation could not be rendered by Stave.",
          recoverable: true,
        },
      };
    }
    return {
      kind: "user_input",
      pending: {
        responseKind: "elicitation",
        elicitationMode: elicitation.mode,
        elicitationFields: elicitation.fields,
      },
      event: {
        type: "user_input",
        toolName: "mcp_elicitation",
        requestId,
        questions: elicitation.questions,
      },
    };
  }

  return null;
}
