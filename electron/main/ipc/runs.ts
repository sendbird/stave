import { ipcMain } from "electron";
import {
  SecondaryRunExecuteResponseSchema,
  SecondaryRunTransitionResponseSchema,
} from "../../../src/lib/runs/secondary-run";
import { ChildTaskListArgsSchema } from "../../../src/lib/runs/child-task";
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
  ipcMain.handle("runs:list-child-tasks", async (_event, rawArgs: unknown) => {
    const args = ChildTaskListArgsSchema.safeParse(rawArgs);
    return args.success ? await getChildTaskCoordinator().list(args.data) : [];
  });
}
