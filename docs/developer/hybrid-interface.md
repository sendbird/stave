# Hybrid interface contracts

## Product review correction

The hybrid layer below is an intermediate implementation inventory, not a
completed design-system adoption. The input-adjacent collaboration shortcuts
and actor-based inspector tabs were rejected. Do not replicate them. Current
turn activity, assignment conversations and historical artifacts need access
through their owning workflow. The route-local Fleet/Tasks alias switcher has
been removed; keep canonical product names and destinations. Whole-product
navigation may change when it improves an evidenced user task. A standalone
knowledge destination requires a distinct retrieval/reuse job before inclusion.

These corrections supersede contradictory placement prescriptions below.

The interface is migrating by complete product surfaces: product navigation,
attention, task collaboration, reusable work, and workspace direction. Existing
UI primitives remain available while compound product surfaces move to
`src/components/system`. This is a whole-product migration; collaboration is
one consumer of the shared behavior and theme contracts.

## Ownership

- Base UI owns keyboard behavior, semantics, focus, and controlled tabs/buttons.
- StyleX compiles primitive styles and the semantic theme bridge at build time.
- Existing theme definitions remain the only source of color values. The bridge
  in `src/components/system/ads-theme.ts` maps those roles to canonical variables rather than defining a second palette.
- Tailwind composes product layout and the existing shadcn components. Product
  code chooses primitive size, weight, and tone through props.

StyleX emits unlayered atomic rules in both renderer builds. This is deliberate:
late-injected development CSS must not register layers before the reset and lose
its padding, borders, or typography. Do not enable layered output without an
explicit ordering contract shared by development and production. The browser
and Electron checks assert computed control dimensions, not just class names.
Bun tests compile this layer with the same StyleX compiler through
`tests/stylex-preload.ts`; do not mock away the compiler contract.

## Primitive contract

| Primitive        | Contract                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NavigationItem   | 36/40 px destination control, accessible label, current-page semantics, collapsed icon support and visible focus                                                                     |
| ActionButton     | 28/32/36/40 px minimum height; primary/secondary/quiet weight; independent danger tone; pending and disabled state; visible keyboard focus                                           |
| SectionTabs      | Controlled selection, arrow-key navigation, named tablist, inactive panels unmounted unless an editable draft explicitly requires retention, horizontal overflow within narrow panes |
| WorkspaceSurface | Heading, purpose, actions, body; wrapping header and bounded parent scrolling                                                                                                        |
| StatusBadge      | Text labels plus semantic tone; never color-only state                                                                                                                               |
| ChoiceChips      | One exclusive choice, one Tab entry, arrow-key selection, visible theme focus, wrapping options and disabled semantics; preserves default/undefined domain values                    |
| OptionButton     | Compact or comfortable wrapping selection row; explicit pressed state and theme-backed selection/focus; used by execution model menus                                                |
| SelectionRail    | Vertical category tabs inside the existing Base UI tab root; accessible labels, counts, keyboard navigation and compact icon treatment                                               |

Use 4/8/12/16/24 px spacing roles. Keep existing custom theme semantics, contrast
presets, and reduced-motion preferences. Add new semantic roles only through the
complete theme contract. Avoid utility overrides of primitive internals.

## Collaboration behavior

Turn Activity contains only live and retained turn activity. Task Results and
Task Collaboration are distinct right-rail destinations; the task tab context
menu opens either for that exact task. There is no composer shortcut row and no
second inspector-tab store. Record views load only while their destination is
mounted; changing task identity remounts the view. Delayed listings remain
invalidated when scope changes or a listing is disabled. No extra transcript
store is created. Collaboration uses separated task, consultation and worker
sections without category tabs or a containing surface card. Assignments and
answers are visible; execution metadata remains secondary disclosure.

Advisor exchanges prefer retained runtime snapshots. When unavailable, the panel
projects question/answer tool pairs from the loaded canonical conversation.
Worker rows show bounded assignments, returned outputs, and reported progress.
Requested preference, selected target, and runtime-reported model are distinct.
An absent runtime model stays unreported; narrative selection reasons appear
only when recorded by the selection producer.
They do not invent a provider-native worker transcript or expose grant-bearing
raw inputs. Reports include their coverage limits and are downloaded explicitly.

Cross-provider work uses the existing durable child coordinator. Native workers
retain their provider-specific boundaries. A child follow-up must carry its
current identity and explicit permissions; stale controls fail closed. Parent
context explains how to collect the latest child answer and request clarification.
A finished run remains distinct from reviewed or verified work.

## Navigation and reusable work

Existing project/task lists remain the primary navigation. Fleet and Tasks keep
their existing placement and visibility preferences. Workspace Information holds
the maintained goal, completion conditions, decisions, evidence, and next action.
Automation opens a library of workflows, macros, task presets and workspace tools,
with schedules and run history alongside it. These are optional destinations, not mandatory steps before working.

