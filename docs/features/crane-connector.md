# Crane Connector

## Summary

The Crane connector lets your signed-in Crane account queue an issue for your
local Stave installation. Stave polls Crane over outbound HTTPS and asks for
local approval before it creates a workspace or starts Claude or Codex.

## When To Use It

- Use it when you want to select work in Crane and execute it on your own
  machine in Stave.
- Use Local MCP instead for same-machine automation that already runs beside
  Stave.
- Keep the connector disabled when you do not want Stave to poll Crane.

## Before You Start

- Sign in to Crane and open its Stave connector settings.
- The Crane deployment must have personal Stave dispatch enabled. If
  `Settings > Stave connector` is missing in Crane, ask the Atelier operator to
  enable the integration.
- Register at least one local project in Stave.
- Make sure OS credential encryption is available. Stave will not persist a
  connector credential without it.

## Quick Start

1. In Stave, open `Settings > Integrations > Crane connector`.
2. Open Crane from the connector card and generate a one-time pairing code.
3. Paste the code into Stave and select `Pair securely`.
4. Queue an issue with `Run in Stave` from Crane.
5. Review the local approval dialog in Stave, choose the Stave project,
   workspace, provider, model, permissions, and optional Advisor.
6. Keep `Remember for <TEAM> issues` on to preselect that local project for
   future jobs from the same issue team, then select `Approve and run locally`.

## Interface Walkthrough

### Entry Points

- Stave settings: `Settings > Integrations > Crane connector`
- Crane: the Stave connector settings and an issue's `Run in Stave` action
- Stave approval dialog: appears only after a paired connector receives a job

### Key Controls

- `Enable outbound polling`: starts or stops Stave's connector timer. Off means
  no Crane connector network traffic.
- `Crane URL`: selects the paired Crane origin. Production connections require
  HTTPS.
- `Poll interval`: controls how often an idle connector asks for work.
- `Pair securely`: exchanges a short-lived pairing code for an OS-encrypted
  connector credential.
- `Disconnect`: revokes the connector when Crane is reachable and always removes
  its local credential.
- `Approve and run locally`: approves only the displayed job and the exact local
  runtime choices in the dialog.
- `Remember for <TEAM> issues`: stores a local team-to-project preference plus
  the team's model, effort, and Advisor choice. It preselects them on future
  approval dialogs but never bypasses approval. Access levels are deliberately
  not remembered, so a one-off `Auto` approval cannot replay on a later job. A
  remembered Advisor is stored as three states: absent (inherit the Stave
  default), explicit none, or an explicit target.
- `Project mappings`: lists and removes remembered routes under
  `Settings > Integrations > Crane connector`.

## Common Workflows

### Pair This Stave Installation

1. Generate a pairing code in your Crane account.
2. Give the installation a recognizable name in Stave.
3. Paste the code and pair it.
4. Confirm the connector card shows `Connected`.

Pairing codes are exchanged once and are not stored in Stave settings.

### Run An Issue Locally

1. Queue the issue in Crane.
2. Read its title, instruction, description, source link, and expiration in the
   Stave approval dialog.
3. Choose a registered local project. Stave first uses a remembered mapping for
   the issue team, then the active project, then the first registered project.
   You can change the selection for every job.
4. Create a new workspace or select an existing workspace.
5. Choose Claude or Codex, its model and permissions, and optionally a Claude or
   Codex Advisor. The Advisor switch starts from your
   `Settings > Providers > Advisor` default rather than always at off, and its
   provider, model, and effort rows stay editable while the switch is off, so a
   dispatch can be configured before it is armed. Each provider keeps its own
   model and effort, so switching provider and back is not a destructive edit.
6. Approve the job.

### Start A Crane Issue From Stave

The flow above is Crane-initiated: someone clicks *Run in Stave* in Crane and the
approval dialog appears here. The [Tasks surface](tasks.md) is the reverse
direction. It lists the Crane tickets assigned to you and starts the run from
Stave, using the same connector pairing and the same `crane` scope.

When you leave *Report progress to Crane* on in the kickoff sheet, Stave
registers a Crane job for the ticket and claims it in the same call, then reports
lifecycle receipts exactly as an approved dispatch does — so the ticket shows as
running in Stave for the rest of the team, and completion and failure land in
Crane without any further action. What Crane receives is unchanged: status,
sequence, timestamps, and safe error codes only.

Turning the switch off, or staging the prompt instead of starting it, keeps the
run entirely local and leaves the Crane ticket untouched. The switch is
unavailable while the connector is off, and while the start mode is *Stage prompt
only*, because a staged prompt has not run and reporting it as running would be a
claim you cannot retract from Stave.

### Issue Keys, Branch Names, And The Information Panel

Crane issue keys such as `TFE-94` are shaped exactly like Jira issue keys, so for
company products the Jira key is what belongs in a branch name, task title, and
PR title. Stave resolves the naming key in this order:

1. An `issue.links` entry with `rel: "jira"` — the link Crane declares.
2. A Jira issue URL found in the Crane issue title, description, or instruction.
3. A bare Jira key found in the same text, ignoring the Crane issue's own team
   prefix so a sibling Crane key is never read as Jira.
4. The Crane issue key, when no Jira issue is linked.

The approval dialog states which Jira key it resolved and leaves the proposed
branch name editable.

Layers 2 and 3 are not a Crane channel. They are a best effort for issues where
someone pasted the Jira link into the body and Crane has no tracker link to
declare, so a declared link always wins over them.

### Dispatch Payload Contract

The dispatch envelope stays at `version: 1`. Additive changes never bump it,
because the job schema ignores properties it does not know instead of rejecting
them. Crane and Stave can therefore ship a new field in either order and neither
side has to wait for the other.

