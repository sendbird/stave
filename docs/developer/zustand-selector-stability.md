# Zustand Selector Stability

This guide documents the renderer rule that matters most for React 19 + Zustand 5 in Stave:

**a Zustand selector must not manufacture a new snapshot every render unless the equality strategy explicitly supports it.**

If a selector returns a fresh object or array on every render, React can repeatedly force a store re-render and eventually crash with:

```text
Maximum update depth exceeded
```

## Scope

Apply this guidance to:

- `useAppStore(...)`
- any direct `useStore(...)` usage
- any custom hook built on `useSyncExternalStore`

## Default rule

Use selectors to read store state, not to build new containers.

- Safe by default:
  - primitives
  - existing object references from store state
  - existing array references from store state
  - tuple/object selectors wrapped with `useShallow`, when each returned value is itself stable
- Suspicious by default:
  - `{ ... }`
  - `[ ... ]` without `useShallow`
  - `.map(...)`
  - `.filter(...)`
  - `.slice(...)`
  - `new Map(...)`
  - `new Set(...)`
  - `() => ...`
  - `?? []`
  - `?? {}`

## Repo conventions

### 1. Prefer primitive or existing-reference selectors

Good:

```tsx
const activeTaskId = useAppStore((state) => state.activeTaskId);
const tasks = useAppStore((state) => state.tasks);
const activeTask = useAppStore((state) => state.tasks.find((task) => task.id === state.activeTaskId) ?? null);
```

Why this is acceptable:

- `activeTaskId` is a primitive
- `tasks` is the existing store array reference
- `.find(...)` returns an existing task object from the store, not a new cloned object

### 2. When selecting multiple values, use `useShallow`

Good:

```tsx
const [activeTaskId, activeTurnId, createTask] = useAppStore(useShallow((state) => [
  state.activeTaskId,
  state.activeTurnIdsByTask[state.activeTaskId],
  state.createTask,
] as const));
```

Prefer tuple selectors over object selectors because they make accidental object allocation more obvious.

### 3. Never build derived objects inside a plain selector

Bad:

```tsx
const pendingUserInput = useAppStore((state) => {
  const messages = state.messagesByTask[state.activeTaskId] ?? [];
  const lastMessage = messages.at(-1);
  if (!lastMessage) return null;
  const part = findLatestPendingUserInputPart({ message: lastMessage });
  if (!part) return null;
  return { messageId: lastMessage.id, part };
});
```

Why this is bad:

- `return { messageId, part }` creates a new object every render
- `?? []` creates a new fallback array every render

Good:

```tsx
const EMPTY_MESSAGES: ChatMessage[] = [];

const [pendingUserInputMessageId, pendingUserInputPart] = useAppStore(useShallow((state) => {
  const messages = state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES;
  const lastMessage = messages.at(-1);
  if (!lastMessage) {
    return [null, null] as const;
  }
  const part = findLatestPendingUserInputPart({ message: lastMessage });
  return [lastMessage.id, part ?? null] as const;
}));

const pendingUserInput = useMemo(() => {
  if (!pendingUserInputMessageId || !pendingUserInputPart) {
    return null;
  }
  return {
    messageId: pendingUserInputMessageId,
    part: pendingUserInputPart,
  };
}, [pendingUserInputMessageId, pendingUserInputPart]);
```

### 4. Derive filtered / mapped arrays after subscription

Bad:

```tsx
const visibleMessages = useAppStore((state) =>
  (state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES).filter((message) => !message.isPlanResponse)
);
```

Good:

```tsx
const messages = useAppStore((state) => state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES);
const visibleMessages = useMemo(
  () => messages.filter((message) => !message.isPlanResponse),
  [messages],
);
```

### 5. Use module-level empty fallbacks

Bad:

```tsx
const messages = useAppStore((state) => state.messagesByTask[state.activeTaskId] ?? []);
```

Good:

```tsx
const EMPTY_MESSAGES: ChatMessage[] = [];

const messages = useAppStore((state) => state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES);
```

Inline `[]` and `{}` fallbacks are new references. Module-level constants are stable.

### 6. Minimize render fan-out on list and tree surfaces

Selector stability is not enough on its own. A selector can be reference-stable and still be too broad for a hot surface.

