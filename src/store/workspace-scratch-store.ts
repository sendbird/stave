import { create } from "zustand";
import type { WorkspaceScratchListing } from "@/lib/workspace-scratch";
import { scratchListingSignature } from "@/lib/workspace-scratch-view";

/**
 * The Scratch panel's listings and what the user has seen, by workspace.
 * Session state only: kept out of the app store because it changes every
 * poll, and nothing about it is saved.
 */
export interface WorkspaceScratchSnapshot extends WorkspaceScratchListing {
  signature: string;
}

/**
 * Files written before Stave started (or before the user first looked) do not
 * light the rail dot; only files newer than what the user has seen do.
 */
const SESSION_STARTED_AT = Date.now();

interface WorkspaceScratchState {
  listingByWorkspace: Readonly<Record<string, WorkspaceScratchSnapshot | undefined>>;
  /** The newest file time the user has seen in the panel, by workspace. */
  seenMtimeByWorkspace: Readonly<Record<string, number | undefined>>;
  /** Stores a listing unless it draws the same as the current one; returns whether it changed. */
  applyListing: (workspaceId: string, listing: WorkspaceScratchListing) => boolean;
  /** The user saw the panel with files up to `mtimeMs`. */
  markSeen: (workspaceId: string, mtimeMs: number) => void;
}

export const useWorkspaceScratchStore = create<WorkspaceScratchState>((set, get) => ({
  listingByWorkspace: {},
  seenMtimeByWorkspace: {},
  applyListing: (workspaceId, listing) => {
    const signature = scratchListingSignature(listing);
    if (get().listingByWorkspace[workspaceId]?.signature === signature) return false;
    set((state) => ({
      listingByWorkspace: { ...state.listingByWorkspace, [workspaceId]: { ...listing, signature } },
    }));
    return true;
  },
  markSeen: (workspaceId, mtimeMs) => {
    if ((get().seenMtimeByWorkspace[workspaceId] ?? 0) >= mtimeMs) return;
    set((state) => ({
      seenMtimeByWorkspace: { ...state.seenMtimeByWorkspace, [workspaceId]: mtimeMs },
    }));
  },
}));

/** The newest file time in a workspace's last listing, or 0. */
export function selectScratchNewestMtime(state: WorkspaceScratchState, workspaceId: string): number {
  return state.listingByWorkspace[workspaceId]?.files[0]?.mtimeMs ?? 0;
}

/** Whether the workspace has a file newer than the user last saw. A boolean, so selector-stable. */
export function selectScratchHasUnseen(state: WorkspaceScratchState, workspaceId: string): boolean {
  const newest = selectScratchNewestMtime(state, workspaceId);
  const seen = state.seenMtimeByWorkspace[workspaceId] ?? SESSION_STARTED_AT;
  return newest > seen;
}
