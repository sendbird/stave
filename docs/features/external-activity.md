# Activity Outside Stave

## Summary

**Activity** shows the Claude Code and Codex sessions you started outside
Stave, such as `claude` or `codex` in a terminal, and the sub-agents a Claude
Code or Codex session runs. It is read-only: the sessions keep running where you started
them. The feature is off until you turn it on.

## When To Use It

- You run agents in a terminal next to Stave and want one place that says which
  of them are working, which wait for you, and what each is doing now.
- A Claude Code or Codex session started several sub-agents and you want to see which are
  still running.

Sessions Stave starts (tasks, delegated tasks, CLI session tabs) are not listed
here; they stay in their own tasks.

## Before You Start

- Turn on **Settings > General > Activity outside Stave**. While it is off,
  Stave does not read any transcript file.
- When it is on, Stave reads the transcript files Claude Code and Codex write on
  this computer: the default folders (`$CLAUDE_CONFIG_DIR` or `<user-home>/.claude`,
  `$CODEX_HOME` or `<user-home>/.codex`) and the folders of accounts added in
  **Settings > Accounts**. What it reads stays in memory. Nothing is written to
  those folders, saved by Stave or sent anywhere.

## Quick Start

1. Open **Activity** in the sidebar (also in the collapsed rail and the command
   palette as **Open Activity**).
2. If it is off, choose **Turn on**.
3. Start `claude` or `codex` in a terminal. The session appears within a few
   seconds.

## Interface Walkthrough

### Entry Points

- **Activity** in the sidebar. Its badge counts agents running outside Stave:
  sessions that are working plus sub-agents that are running.
- **Open Activity** in the command palette.
- Escape or the close button returns to where you were.

### Key Controls

- The header says how many agents are running.
- Sessions are grouped by the Stave project whose folder contains them;
  sessions in other folders are grouped by folder.
- Each session shows its tool (Claude Code or Codex), title, status, workspace
  and branch when known, the current action (for example "Running npm test"), elapsed
  time, step count, context size, and "N of M agents running".
- Each sub-agent card shows its agent type, status, description, current
  action, elapsed time, steps and context.

Statuses:

| Status | Meaning |
| --- | --- |
| Working | Written in the last five minutes and the last answer did not end the turn |
| Waiting for you | The last answer ended its turn |
| Idle | Not written for five minutes |
| Running / Finished / Failed / Stopped (sub-agents) | From the session's report on the agent, its final answer, or how recently it wrote |

## Codex sub-agents

Codex records a sub-agent as its own rollout file that names its parent
session. Stave nests those under the parent:

- A sub-agent started with `spawn_agent` appears as an agent card under its
  parent session (type is its role, title is its nickname) and counts in
  "N of M agents running". Status, current action, steps and context come from
  its own rollout.
- Internal approval-review sessions (`guardian`) are not shown or counted.
- When the parent is not listed (for example it was last written before the
  window), the sub-agent appears as its own session with a "Sub-agent" label.
- When the parent is a session Stave started, its sub-agents are left out too.

## Limits

- Only sessions written in the last 30 minutes are listed (up to 30), with up
  to 12 sub-agents each. Files untouched for six hours are skipped.
- Codex sessions are read from the last seven days of
  `sessions/YYYY/MM/DD/rollout-*.jsonl`. See Codex sub-agents below.
- Step counts and titles come from the part of each transcript Stave reads (its
  last 2 MB, or 512 KB for a sub-agent, when the page opens, then what is
  appended).
- Credentials in step text, such as tokens and keys, are replaced with
  `<redacted>`.
- With the page closed, Stave only scans the folders every 10 seconds for the
  badge and reads the last 64 KB of a transcript that changed. It follows
  transcripts only while the page is open.
- The transcript formats are not documented by their tools and can change. A
  line Stave cannot read is skipped; an unreadable folder leaves the page empty
  rather than failing.
- Other agent CLIs (Cursor, Kiro, OpenCode) are not shown.
- While the setting is on, workspace cleanup will not remove the worktree of a
  sub-agent listed here that has not finished (see
  [worktrees left by sub-agents](resource-manager.md#worktrees-left-by-sub-agents)).
  Sub-agents of tasks Stave runs are not listed, so cleanup protects their
  worktrees only through its other checks, such as changes in the last 30 minutes.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| A terminal session does not appear | The setting is on, the session wrote in the last 30 minutes, and it uses a config folder Stave knows (the default or an added account) |
| A Stave task appears here | Stave recognizes its sessions by the ids it stores; a session from a deleted workspace can appear |
| Steps look low | Only the read part of a long transcript is counted |