On workspace lists, task tabs, message lists, and similar collection UIs:

- parent components should subscribe only to structural data needed to render the collection
- per-row or per-item runtime state should be read inside the row or item component when feasible
- broad parent subscriptions to store-wide maps should be treated as suspicious by default

Bad:

```tsx
const workspaceRuntimeCacheById = useAppStore((state) => state.workspaceRuntimeCacheById);

return workspaces.map((workspace) => (
  <WorkspaceRow
    key={workspace.id}
    workspace={workspace}
    runtimeState={workspaceRuntimeCacheById[workspace.id] ?? null}
  />
));
```

Why this is bad:

- any change anywhere in `workspaceRuntimeCacheById` can cause the parent list to re-render
- unrelated inactive rows get pulled into the same render fan-out
- hot transitions like workspace switching become more expensive than necessary

Better:

```tsx
function WorkspaceRow({ workspace }: { workspace: WorkspaceListItem }) {
  const runtimeState = useAppStore((state) => state.workspaceRuntimeCacheById[workspace.id] ?? null);
  return <WorkspaceRowView workspace={workspace} runtimeState={runtimeState} />;
}
```

Why this is better:

- the parent list subscribes only to the workspace collection structure
- each row subscribes only to its own keyed state
- changes in one row do not force unrelated rows through the same parent subscription

### 7. Prefer keyed row-local hooks when state changes at different rates

If the collection structure changes rarely but item status changes often, separate those concerns in the subscription model.

Good patterns:

- parent subscribes to `workspaces`, `taskIds`, or other structural lists
- row hook subscribes to `workspaceRuntimeCacheById[workspaceId]`
- row hook subscribes to `workspacePrInfoById[workspaceId]`
- tab component subscribes to `activeTurnIdsByTask[taskId]` or `messageCountByTask[taskId]`

Suspicious patterns:

- parent subscribes to `workspaceRuntimeCacheById` and passes slices down
- parent subscribes to `messagesByTask` and computes per-task badges inline
- parent subscribes to a large map only to read one entry per child

If a component is rendering a list of IDs or entities and then looking up per-item status from a store-wide registry, that lookup should usually move into the child.

## Review checklist

Before finishing any renderer work that touches Zustand subscriptions, scan selectors and ask:

1. Does this selector return a new object, array, function, `Map`, or `Set`?
2. Does it use `?? []`, `?? {}`, or another inline fallback allocation?
3. Does it call `.map()`, `.filter()`, `.slice()`, or object spread inside the selector?
4. If it returns multiple values, is it using `useShallow`?
5. Could the derived value be moved to `useMemo` after subscription instead?
6. Is a parent list subscribing to a large map or registry that changes more often than the list structure?
7. Can this collection subscribe to structure in the parent and move per-item state lookups into row or item components?
8. If one item's runtime state changes, would inactive siblings re-render because the parent owns the subscription?

If any answer is "yes", the selector is probably wrong for this repo.

## Authoring checklist for hot surfaces

Use this during implementation, not just during cleanup:

1. Identify which store values define the collection structure and which values are per-item runtime state.
2. Keep the parent subscription scoped to the structure unless there is a concrete reason not to.
3. Move per-item status, counters, badges, and activity state into keyed row or item hooks when feasible.
4. If a selector needs multiple fields for one row, assemble them inside a row-local hook with stable primitives or existing references.
5. Before shipping, ask whether one row updating would force unrelated rows, tabs, or panes to render.

## High-risk surfaces in Stave

Be especially strict in these files and flows:

- `src/components/session/ChatInput.tsx`
- `src/components/session/PlanViewer.tsx`
- `src/components/session/ChatPanel.tsx`
- `src/components/layout/ProjectWorkspaceSidebar.tsx`
- `src/components/layout/WorkspaceTaskTabs.tsx`
- plan mode entry / exit
- task switching
- workspace switching
- streaming session UI
- replay drawers / diagnostics surfaces

## Verification

After touching selector-heavy renderer code:

1. Run `bun run typecheck`.
2. Run the most relevant `bun test` targets.
3. Manually exercise the affected UI flow if it involves hot subscriptions, streaming, or task/workspace transitions.
4. If a render loop is suspected, enable the render profiler in `docs/developer/diagnostics.md`.