Crane links the tracked Jira issue like this:

```json
{
  "issue": {
    "key": "TFE-94",
    "links": [
      {
        "rel": "jira",
        "key": "DFE-2898",
        "url": "https://sendbird.atlassian.net/browse/DFE-2898",
        "title": "Region column is visible to trial orgs"
      }
    ]
  }
}
```

- `rel` is an open string. Stave understands `"jira"` (case-insensitive) today
  and ignores every other value, so Crane can start emitting `confluence`,
  `linear`, or `figma` links before Stave renders them.
- `links` is ordered: Stave takes the first `rel: "jira"` entry. Up to 8 entries.
- `key` is optional when `url` is a Jira issue address, and `url` is required.
  A URL on a non-Jira host is dropped and only the key is kept, so a mislabelled
  entry can never file a foreign address in the panel's Jira section.
- `links` is the only channel for a tracked issue. Crane does not append a
  `Jira: <KEY> <URL>` line to `issue.description`, and there is no `issue.jira`
  field; neither shape ever shipped, so neither is read.

Two rules keep the tolerance safe:

- Unknown properties are stripped during parsing, so they never reach Stave
  runtime code.
- Anything that reads as an attempt to steer this machine — `localPath`, `cwd`,
  `command`, `args`, `env`, `provider`, `model`, `runtime`, `permissions`,
  `sandbox`, `mcpServers`, `token`, `secret`, and similar names, at any nesting
  depth and in any casing — is rejected outright rather than ignored, so the
  attempt fails loudly. A dispatch payload describes an issue; every local
  execution choice is made in the Stave approval dialog.

Receipts going the other way stay a closed shape: Stave authors them, so an
unexpected property there is a Stave bug, not a rollout skew.

On approval, the Crane issue is filed in the Information panel's **Crane Issues**
section and any resolved Jira issue in the **Jira Issues** section. The Crane
section appears only while the connector is enabled (or while it still holds
entries), and a Crane task URL passed to the Jira tooling is rerouted to the
Crane section rather than being recorded as the product's tracked Jira issue.

The issue text is stored locally with the task and attached to the initial
kickoff turn as untrusted retrieved context. The attached context remains
inspectable above the composer and is reattached to later task turns; it does
not become system policy or grant extra file, network, or approval permissions.
The run also inherits Stave's configured provider timeout instead of using a
connector-specific limit.

## Files And Data

- Connector settings contain only the enabled state, Crane URL, poll interval,
  and optional local project mappings.
- Connector and job-lease credentials are encrypted by the operating system and
  stored outside renderer settings and SQLite.
- SQLite stores resumable job identity, lifecycle state, receipt sequence, and
  local task bindings, but not connector or lease secrets.
- Crane receives lifecycle state, receipt sequence, timestamps, and safe error
  codes only.

Stave does not send Crane transcripts, responses, reasoning, files, diffs, local
paths, branch names, provider credentials, or Local MCP metadata.

## Limitations And Advanced Options

- Every V1 job needs its own local approval. There is no hidden `always run`
  option.
- Crane cannot call Stave's Local MCP endpoint and cannot choose local paths,
  providers, models, permissions, or Advisor settings.
- One connector processes one active job at a time and resumes its durable local
  binding after an app restart.
- A newly approved Crane job starts as an ordinary interactive Stave task. The
  issue is its kickoff source, so approvals, questions, steering, interruption,
  and follow-up turns remain available in the task from the beginning.
- Crane tracks only the exact initial kickoff turn. Stave continues publishing
  `running`, `needs_local_input`, and terminal receipts for that turn, while
  later user follow-up turns remain local Stave work and do not rewrite the
  Crane job result.
- Managed Crane tasks created by older Stave versions remain compatible with
  the inline and task-tab `Take Over` actions after their managed turn stops.
  New Crane dispatches do not require takeover.
- Project choice stays in the local Stave approval dialog. Crane never receives
  the local project catalog, path, or remembered mapping.

## Troubleshooting

### Pairing Is Blocked

- Symptom: the connector reports that secure storage is unavailable.
- Cause: Stave cannot use OS-backed credential encryption.
- Fix: enable the operating system credential store and restart Stave. The
  connector fails closed instead of saving plaintext.

### Stave Connector Is Missing In Crane

- Symptom: Crane Settings has no `Stave connector` section and issues have no
  Stave setup prompt.
- Cause: personal Stave dispatch is disabled for that Atelier deployment.
- Fix: ask the Atelier operator to set
  `CRANE_STAVE_DISPATCH_ENABLED=true` and redeploy Crane.

### Crane Is Offline

- Symptom: the connector status shows `Offline`.
- Cause: the outbound request could not reach the paired Crane origin.
- Fix: check the network and Crane URL. Stave retries with bounded backoff and
  does not start local work while disconnected.

### A Job Does Not Start

- Symptom: Stave shows an approval request but no task exists yet.
- Cause: local approval is still pending, the job expired, or the selected
  project or workspace is no longer registered.
- Fix: approve before expiration and select a currently registered local target.

### A Kickoff Turn Ends With No Response

- Symptom: the prompt is visible, but the assistant area says `No response`.
- Cause: the initial kickoff turn ended or was interrupted before it emitted
  usable output.
- Fix: check provider authentication and runtime diagnostics, then retry or
  continue directly in the same interactive task. Stave reports the initial
  turn to Crane as a safe provider failure instead of a successful completion.

## Related Docs

- [Local MCP](local-mcp-user-guide.md)
- [Runtime Safety Controls](provider-sandbox-and-approval.md)
- [Fleet Action Required](fleet-needs-me.md)
