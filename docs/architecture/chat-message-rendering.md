# Chat Message Rendering

This document defines the renderer contract for assistant messages in Stave.

## Goals

- Use one renderer path for both Claude and Codex assistant messages.
- Keep AI Elements semantics recognizable in code and UI.
- Show pre-answer execution flow as Chain of Thought.
- Show the final assistant response below that Chain of Thought.
- Avoid depending on persisted turn inspection data for normal message rendering.

The dev-only [Agent Message UX Catalog](agent-message-ux-catalog.md) records the
current Preview baseline and maps every normalized provider event to its visible
surface, persisted message part, or task-level state.

## Core Model

Assistant messages are rendered in two layers:

1. `AssistantTrace`
   - derived from `message.parts`
   - contains reasoning, tool, subagent, todo, diff, system-oriented steps, and any assistant text emitted before the final response boundary
2. `AssistantFinalResponse`
   - derived from the trailing `text` parts after the last trace-oriented part
   - when providers preserve multiple text segment boundaries in one turn, the
     last logical text segment is treated as the final response and earlier
     segments are interim commentary
   - rendered below the trace

The renderer does not split by provider. Claude and Codex both normalize into the
same `ChatMessage.parts` shape before UI rendering.

## Rendering Rules

- Top-level `ChainOfThought` is the primary pre-answer container.
- While the assistant turn is streaming, top-level `ChainOfThought` stays open.
- After the turn completes, top-level `ChainOfThought` auto-collapses.
- Individual collapsible steps inside `ChainOfThought` stay closed by default.
  Failures, denials, and approval gates stay open. Interim assistant text is
  prose on the rail, not a disclosure.
- Individual steps may still be opened and closed independently.
- `MessageResponse` renders only the final text response area below the trace.
- Interim assistant text rendered outside the trace is user-configurable in
  Settings → Chat and defaults to hidden.
- The assistant footer captures model information per turn instead of reading
  current settings, then shows the model, effort, 1M context variant, and fast
  mode when enabled.
- Earlier assistant text that appears before later tool or system activity remains inside `ChainOfThought` as a trace step instead of being promoted to the final response.
- Provider text segments must preserve their original item boundaries so in-place tool updates cannot merge commentary text into the final response block.
- The normal assistant shell is bubbleless so AI Elements composition can stay close
  to the upstream pattern.

### Provider text boundaries

Stave replays normalized provider events into `message.parts`. That replay layer
may merge adjacent `text` events, so provider adapters must preserve any
boundary that matters to final rendering.

This rule became explicit after a Codex markdown corruption bug:

- Codex can emit multiple top-level `agent_message` items in one turn.
- Stave originally flattened all of them into plain `text` deltas.
- `TodoWrite` updates are applied in place, so a later final response could end
  up adjacent to an earlier commentary text part.
- Replay then merged those text parts and the renderer treated the combined text
  as one markdown block.

The current invariant is:

- replay may only merge adjacent text parts when they share the same
  provider-supplied logical segment boundary
- Codex uses `segmentId = item.id` for `agent_message` text deltas
- providers that cannot yet supply such a boundary must be treated as
  potentially merge-unsafe

Claude currently avoids the same failure mode mostly because its dominant text
path is different:

- streamed `content_block_delta.text_delta` events arrive first
- the later assembled `assistant` text is deduplicated when streaming was
  already seen
- most progress/status updates render as structured `system`, `tool`, or
  `subagent_progress` events instead of extra assistant text segments

That does not make Claude boundary-safe by definition. If a future Claude SDK
change starts emitting multiple unrelated bare text sequences in one turn,
mirror the Codex investigation:

1. inspect the normalized `text` events emitted by the Claude adapter
2. check whether replay is merging adjacent text parts without a source
   boundary
3. add a Claude-side segment marker before changing renderer logic

## Visual Style (AI Elements alignment)

The UI follows `elements.ai-sdk.dev/components/chain-of-thought` as closely as possible:

