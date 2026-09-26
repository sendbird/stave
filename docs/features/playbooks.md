# Playbooks

## Summary

A playbook is a saved way of working: the stages you would otherwise prompt one
by one, each with an instruction and a condition that says when it is done.
Start a [mission](missions.md) with it and Stave runs the stages for you. A
[project](projects.md)'s coordinator picks from the same playbooks.

![The Playbooks tab: saved playbooks on the left, and the selected playbook's check-ins, shortcut, permissions, constraints and stages](../screenshots/playbooks.png)

## When To Use It

- You repeat the same sequence — understand, build, verify, open a PR, fix
  checks, request review — and want to hand it off in one step.
- Your team has a way of working worth writing down once.
- For a single saved prompt, use a macro instead.

## Before You Start

- Playbooks are edited in the Automations center. Missions they start need a
  Claude or Codex task and Stave's local tools (see [Missions](missions.md)).

## Quick Start

1. Open **Automations** and choose the **Playbooks** tab.
2. Pick a template such as **Request → PR**, or **Blank playbook**, or
   **Draft with AI**.
3. Adjust the stages, then **Save playbook**.
4. Give it a **Shortcut** such as `pr` to start it with `!pr` from the
   composer.

## Interface Walkthrough

### Entry Points

- Automations → **Playbooks**.
- **Manage playbooks** in the command palette, in the Start mission sheet and
  in the Mission panel.

### Editor

- **Name** and **Purpose** head the editor; click to edit in place.
- **Check-ins** chooses where missions ask you: **Every stage**,
  **Plan and publishing** or **Only when stuck**. The sentence under it names
  the stages that ask. Changing a single stage's hand marks the check-ins
  **Custom**; choosing a preset resets them.
- **Shortcut** lets you start the playbook with `!shortcut` in the composer.
- **Permissions** is the default the Start sheet preselects. It grants nothing
  by itself; every start confirms its own permissions.
- **Constraints** are rules every stage follows.
- **Stages**: each row has a handle, its number, its kind (AI stage or Stave
  action), its name, a preview of its instruction, and a hand that says whether
  a mission asks you before it.
  - Drag the handle, or focus it and press **Alt+↑/↓**, to reorder.
  - Open a row to edit its **Instruction**, **Done when** and **Role**
    (**Plans** or **Publishes**, which the check-ins use).
  - Stave actions have their own settings: **Watch checks** takes a number of
    repairs and a time limit.
- **Add stage** offers a blank AI stage, stage templates and the three Stave
  actions: **Open draft PR**, **Watch checks**, **Ready for review**.

### Draft with AI

Describe how you work in a sentence, or paste an example of the steps you took
last time, and click **Draft stages**. The draft replaces the editor's content
but is not saved until you click **Save playbook**.

## Common Workflows

### Make a playbook from a template

1. Automations → Playbooks → **+** → **From a template**.
2. Edit the stages and save.

### Change a playbook for one mission

In the Start mission sheet, open **Edit stages for this mission**. Leave
**Save as a new playbook** off to change it this time only.

## Files And Data

- Playbooks are part of Stave's settings on this machine. A mission copies the
  playbook when it starts.
- Saving validates the whole playbook: each missing field is shown next to the
  field. A playbook opens a draft PR at most once, and **Watch checks** and
  **Ready for review** come after **Open draft PR**.

## Limitations And Advanced Options

- Up to 50 playbooks, each with up to 12 stages.
- Playbooks are not shared through the repository yet.

## Related Docs

- [Missions](missions.md)
- [Automations](automations.md)
- [Projects](projects.md)
