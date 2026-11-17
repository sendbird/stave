import { resolve, sep } from "node:path";
import { realpathSync } from "node:fs";

type Owner = { workspaceId?: string; cwd?: string };
type Target = { workspaceId: string; workspacePath: string };

function canonicalPath(path: string) {
  try { return realpathSync(path); }
  catch { return resolve(path); }
}

function owns(target: Target, owner: Owner) {
  if (owner.workspaceId === target.workspaceId) return true;
  if (owner.workspaceId && !owner.cwd) return false;
  if (!owner.cwd) return true; // Unknown ownership must not permit an unsafe stop.
  const root = canonicalPath(target.workspacePath);
  const cwd = canonicalPath(owner.cwd);
  return cwd === root || cwd.startsWith(root.endsWith(sep) ? root : root + sep);
}

/** Host-owned admission barrier shared by all provider, script and PTY starts. */
export class WorkspaceExecutionGate {
  private suspended = new Map<string, Target & { stopping: boolean; failed: boolean }>();
  private active = new Set<Owner>();
  private archived: readonly Target[] | null = null;
  private deleted: Set<string> | null = null;
  private archiveVersion: number | undefined;
  private readVersion: (() => number) | undefined;
  private readDeleted: () => readonly string[] = () => [];
  private readArchived: () => readonly Target[] = () => [];

  /** Resolve durable archive ownership on every admission, including after restart. */
  setArchiveReader(reader: () => readonly Target[]) {
    this.readArchived = reader;
    this.invalidateArchives();
  }

  setArchiveVersionReader(reader: () => number) { this.readVersion = reader; this.archiveVersion = undefined; this.invalidateArchives(); }

  setDeletionReader(reader: () => readonly string[]) {
    this.readDeleted = reader;
    this.invalidateArchives();
  }

  invalidateArchives() { this.archived = null; this.deleted = null; }

  assertAllowed(owner: Owner) {
    if (!owner.workspaceId && !owner.cwd) return;
    const version = this.readVersion?.();
    if (version !== this.archiveVersion) { this.invalidateArchives(); this.archiveVersion = version; }
    this.deleted ??= new Set(this.readDeleted());
    if (owner.workspaceId && this.deleted.has(owner.workspaceId)) throw new Error("Workspace history has been permanently deleted.");
    this.archived ??= this.readArchived().map(target => ({ ...target, workspacePath: canonicalPath(target.workspacePath) }));
    const cwd = owner.cwd ? canonicalPath(owner.cwd) : undefined;
    if (this.archived.some(target => owner.workspaceId ? owner.workspaceId === target.workspaceId : cwd === target.workspacePath || cwd!.startsWith(target.workspacePath.endsWith(sep) ? target.workspacePath : target.workspacePath + sep))) {
      throw new Error("Workspace history is archived. Restore its branch before starting execution.");
    }
    if ([...this.suspended.values()].some((target) => owns(target, owner))) {
      throw new Error("Workspace execution is stopped. Resume it in Resource Manager first.");
    }
  }

  acquire(owner: Owner) {
    this.assertAllowed(owner);
    const lease = { ...owner };
    this.active.add(lease);
    return () => { this.active.delete(lease); };
  }

  isBusy(target: Target) {
    return [...this.active].some((owner) => owns(target, owner));
  }

  async stop(target: Target, close: () => Promise<void>) {
    const existing = this.suspended.get(target.workspaceId);
    if (existing?.stopping) throw new Error("Workspace is already stopping.");
    if ([...this.active].some((owner) => owns(target, owner))) {
      throw new Error("A task or script is running. Wait for it to finish before stopping this workspace.");
    }
    const state = { ...target, stopping: true, failed: false };
    this.suspended.set(target.workspaceId, state);
    try { await close(); }
    catch (error) { state.failed = true; throw error; }
    finally { state.stopping = false; }
    // A partial stop stays blocked until explicit resume; never restart silently.
  }

  resume(workspaceId: string) {
    if (this.suspended.get(workspaceId)?.stopping) throw new Error("Wait for workspace stop to finish.");
    this.suspended.delete(workspaceId);
  }

  snapshot() {
    return [...this.suspended.values()].map(({ workspaceId, stopping, failed }) => ({ workspaceId, stopping, failed }));
  }
}

export const workspaceExecutionGate = new WorkspaceExecutionGate();
