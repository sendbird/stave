import { invokeHostService } from "../host-service-client";
import { ensurePersistenceReady } from "../state";
import { createSecondaryRunCoordinator } from "./secondary-run-coordinator";

/** One main-owned execution map for renderer requests and resident consumers. */
export const secondaryRunCoordinator = createSecondaryRunCoordinator({
  getLedger: ensurePersistenceReady,
  executeHost: (request) => invokeHostService("runs.execute-secondary", request),
  cancelHost: (request) => invokeHostService("runs.cancel-secondary", request),
});