The library is usable before project selection. Actions explain when a project
is required. Workflow and macro actions append to an editable draft, creating a
task when needed; they never send the prompt. Presets store model, provider and
effort in the new task's draft overrides, leaving other tasks and global defaults
unchanged. Each action rechecks its workspace identity at invocation time.

## Workspace tools and resumption

Workspace tools separate long-running processes, one-off commands, event triggers,
and recent runs. Each view explains its role. Process and command drafts stay
mounted when switching views; saving a command never runs it. Tabs wrap in narrow
panes so all destinations remain visible. Advanced configuration stays available
from the panel header.

The empty task surface offers the maintained next action as an editable prompt,
with direct access to its goal and evidence. Lens introduces page navigation,
development servers, annotation, diagnostics and evidence capture before a page
is opened. Loading failures offer retry and address correction. Result review
links to current changes, documents and maintained direction; those links do not
claim to be immutable artifacts from the selected run.

## Save and recovery feedback

Workspace snapshots are serialized per workspace. Explicit saves supersede old
debounce values and wait for in-flight writes. Rejected values remain pending
for a retry, and automatic saves do not create unhandled rejections. A persistent
notice offers retry while changes are unsaved. Quit acknowledgement includes
pending and in-flight background workspace writes. A successful older write
cannot evict messages that arrived while it was in flight.

Maintained direction and unsaved direction drafts use distinct durable records.
Opening a task reads its notifications; reviewing a result is a separate explicit,
reversible action stored independently of notification cleanup.

## Verification and remaining migration

Use the collaboration preview and browser contract tests for narrow/light/dark
layout, keyboard navigation, computed metrics, and uncertain delivery. Native
Electron tests cover product navigation, the library-to-task path, rejected
workspace writes and retry, direction recovery, and result-review persistence.
Theme, provider and child lifecycle contracts remain required alongside them.

Continue migrating workspace tool detail/actions and composer option panels.
Measure each surface before and after; keep terminal and Lens lifecycle ownership
separate from their chrome. Long-session memory, bounded full-history retrieval,
peer messaging and exact artifact validation remain distinct acceptance work.

## Composer choices and activity ownership

The main model picker shows the effective model and reasoning effort above its
provider categories. The model/effort matrix remains directly selectable;
runtime-backed provider configurations, catalog refresh and errors, hidden
models, automatic routing, and keyboard shortcuts retain their contracts.
Provider selection colors resolve through existing theme tokens. Model, Fast,
and expanded-context controls remain separate buttons in their existing lane.

Advisor and Worker effort rows share `ChoiceChips`; their model rows share
`OptionButton`. The general-purpose model dialog uses the same effort choice.
Higher effort allows more reasoning and can take longer; the interface does not
promise better results from that setting alone. Selecting a model never sends
the prompt or discards its draft.

`TurnActivity` gates its active child before subscribing to task messages,
runtime activity, or child listings. Changing placement unmounts the former
host's projections and effects. The active host preserves tool navigation,
intervention controls, retained outcomes and the user's expansion preference.

## Principal work surface migration

Begin the next interface package after the current start, save/retry, tool output,
and restart paths pass in the built app and their response costs are recorded.
Do not postpone the design system until every infrastructure backlog item is
closed. Performance qualification continues alongside the migration; passing
functional checks does not establish a release performance budget.

Treat composing, choosing execution settings, locating work, and inspecting task
activity as one user journey. The prompt and its attached context are the primary
action. Show the effective model, effort, permissions, project, and workspace
before sending. Preserve task-specific drafts and settings, split-pane identity,
provider capabilities, and advanced controls. Ready providers become available
independently; failed discovery retains the last known state, and changed binary
settings invalidate responses from the old configuration.

The implementation owners are `ChatInput.tsx`, the `ai-elements/prompt-input*`
and model selector components, `composer-workspace-bar.tsx`, `TurnActivity.tsx`,
`TurnActivityPanel.tsx`, and the workspace pane host. Shared behavior and styles
belong in the system layer; product-specific composition stays with these owners.
Inspect existing task activity and collaboration projections together before
adding another competing progress summary or transcript subscription.

Preserve the established composer control lanes, separate model/Fast/context
controls, configurable activity placement, and shared overflow menu beside
Runtime. Keep project and branch orientation when optional wings are collapsed.
Changing primitive internals must not reset user preferences or silently change
the execution target. Running, waiting for the user, stopped, failed, returned,
and reviewed must remain distinguishable with their real supported actions.

Capture prompt input latency, input-ready task/workspace switching, activity
update cost, idle CPU, and process memory on the same workload before and after
each principal surface migration. Keep row-local subscriptions and bounded
projections; do not retain every hidden view or discard history to improve a
headline number. Test themes, narrow/wide layouts, keyboard behavior, and reduced
motion as part of the migrated surface, then move to the next product outcome.

The current source and compatibility contract is documented in [Stave design system](design-system.md).
