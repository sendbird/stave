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
- Register at least one local project in Stave.
- Make sure OS credential encryption is available. Stave will not persist a
  connector credential without it.

## Quick Start

1. In Stave, open `Settings > Integrations > Crane connector`.
2. Open Crane from the connector card and generate a one-time pairing code.
3. Paste the code into Stave and select `Pair securely`.
4. Queue an issue with `Run in Stave` from Crane.
5. Review the local approval dialog in Stave, choose the project, workspace,
   provider, model, permissions, and optional Advisor, then select
   `Approve and run locally`.

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
3. Choose a registered local project.
4. Create a new workspace or select an existing workspace.
5. Choose Claude or Codex, its model and permissions, and optionally a Claude or
   Codex Advisor.
6. Approve the job.

The issue text is attached as untrusted retrieved context. It does not become
system policy or grant extra file, network, or approval permissions.

## Files And Data

- Connector settings contain only the enabled state, Crane URL, poll interval,
  and optional project mappings.
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
  managed task. Stave releases it back to normal interactive control after the
  turn finishes; `Take Over` remains available as a fallback once no turn is
  active. It does not use Run Core or change ordinary interactive tasks.

## Troubleshooting

### Pairing Is Blocked

- Symptom: the connector reports that secure storage is unavailable.
- Cause: Stave cannot use OS-backed credential encryption.
- Fix: enable the operating system credential store and restart Stave. The
  connector fails closed instead of saving plaintext.

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

## Related Docs

- [Local MCP](local-mcp-user-guide.md)
- [Runtime Safety Controls](provider-sandbox-and-approval.md)
- [Fleet Needs Me](fleet-needs-me.md)
