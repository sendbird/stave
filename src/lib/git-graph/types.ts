export type GraphRefType = "head" | "localBranch" | "remoteBranch" | "tag";

export interface GraphRef {
  type: GraphRefType;
  name: string; // e.g. "main", "origin/main", "v1.2.0"
  isHead: boolean;
}

export interface GraphCommit {
  hash: string;
  parents: string[];
  author: string;
  authorDate: string; // ISO 8601
  subject: string;
  refs: GraphRef[];
}

export interface GraphResult {
  ok: boolean;
  commits: GraphCommit[];
  head: string | null; // current branch name, or null when detached
  hasMore: boolean;
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
  /** Lane the edge travels in — reserved for the parent until its row. */
  toLane: number;
  /** Parent commit hash; the renderer resolves the destination node by hash. */
  toHash: string;
  color: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  laneCount: number;
}
