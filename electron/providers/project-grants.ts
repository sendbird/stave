/**
 * Project grants: which project a coordinator turn may act for.
 *
 * Every turn on a project's coordinator task — one Stave started or one the
 * user sent — gets a project key. The project tools reach the host with it,
 * and the project runtime resolves the project from the key here. The model
 * never passes a project id, and a key whose turn ended resolves to nothing.
 *
 * Lives in the host service process beside the mission grants, because that
 * is where turns start.
 */
export interface ProjectGrant {
  projectId: string;
  taskId: string;
  turnId: string;
}

const grantsByKey = new Map<string, ProjectGrant>();
let coordinatorProjectByTask = new Map<string, string>();

/** Which tasks coordinate open projects; set by the project runtime. */
export function setProjectCoordinatorTasks(entries: ReadonlyArray<{ taskId: string; projectId: string }>) {
  coordinatorProjectByTask = new Map(entries.map((entry) => [entry.taskId, entry.projectId]));
}

/** The project a task coordinates, or null. */
export function projectIdForCoordinatorTask(taskId: string | undefined): string | null {
  const key = taskId?.trim();
  return key ? (coordinatorProjectByTask.get(key) ?? null) : null;
}

export function registerProjectGrant(args: ProjectGrant & { projectKey: string }) {
  const { projectKey, ...grant } = args;
  grantsByKey.set(projectKey, grant);
  return {
    revoke() {
      if (grantsByKey.get(projectKey) === grant) grantsByKey.delete(projectKey);
    },
  };
}

export function resolveProjectGrant(projectKey: string): ProjectGrant | null {
  const key = projectKey.trim();
  return key ? (grantsByKey.get(key) ?? null) : null;
}

export function clearProjectGrantsForTest() {
  grantsByKey.clear();
  coordinatorProjectByTask = new Map();
}
