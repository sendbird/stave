import { resolveSourceControlDiffPaths } from "@/lib/source-control-diff";
import {
  getSourceControlDisplayCode,
  hasSourceControlConflicts,
  hasSourceControlStagedChanges,
  hasSourceControlUnstagedChanges,
  isSourceControlUntracked,
  type SourceControlStatusItem,
} from "@/lib/source-control-status";

export interface ExplorerNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children: ExplorerNode[];
}

export interface ExplorerIndex {
  tree: ExplorerNode[];
  folderPaths: string[];
  topFolders: string[];
}

export interface SourceControlItemViewModel {
  item: SourceControlStatusItem;
  canDiscard: boolean;
  canStage: boolean;
  canUnstage: boolean;
  directoryLabel: string;
  displayCode: string;
  fileName: string;
  hasMixedChanges: boolean;
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
  isConflict: boolean;
  isUntracked: boolean;
  pathDetail: string;
  pathLabel: string;
  sectionId: SourceControlSectionId;
}

export type SourceControlSectionId =
  | "conflicted"
  | "mixed"
  | "unstaged"
  | "staged"
  | "untracked";

export interface SourceControlSection {
  badgeVariant: "destructive" | "outline" | "success" | "warning";
  description: string;
  id: SourceControlSectionId;
  items: SourceControlItemViewModel[];
  title: string;
}

export interface SourceControlSummary {
  committableCount: number;
  conflictCount: number;
  mixedCount: number;
  stagedCount: number;
  totalCount: number;
  unstagedCount: number;
  untrackedCount: number;
  workingTreeCount: number;
}

const SOURCE_CONTROL_SECTION_ORDER: SourceControlSectionId[] = [
  "conflicted",
  "mixed",
  "unstaged",
  "staged",
  "untracked",
];

const SOURCE_CONTROL_SECTION_META: Record<
  SourceControlSectionId,
  Pick<SourceControlSection, "badgeVariant" | "description" | "id" | "title">
> = {
  conflicted: {
    id: "conflicted",
    title: "Conflicts",
    description: "Files that need resolution before the tree is clean.",
    badgeVariant: "destructive",
  },
  mixed: {
    id: "mixed",
    title: "Partially Staged",
    description: "These files have both staged and unstaged edits.",
    badgeVariant: "warning",
  },
  unstaged: {
    id: "unstaged",
    title: "Working Tree",
    description: "Tracked files with local edits that are not staged yet.",
    badgeVariant: "warning",
  },
  staged: {
    id: "staged",
    title: "Staged",
    description: "These changes are ready to be included in the next commit.",
    badgeVariant: "success",
  },
  untracked: {
    id: "untracked",
    title: "Untracked",
    description: "Files not yet added to Git.",
    badgeVariant: "outline",
  },
};

export function normalizeRelativeInputPath(args: { value: string }) {
  const normalized = args.value.trim().replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (!normalized || normalized.startsWith("/")) {
    return null;
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  if (parts.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  return parts.join("/");
}

export function collectAncestorFolders(args: { path: string }) {
  const folders: string[] = [];
  let current = "";
  for (const segment of args.path.split("/").filter(Boolean)) {
    current = current ? `${current}/${segment}` : segment;
    folders.push(current);
  }
  return folders;
}

export function getExplorerExpandedPathsAfterCreate(args: {
  path: string;
  type: "file" | "folder";
}) {
  if (args.type === "folder") {
    return collectAncestorFolders({ path: args.path });
  }

  const parentPath = args.path.split("/").slice(0, -1).join("/");
  return collectAncestorFolders({ path: parentPath });
}

export function buildExplorerIndex(args: { files: string[]; filter?: string }): ExplorerIndex {
  const root: ExplorerNode = { name: "root", path: "", type: "folder", children: [] };
  const normalizedFilter = args.filter?.trim().toLowerCase() ?? "";
  const folders = new Map<string, ExplorerNode>([["", root]]);
  const topFolders = new Set<string>();

  for (const filePath of args.files) {
    const parts = filePath.split("/").filter(Boolean);
    if (parts[0]) {
      topFolders.add(parts[0]);
    }
    let parentPath = "";
    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      if (!name) {
        continue;
      }
      const path = parentPath ? `${parentPath}/${name}` : name;
      const isFile = index === parts.length - 1;
      if (folders.has(path)) {
        parentPath = path;
        continue;
      }
      const parent = folders.get(parentPath);
      if (!parent) {
        break;
      }

      const node: ExplorerNode = {
        name,
        path,
        type: isFile ? "file" : "folder",
        children: [],
      };
      parent.children.push(node);
      if (!isFile) {
        folders.set(path, node);
      }
      parentPath = path;
    }
  }

  const sortTree = (node: ExplorerNode) => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) {
      if (child.type === "folder") {
        sortTree(child);
      }
    }
  };
  sortTree(root);

  const filterNode = (node: ExplorerNode): ExplorerNode | null => {
    if (!normalizedFilter) {
      return node;
    }
    if (node.type === "file") {
      return node.path.toLowerCase().includes(normalizedFilter) ? node : null;
    }
    const children = node.children.map(filterNode).filter(Boolean) as ExplorerNode[];
    if (children.length > 0 || node.path.toLowerCase().includes(normalizedFilter)) {
      return { ...node, children };
    }
    return null;
  };

  const tree = root.children.map(filterNode).filter(Boolean) as ExplorerNode[];
  const folderPaths: string[] = [];

  const collectFolderPaths = (node: ExplorerNode) => {
    if (node.type !== "folder") {
      return;
    }
    folderPaths.push(node.path);
    for (const child of node.children) {
      collectFolderPaths(child);
    }
  };

  for (const node of tree) {
    collectFolderPaths(node);
  }

  return {
    tree,
    folderPaths,
    topFolders: Array.from(topFolders),
  };
}

