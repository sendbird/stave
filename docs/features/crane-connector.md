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
- `Remember for <TEAM> issues`: stores a local team-to-project preference. It
  preselects a project on future approval dialogs but never bypasses approval.
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
   Codex Advisor.
6. Approve the job.

The issue text is stored locally with the task and attached to the managed
provider turn as untrusted retrieved context. The attached context remains
inspectable above the composer and is reattached to later turns after
`Take Over`; it does not become system policy or grant extra file, network, or
approval permissions. The run also inherits Stave's configured provider
timeout instead of using a connector-specific limit.

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
- While its provider turn is active, a Crane job is a locally controlled
  managed task. The composer stays monitor-only, while local approval and user
  input requests remain actionable in the task. Stave releases the task back
  to normal interactive control after the turn finishes; an inline `Take Over`
  action above the composer remains available as a fallback once no turn is
  active, with the task-tab menu as a secondary entry point. Takeover is
  committed by the host process only after the exact bound Crane turn is
  terminal. If Crane is offline, local control can still be released and the
  terminal receipt retries in the background. It does not use Run Core or
  change ordinary interactive tasks.
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

### A Managed Task Ends With No Response

- Symptom: the prompt is visible, but the assistant area says `No response`.
- Cause: the bound provider turn ended or was interrupted before it emitted
  usable output.
- Fix: check provider authentication and runtime diagnostics, then use the
  inline `Take Over` action once the run is inactive. Stave reports this
  outcome to Crane as a safe provider failure instead of a successful
  completion.

## Related Docs

- [Local MCP](local-mcp-user-guide.md)
- [Runtime Safety Controls](provider-sandbox-and-approval.md)
- [Fleet Needs Me](fleet-needs-me.md)
