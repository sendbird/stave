import {
  WorkspaceResumeBriefDraftSchema,
  type WorkspaceResumeBriefDraft,
} from "./workspace-resume-brief";

const queues = new Map<string, Promise<unknown>>();
const key = (workspaceId: string) =>
  `stave:resume-brief-draft:v1:${workspaceId}`;

/** Serialize save/clear/read across panel unmounts so a late edit cannot restore a cleared draft. */
function ordered<T>(
  workspaceId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const pending = (queues.get(workspaceId) ?? Promise.resolve())
    .catch(() => {})
    .then(operation);
  queues.set(workspaceId, pending);
  void pending
    .finally(() => {
      if (queues.get(workspaceId) === pending) queues.delete(workspaceId);
    })
    .catch(() => {});
  return pending;
}

export function loadDirectionDraft(
  workspaceId: string,
): Promise<WorkspaceResumeBriefDraft | null> {
  return ordered(workspaceId, async () => {
    const persistence = window.api?.persistence;
    if (persistence) {
      if (!persistence.loadDirectionDraft)
        throw new Error("Draft storage is unavailable.");
      const response = await persistence.loadDirectionDraft({ workspaceId });
      if (!response.ok) throw new Error("Draft storage could not be read.");
      return response.draft === null
        ? null
        : WorkspaceResumeBriefDraftSchema.parse(response.draft);
    }
    const raw = window.localStorage.getItem(key(workspaceId));
    return raw ? WorkspaceResumeBriefDraftSchema.parse(JSON.parse(raw)) : null;
  });
}

export function saveDirectionDraft(
  workspaceId: string,
  draft: WorkspaceResumeBriefDraft | null,
): Promise<void> {
  const validated =
    draft === null ? null : WorkspaceResumeBriefDraftSchema.parse(draft);
  return ordered(workspaceId, async () => {
    const persistence = window.api?.persistence;
    if (persistence) {
      if (!persistence.saveDirectionDraft)
        throw new Error("Draft storage is unavailable.");
      const response = await persistence.saveDirectionDraft({
        workspaceId,
        draft: validated,
      });
      if (!response.ok) throw new Error("Draft save was not acknowledged.");
      return;
    }
    if (validated === null) window.localStorage.removeItem(key(workspaceId));
    else
      window.localStorage.setItem(key(workspaceId), JSON.stringify(validated));
  });
}
