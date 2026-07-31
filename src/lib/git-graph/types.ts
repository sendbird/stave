export const MAX_GRAPH_SELECTED_REFS = 256;

export type GraphRefType = "head" | "localBranch" | "remoteBranch" | "tag";

export interface GraphRef {
  type: GraphRefType;
  /** Human-readable short ref name, for example `main`, `origin/main`, or `v1.2.0`. */
  name: string;
  /** Fully qualified revision when known, for example `refs/heads/main`. */
  revision?: string;
  isHead: boolean;
  /** Remote name for remote-tracking branches. */
  remote?: string;
  /** Whether a tag is annotated instead of lightweight. */
  annotated?: boolean;
}

export interface GraphRepositoryRef extends GraphRef {
  /** Commit targeted by the ref. Annotated tags are peeled to their commit. */
  hash: string;
  /** Fully qualified, unambiguous revision passed back to Git. */
  revision: string;
}

export interface GraphCommit {
  hash: string;
  parents: string[];
  author: string;
  authorEmail: string;
  authorDate: string; // ISO 8601
  committerDate: string; // ISO 8601
  subject: string;
  refs: GraphRef[];
}

export interface GraphWorkingTreeSummary {
  staged: number;
  unstaged: number;
  untracked: number;
  conflicts: number;
}

export interface GraphResult {
  ok: boolean;
  commits: GraphCommit[];
  /** Current branch name, or null while HEAD is detached. */
  head: string | null;
  headHash: string | null;
  availableRefs: GraphRepositoryRef[];
  workingTree: GraphWorkingTreeSummary;
  workingTreeAvailable: boolean;
  worktreePathByBranch: Record<string, string>;
  worktreePathsAvailable: boolean;
  hasMore: boolean;
  stderr: string;
}

export interface GraphFileChange {
  path: string;
  oldPath?: string;
  status: string;
  additions: number | null;
  deletions: number | null;
}

export interface GraphCommitSignature {
  status: string;
  key: string;
  signer: string;
}

export interface GraphCommitDetails {
  hash: string;
  parents: string[];
  subject: string;
  body: string;
  author: string;
  authorEmail: string;
  authorDate: string;
  committer: string;
  committerEmail: string;
  committerDate: string;
  signature: GraphCommitSignature | null;
  files: GraphFileChange[];
}

export interface GraphCommitDetailsResult {
  ok: boolean;
  details: GraphCommitDetails | null;
  stderr: string;
}

export interface GraphNode {
  hash: string;
  row: number; // vertical index (0-based)
  lane: number; // horizontal lane (0-based)
  color: number; // palette index
}

export interface GraphEdge {
  fromRow: number;
  fromLane: number;
  /** Destination node lane, or the final visible lane for an off-window parent. */
  toLane: number;
  /** Parent commit hash. */
  toHash: string;
  color: number;
}

export interface GraphSegment {
  fromRow: number;
  fromLane: number;
  toRow: number;
  toLane: number;
  /**
   * Whether the transition is anchored to its first endpoint. Rounded paths
   * keep this metadata so an angular graph style can be added without
   * rebuilding the layout.
   */
  lockedFirst: boolean;
  /** False only for the working-tree-to-HEAD portion of a path. */
  isCommitted: boolean;
}

export interface GraphBranch {
  id: number;
  color: number;
  segments: GraphSegment[];
}

export interface GraphLayout {
  nodes: GraphNode[];
  /**
   * Logical commit-to-parent relationships. Rendering uses `branches`, whose
   * row-by-row segments can move between lanes without losing branch identity.
   */
  edges: GraphEdge[];
  branches: GraphBranch[];
  laneCount: number;
}
