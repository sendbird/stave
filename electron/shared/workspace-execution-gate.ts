import { resolve, sep } from "node:path";
import { realpathSync } from "node:fs";

type Owner = { workspaceId?: string; cwd?: string };
type Target = { workspaceId: string; workspacePath: string };

function canonicalPath(path: string) {
  try { return realpathSync(path); }
  catch { return resolve(path); }
}

function owns(target: Target, owner: Owner) {
  if (owner.workspaceId) return owner.workspaceId === target.workspaceId;
  if (!owner.cwd) return true; // Unknown ownership must not permit an unsafe stop.
  const root = canonicalPath(target.workspacePath);
  const cwd = canonicalPath(owner.cwd);
  return cwd === root || cwd.startsWith(root.endsWith(sep) ? root : root + sep);
}

/** Host-owned admission barrier shared by all provider, script and PTY starts. */
export class WorkspaceExecutionGate {
  private suspended = new Map<string, Target & { stopping: boolean; failed: boolean }>();
  private active = new Set<Owner>();
  private readArchived: () => readonly Target[] = () => [];

  /** Resolve durable archive ownership on every admission, including after restart. */
  setArchiveReader(reader: () => readonly Target[]) {
    this.readArchived = reader;
  }

  assertAllowed(owner: Owner) {
    if (this.readArchived().some(target => owns(target, owner))) {
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
