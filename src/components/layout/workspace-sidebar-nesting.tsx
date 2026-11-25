import * as stylex from "@stylexjs/stylex";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Checkbox } from "@/components/aui/components/Checkbox";
import type { WorkState } from "@/components/aui/components/state-vocabulary";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Button } from "@/components/ui";
import { useTranslation } from "@/i18n";
import type { RunStatus } from "@/lib/runs/run-domain";
import {
  buildDelegatedWorkspaceTree,
  flattenDelegatedWorkspaceTree,
  listDelegatedDescendants,
  type DelegatedWorkspaceTree,
  type NestedWorkspaceEntry,
} from "@/lib/workspace-delegation-tree";
import type { RepositorySidebarCollapsedRepositoryView, RepositorySidebarWorkspaceView } from "./RepositoryWorkspaceSidebar.utils";
import { useDelegatedWorkspaceLinks } from "./useDelegatedWorkspaceLinks";

/**
 * Workspaces Stave created for delegated children nest under the workspace
 * that delegated them in the Projects tree (`RepositoryWorkspaceSidebar.tsx`).
 * The relationship is read from the run ledger (`workspace-delegation-tree.ts`);
 * collapse is session-local, like a repository's.
 */
type Repository = RepositorySidebarCollapsedRepositoryView;
export type NestedSidebarWorkspace = NestedWorkspaceEntry<RepositorySidebarWorkspaceView>;

const EMPTY_TREES = new Map<string, DelegatedWorkspaceTree>();

export function useDelegatedWorkspaceNesting(args: { repositories: readonly Repository[]; visibleRepositories: readonly Repository[] }) {
  const [collapsedById, setCollapsedById] = useState<Record<string, boolean>>({});
  const workspaceKey = useMemo(
    () => args.repositories.map((repository) => repository.workspaces.map((workspace) => workspace.id).join(",")).join("|"),
    [args.repositories],
  );
  const links = useDelegatedWorkspaceLinks(workspaceKey);
  // Built over every listed workspace, so a search that hides a parent shows its child top-level.
  const treeByRepositoryPath = useMemo(() => links.length === 0 ? EMPTY_TREES : new Map(args.repositories.map((repository) => [
    repository.repositoryPath,
    buildDelegatedWorkspaceTree({ workspaceIds: repository.workspaces.map((workspace) => workspace.id), links }),
  ])), [args.repositories, links]);
  const entriesByRepositoryPath = useMemo(() => new Map(args.visibleRepositories.map((repository) => [
    repository.repositoryPath,
    flattenDelegatedWorkspaceTree({
      items: repository.workspaces,
      tree: treeByRepositoryPath.get(repository.repositoryPath) ?? { parentById: new Map(), linkById: new Map() },
      collapsedById,
    }),
  ])), [args.visibleRepositories, collapsedById, treeByRepositoryPath]);
  /** Repositories with their rows in display order, collapsed children left out: the rail and shortcuts follow it. */
  const displayRepositories = useMemo(() => args.repositories.map((repository) => {
    const tree = treeByRepositoryPath.get(repository.repositoryPath);
    if (!tree || tree.parentById.size === 0) return repository;
    return { ...repository, workspaces: flattenDelegatedWorkspaceTree({ items: repository.workspaces, tree, collapsedById }).map((entry) => entry.item) };
  }), [args.repositories, collapsedById, treeByRepositoryPath]);
  const toggle = useCallback((workspaceId: string) => {
    setCollapsedById((current) => ({ ...current, [workspaceId]: !current[workspaceId] }));
  }, []);
  /**
   * Workspaces nested under `workspaceId` in its repository, deepest first: the
   * order to archive them in. Read from every listed workspace, not the rows a
   * search shows, so archiving a parent never leaves a hidden child behind.
   */
  const descendantsOf = useCallback((repository: Repository, workspaceId: string) => {
    const tree = treeByRepositoryPath.get(repository.repositoryPath);
    if (!tree) return [];
    const listed = args.repositories.find((candidate) => candidate.repositoryPath === repository.repositoryPath) ?? repository;
    const names = new Map(listed.workspaces.map((workspace) => [workspace.id, workspace.name]));
    return listDelegatedDescendants(tree, workspaceId).reverse().flatMap((id) => names.has(id) ? [{ id, name: names.get(id)! }] : []);
  }, [args.repositories, treeByRepositoryPath]);
  return { entriesByRepositoryPath, displayRepositories, toggle, descendantsOf };
}

/**
 * Keyboard reorder among top-level rows. The registry keeps nested rows in its
 * order too, so moving one step there could swap with a row shown elsewhere;
 * this moves past the previous or next top-level row instead.
 */
