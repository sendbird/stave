import { DelegationPermissionSettingsSchema } from "../../../src/lib/runs/delegation-policy";
import { ipcMain } from "electron";
import {
  SecondaryRunExecuteResponseSchema,
  SecondaryRunTransitionResponseSchema,
} from "../../../src/lib/runs/secondary-run";
import {
  DelegatedTaskActionResponseSchema,
  DelegateTaskArgsSchema,
  DelegatedTaskDetachArgsSchema,
  DelegatedTaskFollowUpArgsSchema,
  DelegatedTaskLinkArgsSchema,
  DelegatedTaskListArgsSchema,
  DelegatedTaskRetryArgsSchema,
  DelegatedTaskStopArgsSchema,
  describeDelegatedTaskRejection,
} from "../../../src/lib/runs/delegated-task";
import { invokeHostService } from "../host-service-client";
import {
  getDelegatedTaskCoordinator,
  reconcileDelegatedTasks,
} from "../runs/delegated-task-coordinator-instance";
import { createSecondaryRunCoordinator } from "../runs/secondary-run-coordinator";
import { ensurePersistenceReady } from "../state";
import {
  SecondaryRunCancelArgsSchema,
  SecondaryRunClaimArgsSchema,
  SecondaryRunCompleteArgsSchema,
  SecondaryRunExecuteArgsSchema,
  SecondaryRunFailArgsSchema,
  SecondaryRunLookupArgsSchema,
  SecondaryRunReceiptListArgsSchema,
} from "./schemas";

const coordinator = createSecondaryRunCoordinator({
  getLedger: ensurePersistenceReady,
  executeHost: (request) =>
    invokeHostService("runs.execute-secondary", request),
  cancelHost: (request) => invokeHostService("runs.cancel-secondary", request),
});

function invalidTransitionResponse() {
  return SecondaryRunTransitionResponseSchema.parse({
    accepted: false,
    started: false,
    duplicate: false,
    reason: "invalid-request",
    aggregate: null,
  });
}

function invalidDelegatedTaskResponse() {
  return DelegatedTaskActionResponseSchema.parse({
    accepted: false,
    duplicate: false,
    reason: "invalid-request",
    message: describeDelegatedTaskRejection("invalid-request"),
    child: null,
  });
}

function invalidExecuteResponse() {
  return SecondaryRunExecuteResponseSchema.parse({
    accepted: false,
    reason: "invalid-request",
    execution: null,
    aggregate: null,
  });
}

export function registerRunHandlers() {
  // Delegated tasks outlive the app, so restart recovery has to ask the live task
  // what happened instead of assuming the delegation died with the process.
  // Deliberately not awaited: handler registration must not wait on the host
  // service, and an unreconciled row stays visible as `running` until it is.
  void reconcileDelegatedTasks();

  ipcMain.handle("runs:claim-secondary", async (_event, rawArgs: unknown) => {
    const args = SecondaryRunClaimArgsSchema.safeParse(rawArgs);
    return args.success
      ? await coordinator.claim(args.data)
      : invalidTransitionResponse();
  });

  ipcMain.handle("runs:execute-secondary", async (_event, rawArgs: unknown) => {
    const args = SecondaryRunExecuteArgsSchema.safeParse(rawArgs);
    return args.success
      ? await coordinator.execute(args.data)
      : invalidExecuteResponse();
  });

  ipcMain.handle(
    "runs:complete-secondary",
    async (_event, rawArgs: unknown) => {
      const args = SecondaryRunCompleteArgsSchema.safeParse(rawArgs);
      return args.success
        ? await coordinator.complete(args.data)
        : invalidTransitionResponse();
    },
  );

  ipcMain.handle("runs:fail-secondary", async (_event, rawArgs: unknown) => {
    const args = SecondaryRunFailArgsSchema.safeParse(rawArgs);
    return args.success
      ? await coordinator.fail(args.data)
      : invalidTransitionResponse();
  });

  ipcMain.handle("runs:cancel-secondary", async (_event, rawArgs: unknown) => {
    const args = SecondaryRunCancelArgsSchema.safeParse(rawArgs);
    return args.success
      ? await coordinator.cancel(args.data)
      : invalidTransitionResponse();
  });

  ipcMain.handle("runs:get-secondary", async (_event, rawArgs: unknown) => {
    const args = SecondaryRunLookupArgsSchema.safeParse(rawArgs);
    return args.success ? await coordinator.get(args.data) : null;
  });

  ipcMain.handle("runs:list-receipts", async (_event, rawArgs: unknown) => {
    const args = SecondaryRunReceiptListArgsSchema.safeParse(rawArgs);
    return args.success ? await coordinator.listReceipts(args.data) : [];
  });

  // The renderer reads child summaries when it assembles a parent turn, so a
  // parent driven from the UI sees its children's lifecycle without having to
  // ask for it.
  ipcMain.handle("delegations:sync-permission-settings", async (_event, rawArgs: unknown) => {
    const args = DelegationPermissionSettingsSchema.safeParse(rawArgs);
    if (!args.success) return { ok: false };
    return invokeHostService("local-mcp.invoke", { action: "sync-delegation-permission-settings", args: args.data });
  });

  ipcMain.handle("delegations:create", async (_event, rawArgs: unknown) => {
    const args = DelegateTaskArgsSchema.safeParse(rawArgs);
    return args.success
      ? await getDelegatedTaskCoordinator().delegate(args.data)
      : invalidDelegatedTaskResponse();
  });

  ipcMain.handle("delegations:list", async (_event, rawArgs: unknown) => {
    const args = DelegatedTaskListArgsSchema.safeParse(rawArgs);
    return args.success ? await getDelegatedTaskCoordinator().list(args.data) : [];
  });

  // The parent's own controls. Each one carries the identity its row was
  // rendered against, so the coordinator can refuse a click prepared against a
  // delegation that has since moved on rather than apply it to whatever
  // replaced it.
  ipcMain.handle(
    "delegations:follow-up",
    async (_event, rawArgs: unknown) => {
      const args = DelegatedTaskFollowUpArgsSchema.safeParse(rawArgs);
      return args.success
        ? await getDelegatedTaskCoordinator().followUp(args.data)
        : invalidDelegatedTaskResponse();
    },
  );

  ipcMain.handle("delegations:retry", async (_event, rawArgs: unknown) => {
    const args = DelegatedTaskRetryArgsSchema.safeParse(rawArgs);
    return args.success
      ? await getDelegatedTaskCoordinator().retry(args.data)
      : invalidDelegatedTaskResponse();
  });

  ipcMain.handle("delegations:stop", async (_event, rawArgs: unknown) => {
    const args = DelegatedTaskStopArgsSchema.safeParse(rawArgs);
    return args.success
      ? await getDelegatedTaskCoordinator().stop(args.data)
      : invalidDelegatedTaskResponse();
  });

  // Seen from the child's side: which delegation, if any, owns this task.
  ipcMain.handle(
    "delegations:get-link",
    async (_event, rawArgs: unknown) => {
      const args = DelegatedTaskLinkArgsSchema.safeParse(rawArgs);
      return args.success
        ? await getDelegatedTaskCoordinator().getParentLink(args.data)
        : null;
    },
  );

  ipcMain.handle("delegations:detach", async (_event, rawArgs: unknown) => {
    const args = DelegatedTaskDetachArgsSchema.safeParse(rawArgs);
    return args.success
      ? await getDelegatedTaskCoordinator().detach(args.data)
      : invalidDelegatedTaskResponse();
  });
}
