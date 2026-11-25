import { z } from "zod";
import { RunStatusSchema } from "./runs/run-domain";

/**
 * A workspace Stave created for a delegated child (`stave_delegate_task` with a
 * `new-worktree` workspace), read from the run ledger: the delegation's run
 * owns the child workspace and its origin names the parent task, whose task
 * row names the parent workspace. A detached delegation, an archived or
 * deleted parent or child, and same-workspace delegations produce no link.
 *
 * Used by the sidebar nesting (`RepositoryWorkspaceSidebar.tsx`) and the
 * delegated-child cleanup (`electron/host-service/delegated-workspace-cleanup.ts`).
 */
const Id = z.string().min(1).max(4096);
export const DelegatedWorkspaceLinkSchema = z.object({
  childWorkspaceId: Id,
  parentWorkspaceId: Id,
  parentTaskId: Id,
  childTaskId: Id,
  /** The delegation step's status (`run-domain.ts`). */
  phase: RunStatusSchema,
  runId: Id,
  createdAt: z.string(),
}).strict();
export type DelegatedWorkspaceLink = z.infer<typeof DelegatedWorkspaceLinkSchema>;
export const DelegatedWorkspaceLinkListSchema = z.array(DelegatedWorkspaceLinkSchema).max(5000);

/** Rows past this depth keep their place under their own parent but stop indenting further. */
export const MAX_DELEGATED_WORKSPACE_INDENT = 2;

export interface DelegatedWorkspaceTree {
  /** Child workspace id → the workspace it nests under. */
  parentById: ReadonlyMap<string, string>;
  /** The link each nested workspace was derived from. */
  linkById: ReadonlyMap<string, DelegatedWorkspaceLink>;
}

const EMPTY_TREE: DelegatedWorkspaceTree = { parentById: new Map(), linkById: new Map() };

/**
 * Which listed workspaces nest under which. A link counts only when both ends
 * are in `workspaceIds` (one repository's live workspaces), so a child whose
 * parent is archived, deleted or elsewhere stays top-level. The first link of a
 * child wins (the ledger lists them oldest first) and a link that would close
 * a cycle is ignored.
 */
export function buildDelegatedWorkspaceTree(args: {
  workspaceIds: readonly string[];
  links: readonly DelegatedWorkspaceLink[];
}): DelegatedWorkspaceTree {
  if (args.links.length === 0 || args.workspaceIds.length < 2) return EMPTY_TREE;
  const listed = new Set(args.workspaceIds);
  const parentById = new Map<string, string>();
  const linkById = new Map<string, DelegatedWorkspaceLink>();
  for (const link of args.links) {
    const { childWorkspaceId: child, parentWorkspaceId: parent } = link;
    if (child === parent || !listed.has(child) || !listed.has(parent) || parentById.has(child)) continue;
    let ancestor: string | undefined = parent;
    while (ancestor !== undefined && ancestor !== child) ancestor = parentById.get(ancestor);
    if (ancestor === child) continue;
    parentById.set(child, parent);
    linkById.set(child, link);
  }
  return parentById.size === 0 ? EMPTY_TREE : { parentById, linkById };
}

export interface NestedWorkspaceEntry<T> {
  item: T;
  /** 0 for a top-level row. */
  depth: number;
  /** `depth` clamped to `MAX_DELEGATED_WORKSPACE_INDENT`. */
  indent: number;
  parentId: string | null;
  /** Every workspace nested under this one, at any depth. */
  descendantCount: number;
  collapsed: boolean;
  link: DelegatedWorkspaceLink | null;
}

/**
 * Display order: top-level rows in their given order, each followed by the
 * rows nested under it (in their given order, depth first). A row whose parent
 * is not in `items` (for example filtered out by search) is shown top-level.
 * Rows under a collapsed parent are left out.
 */
export function flattenDelegatedWorkspaceTree<T extends { id: string }>(args: {
  items: readonly T[];
  tree: DelegatedWorkspaceTree;
  collapsedById: Readonly<Record<string, boolean | undefined>>;
}): NestedWorkspaceEntry<T>[] {
  if (args.tree.parentById.size === 0) {
    return args.items.map((item) => ({ item, depth: 0, indent: 0, parentId: null, descendantCount: 0, collapsed: false, link: null }));
  }
  const present = new Set(args.items.map((item) => item.id));
  const childrenById = new Map<string, T[]>();
  const roots: T[] = [];
  for (const item of args.items) {
    const parent = args.tree.parentById.get(item.id);
    if (parent !== undefined && present.has(parent)) {
      const siblings = childrenById.get(parent);
      if (siblings) siblings.push(item);
      else childrenById.set(parent, [item]);
    } else {
      roots.push(item);
    }
  }
  const descendants = new Map<string, number>();
  const countDescendants = (id: string): number => {
    const known = descendants.get(id);
    if (known !== undefined) return known;
    const total = (childrenById.get(id) ?? []).reduce((sum, child) => sum + 1 + countDescendants(child.id), 0);
    descendants.set(id, total);
    return total;
  };
  const entries: NestedWorkspaceEntry<T>[] = [];
  const visit = (item: T, depth: number, parentId: string | null) => {
    const descendantCount = countDescendants(item.id);
    const collapsed = descendantCount > 0 && Boolean(args.collapsedById[item.id]);
    entries.push({
      item, depth, indent: Math.min(depth, MAX_DELEGATED_WORKSPACE_INDENT), parentId, descendantCount, collapsed,
      link: parentId === null ? null : args.tree.linkById.get(item.id) ?? null,
    });
    if (collapsed) return;
    for (const child of childrenById.get(item.id) ?? []) visit(child, depth + 1, item.id);
  };
  for (const root of roots) visit(root, 0, null);
  return entries;
}

/** Every workspace nested under `workspaceId`, nearest first, deepest last. */
export function listDelegatedDescendants(tree: DelegatedWorkspaceTree, workspaceId: string): string[] {
  const result: string[] = [];
  const queue = [workspaceId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [child, parent] of tree.parentById) {
      if (parent === current && !result.includes(child)) {
        result.push(child);
        queue.push(child);
      }
    }
  }
  return result;
}