- **Root**: No outer border or background — just `not-prose w-full`.
- **Trigger**: The ADS `inlineDisclosure` trigger, no card — `[glyph/chevron] title · duration`, always on one line:
  the title ellipsizes while the measured reasoning duration keeps its width.
  The chevron is in the LEADING slot (`InlineDisclosureIcon`) and replaces the glyph on hover
  and focus-visible, exactly like the `ToolRun` and `Thinking` rows inside the trace, so the box
  brings its padding, `controlHeightSm`, radius, hover wash and focus ring with it. Its ink is
  body ink — one step darker than the `agentSurface.rowLabel` its rows use.
  While the turn runs, the label is a rotating playful status phrase with a shimmer gradient animation,
  followed by the title of the newest step still in progress ("Reading search.ts", "Running bun test")
  and the turn's elapsed time: `phrase · activity · 12s`. With no step in progress it is the phrase
  and the time alone. On a short row the activity ellipsizes first, then the phrase; the time never
  truncates. None of it is a live region, so the rotating phrase and the changing activity are not
  announced. A streaming reasoning row inside the trace ticks its own elapsed time the same way.
  The rotating phrase swap animation is user-selectable in Settings → Chat, with a soft fade as the default.
  Once the turn finishes, the trigger reads **Work history**, with measured reasoning time when available.
  It does not repeat the answer's first sentence or append category counts. A failed run that
  offers recovery is titled **Run failed** instead. Individual tool records remain in the history.
- **Open and close**: The trace panel animates its row track (`grid-template-rows` 0fr ↔ 1fr,
  `motionDurationQuick`, `motionEaseExpressive`) with a `motionDurationFast` content fade, and
  unmounts after the close plays. Reduced motion switches at once. While it moves, the
  conversation holds the clicked trigger at its pre-click position, and following the latest
  message resumes only for a reader who was at the bottom and did not just open content that
  runs below the view (`conversation-scroll-anchor.ts`). This applies to every in-place
  disclosure in the transcript; menu, listbox and dialog triggers (`aria-haspopup`) are excluded.
- **Steps**: Flat flex rows `flex gap-3 text-sm` — NOT cards with borders/backgrounds.
- **Step icons**: Kind-specific icons for done/pending steps (Terminal for Bash, FileText for Read,
  Pencil for Edit, Search for Grep/Glob, Globe for web, Bot for subagent, Brain for reasoning,
  ListTodo for todo, FileCode2 for diffs, etc.). Active steps always show a spinner.
- **Step summary chips**: After the step title, a brief summary is shown in a distinct style:
  bash commands in a mono code chip, file names in bordered file chips, search patterns in
  code chips, subagent types in primary-tinted badges.
- **Connecting line**: Vertical 1px `bg-border` line between step icons; hidden on last step via `[&>*:last-child_.cot-connector]:hidden`.
- **Step status colors**: `active → text-foreground`, `done → text-muted-foreground`, `pending → text-muted-foreground/50`.
- **Expandable detail**: Steps with children show a subtle chevron next to the title; click to toggle.
  Expanded content animates in with `cot-step-in`.
- **System-event detail**: The first non-empty line of a generic system event is the row title.
  A single-line event has no nested body, and a multi-line event renders only the lines after that
  title when expanded. Compaction checkpoints retain their specialized recovery surface.
- **Assistant text steps**: Always visible (no accordion); rendered inline with a bullet-point dot
  instead of an icon.
- **No status chips**: No `Done`, `Running`, `Pending`, `toolUseId`, or item-number chips.

### Transcript column

Replies, user bubbles and the composer share one centred column
(`transcript-measure.stylex.ts`, 760px). Rows end on its edges: a reply fills it and a user
bubble ends on its right edge, with the bubble's hover actions beside it rather than in a
reserved row below. The composer's card spans the same column; the framed composer's wings
sit outside it. Top-level code blocks, tables and the turn's diff may grow to 880px on the same
axis, never past the transcript's gutters (`transcript-wide.tsx`); inside list items, quotes,
the trace rail and user bubbles they keep the column width. Rows are 8px apart inside a turn
and 28px apart between turns.

### Results outside work history

