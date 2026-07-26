import { ipcMain } from "electron";
import {
  SecondaryRunExecuteResponseSchema,
  SecondaryRunTransitionResponseSchema,
} from "../../../src/lib/runs/secondary-run";
import { invokeHostService } from "../host-service-client";
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
}
