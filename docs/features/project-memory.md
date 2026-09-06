# Project memory

Project memory carries reusable knowledge across workspaces of the same project.
It is a recall aid, not a transcript or a replacement for repository instructions.
Current user instructions, checked-in guidance and verified evidence take priority.

## What gets remembered

Keep durable user corrections, decisions with their rationale, and non-obvious
pitfalls that prevent repeated mistakes. Each entry is at most 280 characters.
Include enough context to explain when it applies. Completion logs, transient
status, unchanged settings, code inventories and detailed implementation values
belong in task history or repository documentation.

There are three usage modes in Information > Memory:

- **Candidate**: a suggestion, excluded from automatic recall. Turn summaries
  propose at most one candidate. Repeated extraction never promotes it.
- **When relevant**: curated knowledge, recalled only when the current request
  matches its text. This is the default for explicit agent writes.
- **Always include**: a project-wide essential, included even without a query
  match. At most three live entries can use this mode.

Users can edit an entry, change its usage or forget it. Editing candidate text
alone keeps it a candidate; changing its usage makes it available for recall.
Entries display their complete text. **Edit memory** opens a multiline editor;
**Save memory** applies changes, and **Cancel** or Escape discards the draft.

## Settings and cleanup

Open **Settings > Memory** and select a project, or expand **Memory settings and
actions** in Information > Memory. Settings apply across that project's workspaces.

- **Use project memory** controls automatic inclusion in new turns. Switching it
  off preserves stored entries; explicit agent lookup and editing remain available.
- **Collect memory candidates** controls extraction from completed-turn summaries.
  It requires the Turn summary lane in Background AI. It does not start an extra
  model call or disable explicit saves by agents.
- **What to collect** limits automatic candidates to selected kinds: decisions,
  conventions, pitfalls or stable facts. Selecting none stops candidate collection.
- **Collection template** customizes what to prioritize and exclude. The default
  prioritizes reusable corrections, lasting decisions and verified pitfalls.
  **Restore collection defaults** restores this template and all kinds in the
  draft; choose **Save settings** to apply it. Candidate and recall limits remain
  enforced regardless of the template.

**Clear candidates** removes only unreviewed entries. **Reset project memory**
removes all entries in the selected project while preserving collection settings.
Both actions ask for confirmation and invalidate pending extraction. Automatic
collection from turns started at or before the clear is rejected, even if the
summary runs later or uses different wording. Turns started afterward can collect
new candidates. The database retains deletion markers to prevent exact duplicates
from returning. Other projects are unaffected.

These actions cannot remove text already sent to an ongoing provider conversation.
Start a new conversation when you need context without that earlier memory text.
Concurrent settings saves detect a stale revision and ask for a reload instead of
silently overwriting another window's changes.

## Agent curation

Use `stave_list_project_memories` with a `query` before saving related knowledge.
It returns at most 12 entries with ids, usage modes and confirmation dates.
Use `recallMode: "candidate"` to review suggestions; a candidate is not evidence
that a claim is true. Pass `nextOffset` back as `offset` to continue browsing.
Offsets are for a stable list; restart browsing if entries change during a scan.

Use `stave_remember` with an existing `memoryId` to revise or consolidate an
entry in place. Verify candidates against the task or repository before promoting
them. Use `stave_forget` for superseded ids after the retained entry is saved.
Curation uses the active agent's existing tools and budget; there is no additional
background model or guarantee that every candidate will be reviewed automatically.

Exact normalized duplicates confirm an existing entry. Similar wording is not
assumed equivalent: a small wording change can reverse a decision. Semantic
merging and contradiction resolution belong to explicit curation. A forgotten
identical entry is blocked from reinsertion; paraphrases require review.

## Context and storage limits

Each turn receives at most six entries in a block of at most 1,200 JavaScript
characters, including its preamble. This is a character bound, not a token or
UTF-8 byte estimate. Core entries come first, followed by relevant matches.
Unrelated memories never fill spare capacity. If nothing matches and there are
no core memories, no memory block is sent.

The current prompt drives recall. Short continuations also use the most recent
user message. The lookup is lexical (FTS where available, literal substring
fallback), so translated or semantically related wording may require an explicit
tool search. No embeddings or full transcript retrieval are involved.

New automatic candidates stop accumulating at 50 live candidates per project.
Existing rows are preserved. Curating or forgetting candidates makes room.
Candidate writes never refresh the confirmation date of curated knowledge.

## Upgrade and boundaries

An additive database migration classifies existing high-confidence entries as
contextual and lower-confidence entries as candidates. No old entry becomes core
automatically, and no row or deletion marker is removed. Existing user-edited
summary prompts are preserved; untouched old defaults receive the new candidate
extraction instructions. The parser enforces the one-candidate limit regardless
of the configured prompt.

Main and host-service share the persistence implementation. Workspace ownership
resolves the project for agent tools; a replacement cannot target another project.
Renderer and host turns use the same query and retrieved-context builders before
provider dispatch. Provider sessions retain the existing content-hash deduplication.
Memory lookup failure omits the block without failing the user turn.

Implementation: `src/lib/project-memory.ts`,
`src/lib/task-context/project-memory.ts`,
`electron/persistence/project-memory-store.ts`, and
`src/components/layout/WorkspaceMemorySection.tsx`.
