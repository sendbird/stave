# Chat Message Rendering

This document defines the renderer contract for assistant messages in Stave.

## Goals

- Use one renderer path for both Claude and Codex assistant messages.
- Keep AI Elements semantics recognizable in code and UI.
- Show pre-answer execution flow as Chain of Thought.
- Show the final assistant response below that Chain of Thought.
- Avoid depending on persisted turn inspection data for normal message rendering.

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
- Individual steps inside `ChainOfThought` may still be opened and closed independently.
- `MessageResponse` renders only the final text response area below the trace.
- Interim assistant text rendered outside the trace is user-configurable in
  Settings → Chat and defaults to hidden.
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
- Codex uses `segmentId = item.id` for `agent_message` and `plan` text deltas
- when a structured Codex `plan` item completes, `plan_ready.sourceSegmentId`
  must carry that same item id so replay can remove the transient preview text
  from the normal chat bubble before the dedicated plan response is stored
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
- **Trigger**: Simple row `[icon] label [chevron]`, text-muted-foreground, no card.
  When streaming, the "Thinking" label uses a shimmer gradient animation.
  The rotating phrase swap animation is user-selectable in Settings → Chat, with a soft fade as the default.
  When collapsed and not streaming, a summary row shows tool/agent/file counts below the trigger.
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
- **Assistant text steps**: Always visible (no accordion); rendered inline with a bullet-point dot
  instead of an icon.
- **No status chips**: No `Done`, `Running`, `Pending`, `toolUseId`, or item-number chips.

### Collapsed summary

When the Chain of Thought collapses after a turn completes, the trigger displays a compact
summary of the work performed. Categories include commands, reads, edits, searches, web,
agents, and file changes. Each category shows an icon and count, separated by dot dividers.

### Inline code & file links

- Inline backtick code uses bordered chip style (border + subtle bg, like `inline-citation`).
- File link chips (with line numbers) use full-opacity `border-border` for clear visibility against the white chat background.
- Prefer markdown links for workspace file references so the renderer can promote them to file chips.
- As a compatibility fallback, inline code spans that resolve to known workspace file paths are also promoted to file chips.
- Code fences that include file metadata (for example `path=src/App.tsx`) pass that file reference to the block renderer so headers can surface a file chip.
- File chips with `L<line>` (and optional `C<column>`) open the editor tab and reveal that exact location.
- Plain `http`, `https`, and `mailto` URLs in settled assistant message text, reasoning/tool/subagent/system step text, and other non-markdown plain-text surfaces render as external links.
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

## Schema / Contract Notes

When changing assistant message shape, verify all relevant serialization paths:

- `src/types/chat.ts`
- `src/lib/task-context/schemas.ts`
- `src/types/window-api.d.ts`
- any snapshot normalization or sanitization path that serializes `ChatMessage`

TypeScript passing is not enough if a snapshot schema or bridge shape is stale.