export function buildSourceControlItemViewModel(args: { item: SourceControlStatusItem }): SourceControlItemViewModel {
  const displayPath = resolveSourceControlDiffPaths({ rawPath: args.item.path });
  const workingTreeSegments = displayPath.workingTreePath.split("/").filter(Boolean);
  const fileName = workingTreeSegments.at(-1) ?? displayPath.workingTreePath ?? displayPath.displayPath;
  const directoryLabel = workingTreeSegments.length > 1
    ? workingTreeSegments.slice(0, -1).join("/")
    : "project root";
  const hasStagedChanges = hasSourceControlStagedChanges({ item: args.item });
  const hasUnstagedChanges = hasSourceControlUnstagedChanges({ item: args.item });
  const isConflict = hasSourceControlConflicts({ item: args.item });
  const isUntracked = isSourceControlUntracked({ item: args.item });
  const hasMixedChanges = hasStagedChanges && hasUnstagedChanges && !isConflict;

  let sectionId: SourceControlSectionId = "unstaged";
  if (isConflict) {
    sectionId = "conflicted";
  } else if (hasMixedChanges) {
    sectionId = "mixed";
  } else if (hasUnstagedChanges) {
    sectionId = "unstaged";
  } else if (hasStagedChanges) {
    sectionId = "staged";
  } else if (isUntracked) {
    sectionId = "untracked";
  }

  return {
    item: args.item,
    canDiscard: hasUnstagedChanges || isUntracked || isConflict,
    canStage: hasUnstagedChanges || isUntracked || isConflict,
    canUnstage: hasStagedChanges && !isConflict,
    directoryLabel,
    displayCode: getSourceControlDisplayCode({ item: args.item }),
    fileName,
    hasMixedChanges,
    hasStagedChanges,
    hasUnstagedChanges,
    isConflict,
    isUntracked,
    pathDetail: displayPath.headPath !== displayPath.workingTreePath
      ? `renamed from ${displayPath.headPath}`
      : directoryLabel,
    pathLabel: displayPath.displayPath,
    sectionId,
  };
}

export function buildSourceControlSummary(args: { items: SourceControlStatusItem[] }): SourceControlSummary {
  return args.items.reduce<SourceControlSummary>((summary, item) => {
    const hasStagedChanges = hasSourceControlStagedChanges({ item });
    const hasUnstagedChanges = hasSourceControlUnstagedChanges({ item });
    const isConflict = hasSourceControlConflicts({ item });
    const isUntracked = isSourceControlUntracked({ item });
    const hasMixedChanges = hasStagedChanges && hasUnstagedChanges && !isConflict;
    const hasCommittableChanges = hasStagedChanges && !isConflict;
    const hasWorkingTreeChanges = (hasUnstagedChanges && !isConflict) || isUntracked || isConflict;

    return {
      totalCount: summary.totalCount + 1,
      stagedCount: summary.stagedCount + (hasCommittableChanges ? 1 : 0),
      unstagedCount: summary.unstagedCount + ((hasUnstagedChanges && !isConflict) ? 1 : 0),
      untrackedCount: summary.untrackedCount + (isUntracked ? 1 : 0),
      conflictCount: summary.conflictCount + (isConflict ? 1 : 0),
      mixedCount: summary.mixedCount + (hasMixedChanges ? 1 : 0),
      committableCount: summary.committableCount + (hasCommittableChanges ? 1 : 0),
      workingTreeCount: summary.workingTreeCount + (hasWorkingTreeChanges ? 1 : 0),
    };
  }, {
    totalCount: 0,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    conflictCount: 0,
    mixedCount: 0,
    committableCount: 0,
    workingTreeCount: 0,
  });
}

export function buildSourceControlSections(args: { items: SourceControlStatusItem[] }): SourceControlSection[] {
  const sectionsById = new Map<SourceControlSectionId, SourceControlItemViewModel[]>();

  for (const item of args.items) {
    const viewModel = buildSourceControlItemViewModel({ item });
    const sectionItems = sectionsById.get(viewModel.sectionId) ?? [];
    sectionItems.push(viewModel);
    sectionsById.set(viewModel.sectionId, sectionItems);
  }

  return SOURCE_CONTROL_SECTION_ORDER
    .map((sectionId) => {
      const items = sectionsById.get(sectionId) ?? [];
      if (items.length === 0) {
        return null;
      }

      return {
        ...SOURCE_CONTROL_SECTION_META[sectionId],
        items,
      };
    })
    .filter(Boolean) as SourceControlSection[];
}
