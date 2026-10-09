/**
 * Where a keybinding is live. Scopes form a tree rooted at `global` (the main
 * window). A child is live only while its parent is.
 *
 * `exclusiveGroup` marks siblings that can never be live together: the main
 * column shows exactly one of the workspace, Fleet, Issues, Schedules, Agents
 * or Usage, so their shortcuts may share keys.
 */
export const KEYBINDING_SCOPES = {
  global: { parent: null, exclusiveGroup: null },
  workspace: { parent: "global", exclusiveGroup: "main-column" },
  fleet: { parent: "global", exclusiveGroup: "main-column" },
  issues: { parent: "global", exclusiveGroup: "main-column" },
  schedules: { parent: "global", exclusiveGroup: "main-column" },
  agents: { parent: "global", exclusiveGroup: "main-column" },
  usage: { parent: "global", exclusiveGroup: "main-column" },
  settings: { parent: "global", exclusiveGroup: null },
  "command-palette": { parent: "global", exclusiveGroup: null },
  dialog: { parent: "global", exclusiveGroup: null },
  sidebar: { parent: "global", exclusiveGroup: null },
  composer: { parent: "workspace", exclusiveGroup: null },
  "task-pane": { parent: "workspace", exclusiveGroup: null },
  editor: { parent: "workspace", exclusiveGroup: null },
  lens: { parent: "workspace", exclusiveGroup: null },
  "git-graph": { parent: "workspace", exclusiveGroup: null },
} as const satisfies Record<
  string,
  { parent: string | null; exclusiveGroup: string | null }
>;

export type KeybindingScope = keyof typeof KEYBINDING_SCOPES;

/** The scope followed by its ancestors, ending at the root. */
export function getScopeChain(scope: KeybindingScope): KeybindingScope[] {
  const chain: KeybindingScope[] = [];
  let current: KeybindingScope | null = scope;
  while (current) {
    chain.push(current);
    current = KEYBINDING_SCOPES[current].parent;
  }
  return chain;
}

/** True when both scopes can be live at the same moment. */
export function scopesOverlap(left: KeybindingScope, right: KeybindingScope) {
  if (left === right) {
    return true;
  }
  const leftChain = getScopeChain(left);
  const rightChain = getScopeChain(right);
  if (leftChain.includes(right) || rightChain.includes(left)) {
    return true;
  }
  const common = leftChain.find((scope) => rightChain.includes(scope));
  if (!common) {
    return false;
  }
  const leftBranch = leftChain[leftChain.indexOf(common) - 1];
  const rightBranch = rightChain[rightChain.indexOf(common) - 1];
  if (!leftBranch || !rightBranch) {
    return true;
  }
  const leftGroup = KEYBINDING_SCOPES[leftBranch].exclusiveGroup;
  const rightGroup = KEYBINDING_SCOPES[rightBranch].exclusiveGroup;
  return !(leftGroup !== null && leftGroup === rightGroup);
}

/** True when `scope` is `ancestor` or sits inside it. */
export function isScopeWithin(
  scope: KeybindingScope,
  ancestor: KeybindingScope,
) {
  return getScopeChain(scope).includes(ancestor);
}