export function topLevelReorderSteps(args: {
  entries: readonly NestedSidebarWorkspace[];
  workspaces: readonly { id: string }[];
  workspaceId: string;
  direction: "up" | "down";
}): { steps: number; position: number; total: number } | null {
  const topLevel = args.entries.filter((entry) => entry.depth === 0);
  const index = topLevel.findIndex((entry) => entry.item.id === args.workspaceId);
  const neighbour = topLevel[index + (args.direction === "up" ? -1 : 1)];
  if (index < 0 || !neighbour) return null;
  const from = args.workspaces.findIndex((workspace) => workspace.id === args.workspaceId);
  const to = args.workspaces.findIndex((workspace) => workspace.id === neighbour.item.id);
  if (from < 0 || to < 0) return null;
  return { steps: Math.abs(to - from), position: index + (args.direction === "up" ? 0 : 2), total: topLevel.length };
}

/** The delegation's phase in the shared state vocabulary, for a nested row's status mark. */
export function delegationWorkState(phase: RunStatus | undefined): WorkState | undefined {
  switch (phase) {
    case "pending": return "queued";
    case "running": return "working";
    case "waiting": return "waiting";
    case "completed": return "ready";
    case "failed": return "failed";
    case "cancelled": return "stopped";
    case "interrupted": return "halted";
    default: return undefined;
  }
}

export const nestedWorkspaceIndent = stylex.create({
  0: {},
  1: { marginInlineStart: vars["--aui-space-16"] },
  2: { marginInlineStart: vars["--aui-space-32"] },
});

/** Shows or hides the workspaces nested under a row; the count is every nested workspace. */
export function WorkspaceChildrenToggle(args: { workspaceId: string; workspaceName: string; count: number; collapsed: boolean; onToggle: (workspaceId: string) => void }) {
  const { t } = useTranslation(["workspace"]);
  const label = t(args.collapsed ? "repositoryWorkspaceSidebar.nesting.showChildren" : "repositoryWorkspaceSidebar.nesting.hideChildren", { count: args.count, name: args.workspaceName });
  const Icon = args.collapsed ? ChevronRight : ChevronDown;
  return (
    <Button type="button" variant="ghost" size="sm" xstyle={styles.toggle} aria-expanded={!args.collapsed} aria-label={label} title={label}
      data-testid={`workspace-children-toggle-${args.workspaceId}`} onClick={() => args.onToggle(args.workspaceId)}>
      <Icon aria-hidden="true" className={sx(styles.toggleIcon)} />
      <span className={sx(styles.toggleCount)}>{args.count}</span>
    </Button>
  );
}

/** Archive confirmation: the parent's nested workspaces, archived first with the same checks when chosen. */
export function ArchiveNestedWorkspacesOption(args: { nested: readonly { id: string; name: string }[]; checked: boolean; onCheckedChange: (checked: boolean) => void; failure: { name: string; reason: string } | null }) {
  const { t } = useTranslation(["workspace"]);
  if (args.nested.length === 0) return null;
  return (
    <div className={sx(styles.archiveBlock)} data-testid="archive-nested-workspaces">
      <Checkbox
        label={t("repositoryWorkspaceSidebar.nesting.archiveChildren", { count: args.nested.length })}
        description={t("repositoryWorkspaceSidebar.nesting.archiveChildrenDescription")}
        checked={args.checked}
        onCheckedChange={(value) => args.onCheckedChange(Boolean(value))}
      />
      <ul className={sx(styles.archiveList)}>
        {args.nested.map((child) => <li key={child.id} className={sx(styles.archiveItem)}>{child.name}</li>)}
      </ul>
      {args.failure ? (
        <p role="alert" className={sx(styles.archiveFailure)}>
          {t("repositoryWorkspaceSidebar.nesting.childArchiveFailed", { name: args.failure.name, reason: args.failure.reason })}
        </p>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  toggle: {
    alignItems: "center",
    borderRadius: vars["--aui-radius-control"],
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    flexShrink: 0,
    gap: vars["--aui-space-2"],
    height: vars["--aui-control-height-xs"],
    justifyContent: "center",
    minWidth: vars["--aui-control-height-xs"],
    paddingInline: vars["--aui-space-4"],
  },
  toggleIcon: {
    flexShrink: 0,
    height: vars["--aui-control-icon-size-sm"],
    width: vars["--aui-control-icon-size-sm"],
  },
  toggleCount: {
    fontSize: vars["--aui-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-medium"],
  },
  archiveBlock: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"] },
  archiveList: {
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-2"],
    margin: 0,
    maxHeight: "8rem",
    overflowY: "auto",
    paddingInlineStart: vars["--aui-space-24"],
  },
  archiveItem: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  archiveFailure: { color: vars["--aui-color-danger-text"], fontSize: vars["--aui-font-size-caption"], margin: 0 },
});