Message-owned subagents appear in the reading column even when work history is collapsed.
Rows preview the recorded return or failure, preserve provider/model/effort evidence, and expand
into the existing result-first exchange detail. **Result received** means only that an answer
arrived; it does not claim the parent incorporated or verified it. Async spawn handles are not answers.
Durable results are matched by parent, run, step, child task, attempt and recorded child turn.
One transcript-level ledger subscription supplies live updates; read-only message views use
recorded receipts. Native results reuse the task projection and only the matching turn graph.
Structured questions stay outside history, retaining the same answer and focus handling.

### Inline code & file links

- Inline backtick code uses bordered chip style (border + subtle bg, like `inline-citation`).
- File link chips (with line numbers) use full-opacity `border-border` for clear visibility against the white chat background.
- Prefer markdown links for workspace file references so the renderer can promote them to file chips.
- As a compatibility fallback, inline code spans that resolve to known workspace file paths are also promoted to file chips.
  Before the workspace file index loads, only path-shaped text qualifies (a path separator, a file
  extension, a dotfile or a well-known name such as `README`); identifiers such as `useState` or
  `<main>` stay inline code.
- Code fences that include file metadata (for example `path=src/App.tsx`) pass that file reference to the block renderer so headers can surface a file chip.
- File chips with `L<line>` (and optional `C<column>`) open the editor tab and reveal that exact location.
- Plain `http`, `https`, and `mailto` URLs in settled assistant message text, reasoning/tool/subagent/system step text, and other non-markdown plain-text surfaces render as external links.
- Labeled `http` and `https` markdown links render as compact link chips with a site cue and external-link affordance; raw URL autolinks outside tables remain plain so long addresses stay readable and selectable.
- Raw `http` and `https` URLs in markdown table body cells render as link chips so link-valued columns remain easy to scan.
- Terminal output recognizes URL-looking text through the xterm web-links flow and opens it only on `Cmd+Click` (macOS) or `Ctrl+Click` (other platforms).
- Markdown bold uses `font-semibold` (600) instead of the browser default bold (700).

## Naming

Follow AI Elements naming at the UI layer:

- `ChainOfThought`
- `ChainOfThoughtStep`
- `Reasoning`
- `MessageResponse`

Use Stave-specific naming at the data layer:

- `AssistantTrace`
- `AssistantTraceStep`
- `buildAssistantTrace`

Avoid `cot` as a public-facing filename or exported symbol. Prefer full names for
cross-session readability.

## Non-Goals

- Persisted turn inspection data is not a source of truth for normal chat rendering.
- Message rendering should not require replay lookups or diagnostics views.

## Performance Rules

- Keep Zustand selectors primitive or reference-stable.
- Do not derive trace arrays inside store selectors.
- Build trace data with pure helpers plus `useMemo` at the component boundary.
- Keep step renderers split by responsibility so only affected nodes re-render.
- Compare immutable source parts when memoizing trace rows: rebuilding a trace
  wrapper must not re-render unchanged tool, reasoning, or decision rows.
- Tool, reasoning, and rolled-up tool-group bodies mount on first open, then
  stay mounted to preserve reader state. Unopened bodies do not participate in
  browser find or printing. Headers and summaries remain available.
- A live timeline advances its clock from parsed spans; clock-only ticks must
  not parse tool inputs or rebuild the turn's observed timestamps.
- Batch provider text and reasoning deltas into at most 20 visual updates per second
  and merge adjacent text from the same provider segment before replay. Interaction,
  tool, and lifecycle events still flush immediately. Arrival-based liveness remains
  synchronous so a backgrounded renderer cannot make a healthy turn look stalled.
- Use the shared CSS loader for long-running trace and turn status. Keep its cadence
  reduced and pause it for completed, stalled, or interaction-blocked states; reserve
  canvas-driven orbs for the intentional kickoff experience.

## Schema / Contract Notes

When changing assistant message shape, verify all relevant serialization paths:

- `src/types/chat.ts`
- `src/lib/task-context/schemas.ts`
- `src/types/window-api.d.ts`
- any snapshot normalization or sanitization path that serializes `ChatMessage`

TypeScript passing is not enough if a snapshot schema or bridge shape is stale.
