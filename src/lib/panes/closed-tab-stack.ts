/**
 * The tabs a workspace closed most recently, newest last, so Cmd/Ctrl+Shift+T
 * can bring them back. Each workspace keeps its own bounded stack; the stack
 * lives for the session only.
 */

export const CLOSED_TAB_STACK_LIMIT = 20;

export type ClosedPaneTab =
  | { kind: "task"; taskId: string }
  | {
      kind: "editor";
      editorTabId: string;
      filePath: string;
      editorKind: "text" | "image";
    }
  | { kind: "git-graph"; editorTabId: string }
  | { kind: "lens"; url: string | null };

export type ClosedTabStack = readonly ClosedPaneTab[];

export function closedPaneTabEquals(left: ClosedPaneTab, right: ClosedPaneTab) {
  switch (left.kind) {
    case "task":
      return right.kind === "task" && right.taskId === left.taskId;
    case "editor":
      return right.kind === "editor" && right.filePath === left.filePath;
    case "git-graph":
      return right.kind === "git-graph";
    case "lens":
      // Lens tabs are recreated, not restored, so two closed tabs on the same
      // page are still two tabs.
      return false;
  }
}

/**
 * Put a closed tab on top. Closing the same target again moves it to the top
 * instead of keeping two copies, and the oldest entries fall off past `limit`.
 */
export function pushClosedTab(
  stack: ClosedTabStack,
  entry: ClosedPaneTab,
  limit = CLOSED_TAB_STACK_LIMIT,
): ClosedTabStack {
  const next = [
    ...stack.filter((existing) => !closedPaneTabEquals(existing, entry)),
    entry,
  ];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/** Per-workspace stacks, keyed by workspace id. */
export class ClosedTabRegistry {
  private readonly stacks = new Map<string, ClosedTabStack>();
  private readonly limit: number;

  constructor(limit = CLOSED_TAB_STACK_LIMIT) {
    this.limit = limit;
  }

  record(workspaceId: string, entry: ClosedPaneTab) {
    if (!workspaceId) {
      return;
    }
    this.stacks.set(
      workspaceId,
      pushClosedTab(this.stacks.get(workspaceId) ?? [], entry, this.limit),
    );
  }

  peek(workspaceId: string): ClosedTabStack {
    return this.stacks.get(workspaceId) ?? [];
  }

  /**
   * Take the newest entry that can still be reopened. Entries above it whose
   * target is gone (deleted task, removed file, tab already open again) are
   * dropped on the way, so they are not offered again. Each entry leaves the
   * stack before its check runs, so a tab closed during an async check is
   * kept.
   */
  async take(
    workspaceId: string,
    canReopen: (entry: ClosedPaneTab) => boolean | Promise<boolean>,
  ): Promise<ClosedPaneTab | null> {
    for (;;) {
      const stack = this.peek(workspaceId);
      const entry = stack[stack.length - 1];
      if (!entry) {
        return null;
      }
      this.stacks.set(workspaceId, stack.slice(0, -1));
      if (await canReopen(entry)) {
        return entry;
      }
    }
  }

  clear() {
    this.stacks.clear();
  }
}
