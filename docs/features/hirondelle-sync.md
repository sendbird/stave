# Hirondelle Workspace Sync

## Summary

Hirondelle sync links one Stave workspace to one Hirondelle project. Stave can
push selected workspace activity and resource links to that project, while a
local Markdown snapshot keeps the latest Hirondelle context available to tasks
in the workspace.

Pull request and task events are enabled by default after sync is turned on.
Model-written turn summaries remain opt-in because they are interpretive rather
than factual.

## When To Use It

- Use it when a Stave workspace and a Hirondelle project represent the same
  stream of work.
- Use it to keep project links and factual milestones current without copying
  them by hand.
- Use the context pull when tasks need Hirondelle's project summary, sections,
  memory, and recent changes as local reference material.
- Keep sync disabled when the workspace must remain entirely local, or leave
  turn summaries off when only factual activity should leave Stave.

## Before You Start

- You need access to an Atelier deployment with Hirondelle sync enabled.
- Create or choose the Hirondelle project that this workspace should follow.
- Generate a short-lived Stave pairing code in Atelier.
- Make sure OS credential encryption is available. Stave will not save the
  connector credential without it.
- Pair with the `hirondelle` connector scope. If this Stave installation was
  paired before connector scopes were introduced, pair it again. Keep `crane`
  selected during re-pairing if you also use the Crane connector.

## Quick Start

1. In Stave, open `Settings > Integrations > Hirondelle sync`.
2. Enter the Atelier URL and pairing code, select the connector scopes you use,
   then select `Pair securely`.
3. Turn on `Enable Hirondelle sync` and choose which event types to send.
4. Open a workspace and select `Information` in the right rail.
5. In the `Hirondelle project` card, search for a project and select `Link`.
6. Confirm that the card shows the project name and a recent `Last pulled`
   time.

## Interface Walkthrough

### Entry Points

- Connector and event settings: `Settings > Integrations > Hirondelle sync`
- Per-workspace project link: `Information > Hirondelle project`
- Pulled context snapshot:
  `.stave/context/hirondelle/<project-slug>.md` inside the workspace

### Key Controls

- `Connector access`: selects the access scopes granted to the new connector
  credential. Pairing again replaces the current credential, so keep every
  integration you still use selected.
- `Enable Hirondelle sync`: controls outbound delivery. Turning it off keeps
  queued items on this device.
- `PR opened events`: sends a factual milestone when Stave opens a pull request.
- `Task completed events`: sends a factual milestone when a task is archived as
  completed.
- `Resource link mirroring`: merges supported Information-panel links into the
  Hirondelle project after edits settle.
- `Turn summaries`: sends model-written work summaries. It is off by default.
- `Retry failed`: returns failed outbox items to the delivery queue.
- `Refresh`: pulls the latest project context and rewrites the local snapshot.
- `Unlink`: removes the workspace-to-project mapping. It does not delete the
  Hirondelle project or its existing data.

## Common Workflows

### Link A Workspace

1. Open the workspace's Information panel.
2. Search by project name or leave the search field empty to browse projects.
3. Select `Link` beside an active project.
4. Stave saves the mapping in workspace Information and writes the first local
   context snapshot.

Archived projects appear in search results but cannot be linked.

### Refresh Project Context

1. Open the linked project's Information card.
2. Select `Refresh`.
3. Confirm the `Last pulled` time changes.

The snapshot is replaced atomically, so tasks do not read a partially written
file.

### Recover Failed Delivery

Stave keeps a durable outbox, so pending items survive offline periods and app
restarts. Delivery retries with bounded backoff. After repeated failures, the
item moves to the failed count shown in Settings.

1. Resolve the connector, permission, or network problem.
2. Open `Settings > Integrations > Hirondelle sync`.
3. Select `Retry failed`.

## Files And Data

- The workspace-to-project mapping is stored with the workspace's Information
  data.
- The latest pulled context is written to
  `.stave/context/hirondelle/<project-slug>.md`.
- Pending, held, and failed deliveries are stored in Stave's local SQLite
  outbox.
- The connector secret is stored only through OS-backed credential encryption.
  It is not written to renderer settings, transcripts, or logs.

Stave sends only the data needed for enabled sync features: workspace name,
branch name, event titles and summaries, source URLs, and mirrored resource
labels, notes, and URLs. Model-written turn summaries are sent only when their
separate toggle is enabled. Stave does not send local file paths, file contents,
diffs, full transcripts, reasoning, provider credentials, or Local MCP
metadata.

## Limitations And Advanced Options

- One Stave workspace can link to one Hirondelle project at a time.
- Sync does not reverse-merge Hirondelle links into Stave's Information
  resources. `Refresh` updates the context snapshot only.
- A missing or archived project marks the mapping as stale and holds outbound
  items for that workspace. Relink to an active project or unlink the stale
  mapping before delivery can resume.
- Link mirroring inserts or updates Stave-origin links in Hirondelle. It does
  not delete links or overwrite links maintained by people in Hirondelle.
- Turning off the master switch stops delivery but does not discard queued
  items.

## Troubleshooting

### Pairing Is Blocked

- Symptom: `Pair securely` is disabled and the card reports that credential
  encryption is unavailable.
- Cause: Stave cannot use the operating system's secure credential store.
- Fix: restore OS credential-store access and restart Stave. Pairing fails
  closed instead of saving plaintext.

### No Projects Appear

- Symptom: project search fails or returns no projects you expect to see.
- Cause: the connector is unpaired, lacks the `hirondelle` scope, or belongs to
  an Atelier account that cannot access those projects.
- Fix: pair again with `hirondelle` selected and confirm project access in
  Atelier.

### The Linked Project Is Stale

- Symptom: the Information card shows `Stale`, and new workspace activity is
  not delivered.
- Cause: Hirondelle reported that the project is missing or archived.
- Fix: select `Refresh` to check again. If the project is no longer active,
  unlink it and link the workspace to an active project.

### Failed Items Remain In The Outbox

- Symptom: Settings shows a nonzero failed count.
- Cause: delivery exhausted its automatic retries because of a persistent
  network, authorization, or project-state error.
- Fix: resolve the reported connector or project problem, then select
  `Retry failed`.

## Related Docs

- [Crane Connector](crane-connector.md)
- [Latest Turn Summary](workspace-latest-turn-summary.md)
- [Local MCP](local-mcp-user-guide.md)
