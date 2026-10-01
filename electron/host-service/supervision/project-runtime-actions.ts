import { ProjectCommandError } from "../../../src/lib/projects/domain";
import type { ProjectInvokeResult } from "../../../src/lib/projects/api";
import type { HostProjectAction } from "../protocol";
import type { ProjectRuntime } from "./project-runtime";

/** Serializes a thrown refusal the way the host returns every project action. */
export async function invokeProjectRuntime<T>(work: () => Promise<T>): Promise<ProjectInvokeResult<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    if (error instanceof ProjectCommandError) return { ok: false, code: error.code, message: error.message };
    if (error && typeof error === "object" && "issues" in error) {
      return { ok: false, code: "invalid-args", message: "The project request was not valid." };
    }
    return { ok: false, code: "failed", message: error instanceof Error ? error.message : "The project request failed." };
  }
}

/** Routes a host `project.invoke` request to the runtime. */
export function invokeProjectAction(
  runtime: ProjectRuntime,
  action: HostProjectAction,
  args: unknown,
): Promise<ProjectInvokeResult<unknown>> {
  return invokeProjectRuntime(() => dispatchProject(runtime, action, args));
}

function dispatchProject(runtime: ProjectRuntime, action: HostProjectAction, args: unknown): Promise<unknown> {
  // The main process validates renderer arguments; tools pass their key.
  const value = (args ?? {}) as never;
  switch (action) {
    case "list":
      return runtime.list(value);
    case "get":
      return runtime.get(value);
    case "link-task":
      return runtime.linkTask(value);
    case "unlink-task":
      return runtime.unlinkTask(value);
    case "record-integration":
      return runtime.recordIntegration(value);
    case "create":
      return runtime.create(args);
    case "approve-proposal":
      return runtime.approveProposal(value);
    case "observe-issues":
      return runtime.observeIssues(value);
    case "message-coordinator":
      return runtime.messageCoordinator(value);
    case "reject-proposal":
      return runtime.rejectProposal(value);
    case "pause":
      return runtime.pause(value);
    case "resume":
      return runtime.resume(value);
    case "end":
      return runtime.end(value);
    case "update-settings":
      return runtime.updateSettings(value);
    case "set-memory-status":
      return runtime.setMemoryStatus(value);
    case "sync-playbooks":
      return runtime.syncPlaybooks(value);
    case "get-for-grant":
      return runtime.getForGrant(value);
    case "start-mission-for-grant":
      return runtime.startMissionForGrant(value);
    case "get-mission-report-for-grant":
      return runtime.getMissionReportForGrant(value);
    case "note-for-grant":
      return runtime.noteForGrant(value);
  }
}
