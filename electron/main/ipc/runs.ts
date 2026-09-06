import { ipcMain } from "electron";
import {
  SecondaryRunExecuteResponseSchema,
  SecondaryRunTransitionResponseSchema,
} from "../../../src/lib/runs/secondary-run";
import {
  ChildTaskActionResponseSchema,
  ChildTaskDelegateArgsSchema,
  ChildTaskDetachArgsSchema,
  ChildTaskFollowUpArgsSchema,
  ChildTaskLinkArgsSchema,
  ChildTaskListArgsSchema,
  ChildTaskRetryArgsSchema,
  ChildTaskStopArgsSchema,
  describeChildTaskRejection,
} from "../../../src/lib/runs/child-task";
import { invokeHostService } from "../host-service-client";
import {
  getChildTaskCoordinator,
  reconcileChildTasks,
} from "../runs/child-task-coordinator-instance";
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

function invalidChildTaskResponse() {
  return ChildTaskActionResponseSchema.parse({
    accepted: false,
    duplicate: false,
    reason: "invalid-request",
    message: describeChildTaskRejection("invalid-request"),
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
  // Child tasks outlive the app, so restart recovery has to ask the live task
  // what happened instead of assuming the delegation died with the process.
  // Deliberately not awaited: handler registration must not wait on the host
  // service, and an unreconciled row stays visible as `running` until it is.
  void reconcileChildTasks();

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
  ipcMain.handle("runs:delegate-child-task", async (_event, rawArgs: unknown) => {
    const args = ChildTaskDelegateArgsSchema.safeParse(rawArgs);
    return args.success
      ? await getChildTaskCoordinator().delegate(args.data)
      : invalidChildTaskResponse();
  });

  ipcMain.handle("runs:list-child-tasks", async (_event, rawArgs: unknown) => {
    const args = ChildTaskListArgsSchema.safeParse(rawArgs);
    return args.success ? await getChildTaskCoordinator().list(args.data) : [];
  });

  // The parent's own controls. Each one carries the identity its row was
  // rendered against, so the coordinator can refuse a click prepared against a
  // delegation that has since moved on rather than apply it to whatever
  // replaced it.
  ipcMain.handle(
    "runs:follow-up-child-task",
    async (_event, rawArgs: unknown) => {
      const args = ChildTaskFollowUpArgsSchema.safeParse(rawArgs);
      return args.success
        ? await getChildTaskCoordinator().followUp(args.data)
        : invalidChildTaskResponse();
    },
  );

  ipcMain.handle("runs:retry-child-task", async (_event, rawArgs: unknown) => {
    const args = ChildTaskRetryArgsSchema.safeParse(rawArgs);
    return args.success
      ? await getChildTaskCoordinator().retry(args.data)
      : invalidChildTaskResponse();
  });

  ipcMain.handle("runs:stop-child-task", async (_event, rawArgs: unknown) => {
    const args = ChildTaskStopArgsSchema.safeParse(rawArgs);
    return args.success
      ? await getChildTaskCoordinator().stop(args.data)
      : invalidChildTaskResponse();
  });

  // Seen from the child's side: which delegation, if any, owns this task.
  ipcMain.handle(
    "runs:get-child-task-link",
    async (_event, rawArgs: unknown) => {
      const args = ChildTaskLinkArgsSchema.safeParse(rawArgs);
      return args.success
        ? await getChildTaskCoordinator().getParentLink(args.data)
        : null;
    },
  );

  ipcMain.handle("runs:detach-child-task", async (_event, rawArgs: unknown) => {
    const args = ChildTaskDetachArgsSchema.safeParse(rawArgs);
    return args.success
      ? await getChildTaskCoordinator().detach(args.data)
      : invalidChildTaskResponse();
  });
}
