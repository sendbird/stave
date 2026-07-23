import type { HostRoutineAction } from "../host-service/protocol";
import type {
  RoutineRun,
  RoutineSnapshot,
  RoutineSpec,
  RoutineUpsertInput,
} from "../../src/lib/routines";
import type { WorkspaceInformationReferenceOption } from "../../src/lib/workspace-information-references";
import { invokeHostService } from "./host-service-client";

async function invokeRoutine<TResult>(
  action: HostRoutineAction,
  args: unknown,
) {
  return invokeHostService("routine.invoke", {
    action,
    args,
  }) as Promise<TResult>;
}

export function listRoutines() {
  return invokeRoutine<RoutineSnapshot>("list", {});
}

export function createRoutine(input: RoutineUpsertInput) {
  return invokeRoutine<RoutineSpec>("create", input);
}

export function updateRoutine(args: {
  id: string;
  input: RoutineUpsertInput;
}) {
  return invokeRoutine<RoutineSpec>("update", args);
}

export function removeRoutine(args: { id: string }) {
  return invokeRoutine<{ ok: true; id: string }>("remove", args);
}

export function setRoutineEnabled(args: {
  id: string;
  enabled: boolean;
}) {
  return invokeRoutine<RoutineSpec>("set-enabled", args);
}

export function runRoutineNow(args: { id: string }) {
  return invokeRoutine<RoutineRun>("run-now", args);
}

export function listRoutineInformationReferences(args: {
  workspaceId: string;
}) {
  return invokeRoutine<WorkspaceInformationReferenceOption[]>(
    "list-information-references",
    args,
  );
}
