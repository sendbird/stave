---
locale: en
title: Stave User Guide
product: Stave
brandSub: Guide
versionLabel: v1
status: Current · Stave 0.29.2
statusTone: current
captured: 2026-11-02
updated: 2026-11-02
recorder: jacob.kim
footer: Stave User Guide v1 · Stave 0.29.2 (main 6e7a65a7) · Source in the repository's docs/heron, screenshots in docs/screenshots/guide.
---

@page start | Getting started | Stave at a glance | guide
@lead Stave is a Mac desktop AI coding workspace for Claude Code, Codex, Cursor Agent, Kiro CLI and OpenCode in one window. Each repository is split into workspaces (git worktrees); inside a workspace you open tasks (conversations), hand work to an AI and review the result.

```meta
Audience | Developers new to Stave | From installing to handing a goal to an agent
Version | Stave 0.29.2 | main `6e7a65a7`. No app code changed after the 0.29.2 release
Screens | Captures with synthetic data | English UI, in the repository's `docs/screenshots/guide/en`
UI language | English (default) and Korean | Change it in Settings > General > Language
```

## What this guide covers

```cards
Install | Install and first setup | Install the app and sign in to an AI CLI. | #install
Concepts | Core concepts | See how repositories, workspaces, tasks and turns relate. | #concepts
Work | Everyday flow | Open a task, approve, review, and get to a PR. | #everyday
Hand off | Agents and runs | Hand a goal to an agent and walk away. | #agents
Automate | Schedules and Fleet | Start work on a schedule and see only what needs you. | #automation
Tools | Workspace tools | Use the terminal, command palette, Lens and Information panel. | #tools
```

## The window

Heron documents cannot embed images, so each section's **Screens** link opens the screenshot on GitHub.
Screens: [Whole window](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/overview.png)

```diagram architecture "Regions of the Stave window"
box sidebar 1,1 | Sidebar | Repositories and workspaces | Fleet View · Agents · AI usage
box topbar 2,1 | Top bar | Path · branch · Create PR | Go to file · Schedules · Notifications
box center 2,2 primary | Work area | Task · terminal · Lens tabs | Composer at the bottom
box rail 3,2 | Right panels | Explorer · Source Control · Information | Skills · Workspace Tools · Task
edge sidebar -> center : pick a workspace
edge topbar -> center dashed : navigate and PR
edge rail -> center dashed : context and tools
@caption A conceptual layout of the window regions. See the whole-window screenshot for the real placement.
```

| Region       | What is there                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar      | **Fleet View**, **Agents** and **AI usage** at the top; repositories and workspaces below. The list has two views: **Repositories** and **Work queue** |
| Top bar      | Workspace path and branch, **Commit graph**, **Create PR**, go to file (Cmd/Ctrl+P), Fleet, Issues, Schedules, Standalone CLI, notifications, app update |
| Work area    | Tasks (conversations), terminals, CLI sessions, editors and Lens open as tabs. The composer for writing messages sits under a task tab |
| Right panels | **Explorer**, **Source Control**, **Information**, **Skills**, **Workspace Tools**, **Task**, Lens and **Terminal** buttons. They stay disabled until a repository is open |
| Status bar   | Account and usage per provider                                                                                                        |

@page install | Getting started | Install and first setup | guide
@lead Install the app with GitHub CLI, sign in to the AI CLIs you want in a terminal, then open a repository in the app. Check the permission preset once at the start.

```pipeline "First setup"
Install | Run the install script with GitHub CLI.
Sign in | Sign in to the AI CLIs you want in a terminal.
! Check accounts | See readiness in Settings > Accounts > Getting started.
Open a repository | Register a local git repository with Open a repository on the first screen.
Pick permissions | Choose a Mode Preset in Settings > Providers.
```

## 1. Install the app

```bash
brew install gh
gh auth login
gh api -H 'Accept: application/vnd.github.v3.raw+json' repos/sendbird/stave/contents/scripts/install-latest-release.sh | bash
```

The install script downloads `Stave-macOS.zip` from the latest release, installs it in `~/Applications` (or `/Applications`) and opens the app.
If you hit an SSO or scope error, run `gh auth refresh -h github.com -s repo,read:org` and install again.
Full install guide: https://github.com/sendbird/stave/blob/main/docs/install-guide.md

When a new version is out, the top bar shows **App update**; **Install & Restart** switches to it in place.

## 2. Install and sign in to an AI CLI

Stave runs the CLIs installed on your computer with your own sign-in. Install and sign in to at least one.

| Provider     | Sign-in command       | Note                                             |
| ------------ | --------------------- | ------------------------------------------------ |
| Claude Code  | `claude auth login`   | Install: `npm install -g @anthropic-ai/claude-code` |
| Codex        | `codex login`         | Install: `npm install -g @openai/codex`          |
| Cursor Agent | `agent login`         | Its Settings tab appears once installed and signed in |
| Kiro CLI     | `kiro-cli login`      | Its Settings tab appears once installed and signed in |
| OpenCode     | `opencode auth login` | Its Settings tab appears once installed          |

For Claude and Codex you can add more accounts or connect an API gateway in **Settings > Accounts**.

## 3. First setup in the app

1. On the first screen, select **Open a repository** and pick a local git repository folder.
2. If no provider can take a turn yet, the first screen shows **Getting started** and **Open Accounts**. Follow the steps in **Settings > Accounts > Getting started** (install a provider CLI, sign in, add another account, connect a gateway, pick a model). Adding an account and connecting a gateway are optional.
3. Pick Korean in **Settings > General > Language** if you prefer.
4. Check the permission preset in **Settings > Providers**. Read [Permissions and safety](#safety) first.

If macOS asks for Desktop, Documents or Downloads access, allow it once.

## Settings map

Open Settings with Cmd/Ctrl+,.
Screens: [Settings > Providers](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/settings-providers.png)

| Group    | Pages                                                                   | What you do there                                                                |
| -------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| App      | General, Appearance, Chat, Editor & Terminal, Keyboard & Commands, Browser | Language, theme, chat display, shortcuts, Lens and `@web` scope                |
| Projects | Projects (Repository, Workspace Tools, Memory)                          | Repository instructions, post-create command, saved commands and processes, repository memory |
| Agents   | Accounts, Providers, Models, Presets & Macros, Prompts & Skills, MCP, Integrations, Secrets | Sign-in accounts, permission presets, default models and Auto, skills, MCP servers, Jira and Crane, secrets |
| System   | Developer (Developer mode only), Changelog                              | Diagnostics and release notes                                                    |

@page concepts | Concepts | Core concepts | concept
@lead Everything in Stave nests as repository → workspace → task → turn. Once these four words are clear, you can see where every other feature attaches.

```diagram architecture "From repository to turn"
box repo 1,1 primary | Repository | A registered local git folder | Register as many as you need
box ws 2,1 primary | Workspace | git worktree + one branch | One Default + as many as needed
box task 3,1 primary | Task | One conversation | Many per workspace
box turn 4,1 primary | Turn | One request and its response | Many per task
box info 2,2 | Information panel | Notes · todos · links · documents | One per workspace
box provider 4,2 | Provider and model | Claude · Codex · Cursor · Kiro · OpenCode | Picked per turn
edge repo -> ws main : contains
edge ws -> task main : contains
edge task -> turn main : accumulates
edge info -> task dashed : context
edge provider -> turn dashed : runs
@caption A conceptual diagram of the relationships, based on the app's data model.
```

## The four basic units

| Unit       | What it is                              | Worth knowing                                                                                                              |
| ---------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Repository | A local git folder registered in the sidebar | In Settings, the **Projects** page holds repository settings                                                          |
| Workspace  | A dedicated git worktree bound to one branch | Each repository has one **Default** workspace at the repository root; others are created under `<repo>/.stave/workspaces/` |
| Task       | One conversation inside a workspace     | Closing its tab does not archive it; archive with **Archive** in the tab menu. You can switch providers mid-task          |
| Turn       | One response to one request             | Tool calls, approval requests and questions happen inside a turn. Messages sent while a turn runs wait in the queue       |

The default workspace label and branch share one line in the sidebar (`Default · main`); long branches truncate, and the dot is hidden when there is no branch.

## Why split work into workspaces

You can work directly in the Default workspace.
But a workspace per piece of work keeps branches and files apart, so several AI tasks can run at once without overwriting each other's changes.
When the work is done and the PR is merged, archive the workspace and, if you like, delete its branch too.

## Related concepts

| Concept             | Attached to | Description                                                                                                                       |
| ------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Information panel   | Workspace   | Shared instructions, summary, todos, notes, memory, documents, PR, Jira, Slack and Figma links, custom fields. What you write here reaches this workspace's tasks as context |
| Workspace documents | Workspace   | Plans and reports that agents write and revise, stored in `.stave/context/plans/` with every revision recorded                    |
| Task panel          | Task        | **Activity**, **Progress**, **Subagents**, **Outputs** and **Handoff** tabs                                                       |
| Agent               | Whole app   | A saved worker with instructions, model, permissions and stages. Assigning one to a task starts a run                             |
| Fleet View          | Whole app   | Where everything that needs you, across all workspaces, comes together                                                            |
| Schedule            | Repository or task | Starts a new task, or wakes an existing one, at a set time                                                                 |

@page everyday | Working | Everyday flow | guide
@lead Create a workspace, open a task and send a request, check approvals and changes, then create a PR.

```pipeline "The flow of one task"
Workspace | Create a branch with New workspace on the repository row.
Task | Open a new task and pick a model.
Request | Send what to do together with what done looks like.
! Approve | Allow or deny when the AI wants a tool that needs permission.
Review | Check the changes in Source Control and Review mode.
PR | Open it with Create PR in the top bar.
```

## 1. Create a workspace

Hover a repository row in the sidebar to see **New workspace**, **Kick off workspace** (the sparkle icon) and **Repository settings**.
In the **New workspace** dialog, enter the **Workspace Branch Name** and the optional **Workspace Label**, then pick how to create it.
Screens: [New workspace](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/new-workspace.png)

| Method                     | What it does                                                                     |
| -------------------------- | -------------------------------------------------------------------------------- |
| Create From Branch (default) | Search and pick a base branch, then create the worktree from it               |
| Create Clean Workspace     | Create a new isolated worktree with a fresh branch                               |
| Link Existing Worktree     | Symlink a worktree that lives elsewhere into `.stave/workspaces/` and keep its branch |

A **Post-Create Command** (for example `bun install`) runs right after creation.

### Start from a kickoff

To start from existing material such as a Jira issue, a PR or a report, use **Kick off workspace**.
Paste a link or a description and select **Resolve source**: Stave reads it and proposes the branch, label, Information panel links, and the first task's model and prompt. Edit anything before creating.
**Skip AI** proposes the same from the link and text alone, without an AI.
In **Who**, pick **Me** or a saved agent; in **Where**, pick a new workspace or the **Current workspace**. Turn off **Start now** to keep the first prompt in the composer instead of sending it.
Screens: [Kick off workspace](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/kickoff.png)

## 2. Open a task and send a request

1. Press Cmd/Ctrl+N, or select **New Task** in an empty workspace.
2. In the model button under the composer (**Select model**, Alt+P), pick the provider, model and effort. With **Stave Auto**, Stave picks the model to match the request's difficulty.
3. Write what to do and what done looks like. Example: "Return to the original page after login, and add a passing redirect test."
4. Select **Send**.

Screens: [Select model](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/model-picker.png)

The composer has four trigger characters.

| Key | What it does                                   |
| --- | ---------------------------------------------- |
| `/` | Commands (for example `/aside` for a side question) |
| `$` | Attach a skill to this message                 |
| `!` | Run a saved macro                              |
| `@` | Reference a task, an Information item or a file |

## 3. While a turn runs

```sequence "What happens in one turn"
participant U You | composer
participant S Stave | desktop app
participant P Provider | Claude Code · Codex and others
U -> S: Send a request | with instructions and context
S -> P: Start the turn
P => S: Thinking · tool calls · reply
P -> S: Approval request | a tool that needs permission
S -> U: Show the approval row
U --> S: Allow once · Always allow · Deny
S --> P: Pass the decision
P => S: Continue
P --> S: Turn ends
S --> U: Reply · changed files · summary
@caption A simplified turn. The approval step may not appear, depending on the permission preset.
```

**Reading and composing**: code blocks without a language have no syntax colors. The composer follows the conversation reading size, including the smaller Task panel size; the minimal composer scales its monospace text and caret together.

**Approvals**: when the AI wants a tool that needs permission, a row with **Allow once**, **Always allow** and **Deny** appears above the composer. **Always allow** shows on every approval surface whenever the grant can be kept: by the provider itself, or as an entry in your trusted approvals. The row shows a risk the request reports, such as **Network access**. Its disclosure names a subagent that asked and adds **guide instead** and **Deny & guide**. Typing while an approval waits turns the send button into **Decline and steer**. In an approval card, Cmd/Ctrl+Enter allows the request once; Esc never denies it. A request nobody answers is denied automatically after a time limit, and the card and the row's disclosure say when (**Auto-denies at 16:24 if nobody answers**). After **Always allow**, the answered card shows **Trusted: <entry> · Remove**, and **Remove** takes the entry back out.
Screens: [Approval request](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/approval.png)

**Progress line**: while a turn runs, the line above its steps shows only the step in progress (for example **Reading search.ts**). Before a step is available, it shows **Thinking**. The elapsed time remains in the message footer. Once the turn ends it becomes the turn's title. A turn that searched or fetched the web ends with **Sources** and a count under the answer; open it to list each page once.

Thinking bodies render Markdown, including bold text, lists and code, both while running and after completion. Tool arguments, output and command lines have a copy icon; a check mark confirms success, and a failed copy reports an error.

Tool output, reasoning, and folded tool groups load their bodies on first open and keep them after closing. Open a body before using browser find or printing its contents.

**Questions**: when the AI asks a question with choices, the number keys pick an option. A Claude option can carry a preview, such as a code snippet; it shows under the options while that option has focus or the pointer.

**Queue**: messages sent while a turn runs wait on the shelf above the composer. Each has **Steer** (fold it into the running turn), **Send**, **Edit** and **Delete**; **Clear all** empties the shelf. A queue restored after a restart waits until you select **Resume**. Select **Stop** to stop the turn.

**Transcript**: messages you send back to back, such as steers, stack together with one note under the last (**Steered into active turn · 3**); hover any of them for its own copy and time actions. When a reply ran on a different provider, model or effort than the reply before it, a line above it names the change (**Claude Sonnet 4.6 · Medium → Claude Opus 4.8 · High**).

**Usage limits**: when a provider hits its usage limit, a usage-limit line appears on the shelf. **Resume at reset** continues automatically when the limit resets; **Resume now** tries again right away.
Screens: [Queue and usage limit](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/queue-usage-limit.png)

**Activity tab**: the Task panel's **Activity** tab lists the turn's steps. The **List | Timeline** switch draws the same turn on a time axis labelled in seconds or minutes (0s, 30s, 1m): the turn row with its tokens and cost, tool calls and subagents as bars, a **Now** line while it runs, and a **Slowest** tag on the longest step. Steps without a recorded time are listed under the axis instead. The **Agent tree** folds branch by branch and moves with the arrow keys. In the conversation, a tool call's arguments and output each have **Copy**, and long output scrolls inside a fixed height with a line count under it.

## 4. Check the changes and open a PR

1. Use **Source Control** in the right panels to see changed files and history.
2. Open Review mode with the **Conversation / Review** switch above the task tab (Cmd/Ctrl+Alt+R). Leave line comments on the diff and send them with **Send review to agent**. See [Review and delegation](#review).
3. Select **Create PR** in the top bar to open the pull request dialog, where you pick the merge method and auto-merge. GitHub CLI (`gh`) must be signed in.
4. Once the PR exists, a status chip in the top bar lets you mark it ready, update the branch, merge, or open it on GitHub.
5. When the work is done, choose **Archive Workspace** from the workspace row's ⋮ menu. Turn on **Delete the git branch too** to delete the branch as well.

@page context | Working | Giving the AI context | concept
@lead The AI does not see only the sentence you typed. Stave bundles repository instructions, workspace information, attachments and skills into every turn. Knowing what goes in saves you from repeating yourself.

```diagram architecture "What goes into a turn"
box instr 1,1 | Repository instructions | Settings > Projects > Repository | Claude and Codex turns
box files 1,2 | Project files | CLAUDE.md · AGENTS.md | Read by the provider itself
box info 1,3 | Information panel | Shared instructions · notes · links | When the Local MCP Server is on
box attach 3,1 | Attachments and references | Files · images · @task · @info | This message only
box skills 3,2 | Skills | $skill name | The whole SKILL.md
box memory 3,3 | Repository memory | When relevant · always included | Collection is off by default
box turn 2,2 primary | Turn | Your message | Sent to the provider
edge instr -> turn
edge files -> turn dashed
edge info -> turn
edge attach -> turn
edge skills -> turn
edge memory -> turn
@caption A simplified view of how the app assembles a request. Whether repository instructions reach Cursor, Kiro and OpenCode turns was not confirmed.
```

## Ways to give context

| Method                  | How                                                          | Worth knowing                                                                |
| ----------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Files and images        | The paperclip in the composer (**Attach files**); paste or drop files on the composer | A drop shows **Drop to attach** and attaches the way a paste does |
| Other tasks             | `@` and part of a task title, or drag a task from the sidebar | Choose **Latest reply** or **Recent conversation**; up to 5 per message     |
| Skills                  | Type `$` and pick one                                        | The skill's whole SKILL.md goes with the message                             |
| `@web`                  | Write `@web` in the message                                  | Uses the provider's Chrome integration; scope in Settings > Browser > Mentions |
| Information panel       | Keep notes, todos and links there                            | Jira and PR links pasted into a prompt are added to the panel automatically  |
| Repository instructions | Settings > Projects > Repository > **Repository Instructions** | Included in every Claude and Codex turn in this repository                 |
| Repository memory       | Information > **Memory**                                     | Collection is off by default; 280 characters per entry, up to 6 per turn. Forgetting asks nothing; **Undo** in the notice that follows restores the entry. Search and kind chips appear from 8 entries |

```callout note "For the Information panel to reach the AI"
The Information panel, task context and the latest turn summary are attached to a turn only while **Settings > MCP > Local MCP Server** is on. If the AI seems unaware of your notes or links, check this first.
```

## Features that keep you in flow

- **Side question**: **Side question** in the composer toolbar, `/aside`, or Cmd/Ctrl+K then Q. The answer is read-only and never added to the task. Claude and Codex only.
- **Welcome back**: after you have been away for more than 15 minutes, a card summarizes what happened and the last decision.
- **Handoff**: in Task panel > **Handoff**, fill the record with **Fill from this task** or **Ask the agent to update**. A provider receives this record first when it starts on or returns to the task. Lines that do not fit in a section's 2,000 characters stay listed under it with **Put back**.
- **Enhance prompt**: the wand icon in the composer rewrites your request. The **Prompt enhanced** toast offers **Undo** and **View changes**, which shows removed words struck through and added words underlined, with **Keep** and **Revert to original**.
- **Context meter**: in the composer, shows how full the conversation is and the tokens left. For Claude, **Composition** lists what fills it (system prompt, tools, MCP tools, memory files, skills and an estimated conversation); other providers report only the total. **Compact context** shortens a long conversation. Wide composers show used / limit tokens; narrow composers show the percentage. During compaction, the notice shows elapsed time when known; inactive restored messages stop counting.
- **Macros**: in the composer toolbar, opens your saved macros with a search over name, `!slug` and description.

@page safety | Working | Permissions and safety | guide
@lead Each provider has a Mode Preset that sets what the AI may do without asking. New installs start every provider on the widest preset, **Auto**, so check it once at the start.

```callout warning "The default is Auto"
On a new install, Claude, Codex, Cursor, Kiro and OpenCode all start on **Auto**. Codex starts with full disk access, no approvals and network on. For a repository that needs confirmations, switch to **Guided** or **Manual** in **Settings > Providers > Mode Preset**.
```

## What each preset does

Screens: [Settings > Providers](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/settings-providers.png)

| Provider | Manual                                         | Guided                                     | Auto                                                     |
| -------- | ---------------------------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| Claude   | Default permission mode, sandbox on            | File edits allowed automatically, sandbox off | Claude's classifier decides, sandbox off              |
| Codex    | Read-only, approvals on request, network off   | Workspace write, approval for untrusted commands, network off | Full disk access, no approvals, network on, live search |
| Cursor   | Asks before every tool call                    | Cursor's own auto-review                   | Runs every tool call and trusts MCP servers              |
| Kiro     | Asks before every tool call                    | None                                       | Approves everything                                      |
| OpenCode | Asks every time, reads included; no subagents  | None                                       | Approves every request; your OpenCode `deny` rules still apply |

The composer's preset menu and **Settings > Providers** list, under the selected preset, what it does on its own and what it asks about first, one row per kind of action (reading files, editing files, running commands, web tools, MCP tools and so on). For Claude the list also shows the guardrails you left on (G1–G3), which always ask in Agent mode whatever the preset. Other providers have no such fixed rows.

Changing an individual field turns the preset into **Custom**. The runtime chip in the composer shows the current state as **Safe**, **Custom** or **Elevated**.

## Different settings per repository

Pick a repository in the scope picker at the top of Settings (it starts on **All projects**) to set model, effort and permissions for that repository only. To return to the shared value, use the field's global-value option.

## Guardrails for agent runs

When a task runs as an agent, guardrails G1 to G3 are on by default: they block writes outside the repository, access to credential paths, and irreversible remote actions. Claude enforces all three with a hook; Codex enforces only G1, writes outside the repository, through its sandbox.

## Secrets

Do not paste values such as API keys into the chat. When an agent asks for one, a masked input card appears above the composer. Save it with **Save and bind**, or pick one with **Use saved secret**. Values are stored in the operating system's credential store, and the AI only receives the variable name. To manage them yourself, use **Settings > Secrets > Add secret**.

@page agents | Hand off | Agents and runs | concept
@lead An agent is a saved worker with instructions, model, permissions and stages. Assigning an agent to a task starts a run, and Stave carries it through, checking each stage and the done-when conditions.

```diagram architecture "Agents, tasks and runs"
box agent 1,1 primary | Agent | A saved definition | Instructions · model · permissions · stages
box task 2,1 | Task | A conversation with an assigned agent | One run at a time
box run 3,1 primary | Run | Goes through the stages in order | Done when · team limits
box stage 4,1 | Stage | An AI stage or a Stave action | Draft PR · watch checks · script
box sub 3,2 | Delegated task | A subagent | A reviewer, for example
box fleet 4,2 | Fleet View | When you are needed | Answer · approve · sign off
edge agent -> task main : assign
edge task -> run main : starts
edge run -> stage main : in order
edge run -> sub dashed : delegate
edge run -> fleet dashed : needs a person
@caption A conceptual diagram based on the app's agent model. An agent starts nothing by itself; a run exists once it is assigned.
```

## Create an agent

Open **Agents** in the sidebar (Cmd/Ctrl+K then G). The tabs are **Agents**, **My standards** and **Performance**.
Select **New agent**, use **Draft agent** to draft one from a description, then edit it.
Agents come from three sources: built-in, custom, and from the repository (files such as `.claude/agents/`).
The detail view offers **Assign…**, **Duplicate**, **Archive**, **Export** and **Write to repository**.
Screens: [Agents](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/agents.png)

Main settings under **How it runs**:

| Setting              | Choices                                        | Meaning                                                   |
| -------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| Permission           | Auto and others                                | Anything other than Auto stops the run at each approval card |
| Check in with me     | Only when stuck (default), Before publishing, Every stage | When the run waits for your confirmation between stages |
| Review before done   | When behavior changes (default), Always, Off   | When on, Work → Review → Fix review findings stages are added |

## Stages of a run

```pipeline "A run with Review before done"
Work | Does the work against the instructions and done-when conditions.
Review | Another agent reviews the changes read-only.
Fix | Fixes what the review found.
! Done check | Stave runs the workspace check command itself and confirms it passes.
@caption Work that changed no files ends without the review stages.
```

An agent without a workflow runs a single Work stage.
A stage is either an AI stage (an instruction plus done-when) or a Stave action: Open draft PR, Watch checks, Ready for review, or Run script.

## Run states

```diagram architecture "Moving between run badges"
box running 1,2 primary | Running | Working or waiting | Waiting uses no turns
box answer 2,1 | Needs your answer | Question · approval · stage sign-off | Back to Running once answered
box paused 2,2 | Paused | You paused · taken over | Back to Running on resume
box halted 2,3 | Halted | Blocked · limit · wait expired | Continue with the run line buttons
box done 3,1 | Completed | Done-when met | Report in Outputs
box stopped 3,3 | Stopped | Cancelled · reason card | Retry · Take control
edge running -> answer : needs a person
edge running -> paused dashed : pause
edge running -> halted : cannot continue
edge running -> done main : done check passes
edge halted -> stopped dashed : stop
@caption A simplified view of the run states and badges in the app code. From Needs your answer, Paused and Halted, answering or resuming returns the run to Running.
```

| Badge             | Meaning                                                                            | What to do                                |
| ----------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| Running           | Working. A waiting reason such as PR checks or a usage limit may be shown; waiting uses no turns | Wait                         |
| Needs your answer | A question or approval card is open, or the next stage waits for your sign-off     | Answer the card                           |
| Paused            | You paused it, or you have taken control                                           | **Resume** in Task panel > Progress       |
| Halted            | Blocked, recovery needed, wait expired, usage limit, or limit reached              | Continue with the run line buttons below  |
| Completed         | The done-when conditions are met                                                   | Read the run report in Outputs            |
| Stopped           | Cancelled, or ended with a reason card                                             | **Retry** or **Take control**             |

A run's time is its **Active for** time: pauses, waits for your answer or sign-off, and the time Stave was closed are not counted. Each stage in Task panel > **Progress** shows what its turns spent: a cost for Claude, tokens for Codex.

The run line above the composer shows the buttons that fit: **Retry**, **Extend (+10 turns)**, **Resume now**, **Continue**, **Stop**, and **Take control** (ends the run and continues as a normal chat on the same model).
Task panel > **Progress** shows **What this run does**, **Done when**, **Team limits** and stage cards (**Retry stage**, **Skip stage**).
Each done-when condition shows **Met · checked by Stave**, **Met · agent reported**, **Not met** or **Not verified**.
Screens: [Progress tab](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/agent-run-panel.png) · [Stage sign-off card](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/run-sign-off.png)

## Hand off a goal and walk away

1. In the agent's **How it runs**, set the permission to **Auto**.
2. Add a check command (for example `bun run typecheck && bun test`) in **Settings > Projects > Workspace Tools**. A run that changed files ends only when Stave runs this command itself and it passes.
3. If you want, turn on **Review before done**, or build Work, Review and Fix stages yourself.
4. Turn on **Settings > MCP > Local MCP Server**, and run `gh auth login` if you use PR stages.
5. In the agent's detail view select **Assign…**, write the outcome and how to prove it, pick **Where**, and assign. Picking the agent in the composer and sending also works.
6. Walk away. The run handles safe approvals, waits for PR checks and reviews, and waits for usage resets on its own.
7. Come back when Fleet View's **Action required** or a notification points at the run, then answer the card or continue with the run line buttons.
8. At the end, add the run report from Outputs to the PR description or share it to Slack.

@page review | Hand off | Review and delegation | guide
@lead Check changes yourself in Review mode, hand them to another model as an AI review, or let an agent create delegated tasks. Results gather in the Task panel's Outputs.

| Method         | Where to start                                                            | Result                                                                |
| -------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Review mode    | The **Conversation / Review** switch, **Review** on a changed-files card, Cmd/Ctrl+Alt+R | Diff, line comments, **Sign off** or **Ask for changes** |
| AI review      | **Request AI review** in the composer → **Start review**                  | A read-only child task reviews in one turn and returns a verdict      |
| Delegated task | An agent creates a child task, or a stage names another agent             | Watch and stop it in Task panel > **Subagents**                       |
| Outputs        | Task panel > **Outputs**                                                  | Saved answers, changed files, run reports. The **Unread** filter shows only new results |

Screens: [Review mode](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/review.png) · [Outputs](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/results.png)

## Send comments from Review mode

1. In Review mode, leave comments on diff lines.
2. Send them all at once with **Send review to agent** (Cmd/Ctrl+Alt+Enter).
3. Review again after the agent fixes them, and **Sign off** when it is good enough.

Review's **Diff comments** list opens each comment's line when selected. Remove a comment before sending it; a sent one says whether its lines changed since and offers **Resolve**. Sent comments stay after a restart until you resolve them.

**Mark reviewed** shows a notice with **Undo** for a moment. Once a review is decided, the main button becomes **Next review**, the next result or sign-off waiting in Fleet View; in Review, J and K move to the next and previous waiting review.

## AI review

An AI review runs as a read-only child task in the same workspace for one turn, and returns approve, approve with changes, or request changes.
Its progress shows on the shelf. When it is done, attach or view the result, run it again, or select **Check fixes** after fixing.

## Delegated tasks

An agent can hand part of its work to another agent. A delegated task is a real task under the parent task.
The **Subagents** tab shows whether each is running, waiting, needs you, completed or failed, and lets you view activity, open the transcript, or stop it.
**Needs you** means it asked a question or an approval and waits for a person; **Waiting** means it sits between turns on its own.
The counts above the list are filters (**All**, **Needs you**, **Failed**, **Running**, **Done**), and **Retry failed (N)** retries every failed delegated task with one set of instructions.
When two or more children write in their own worktrees, **Shared files** lists the files more than one of them changed, who changed each, and opens each worktree's diff. It compares files, not lines.
When a delegated agent waits for a person, the shelf tells you; answer in that task or with Reply to the delegated Agent.

The calling message also shows **Subagent results** above the answer. Running subagents appear as compact monitors with their model, current work, observed time and reported history. Fold a monitor with its header. Returned results appear as summary cards; select **View result** to expand the original answer and execution details, or **Collapse result** to close them. Unknown times and costs are omitted. The composer retains its compact summary. **Result received** means the child returned an answer, not that the parent verified or used it. **Open task** takes you to the child; if it is waiting on you, the button points to answering or reviewing approval there. While work runs, the trace header shows the latest active step on one line. When it ends, the header shows a short completion summary and the tool-call count on the right; expand it to read the full history. Questions remain visible outside the folded history.

Screens: [Subagent results](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/subagent-results.png)

@page automation | Automation | Schedules, check-backs and Fleet | guide
@lead Put repeating work on a schedule and work to revisit on a check-back. Whatever needs your hand, across all workspaces, gathers in Fleet View.

## Schedules and check-backs

| Aspect       | Schedule (new task)                               | Check-back (existing task)                                      |
| ------------ | ------------------------------------------------- | --------------------------------------------------------------- |
| What it does | Creates and runs a new task in a repository each time | Adds a turn to one existing task to wake it again           |
| Where        | Top bar **Schedules** > **New schedule** > **New task in a repository** | **Check back…** in the task tab menu, or **New schedule** > **An existing task** |
| When         | A set time or cadence, or **Run now**             | **On a cadence**, **When subagents finish**, **When its pull request needs fixing** |
| States       | On, Off (runs only from **Run now**)              | On, Paused, Stopped                                             |
| Limits       | 1 to 8 concurrent runs (default 1)                | One per task. Claude and Codex only. Pauses while that task has an active agent run |

Cmd/Ctrl+K then A also opens Schedules. Start-a-task schedules that an agent creates through MCP start Off; check them, then choose **Turn on**.
Screens: [Schedules](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/schedules.png)

## Fleet View

Fleet View collects tasks from every workspace in the order you should act on them. The sidebar's **Work queue** view uses the same order.

```pipeline "What to look at first"
! Action required | Things you must answer: questions, approvals, failures, stage sign-offs
In progress | The AI is working, or a run is waiting
In review | A result is ready, or there is a PR
Idle | Tasks with nothing to do right now
@caption This is a priority order, not a flow. Fleet View and the Work queue list lanes top to bottom in this order.
```

| Lane            | What lands there                                                     |
| --------------- | -------------------------------------------------------------------- |
| Action required | Questions, approvals, failed runs, stage sign-offs, blocked or stuck runs |
| In progress     | Tasks whose turn is running or whose run is waiting                  |
| In review       | Tasks with a ready result, a PR, or no updates for a while           |
| Idle            | Tasks with nothing to do                                             |

Approve right in the row with **Allow** and **Deny** (A and D keys), and answer short questions by picking an option. **Always allow** is in the expanded panel. Rows also offer Open, Mark read, Dismiss, Open PR and Snooze. When a row leaves after one of these, focus moves to the next row, and the **Action required** count reads as a sentence such as "2 waiting on you". J and K move between rows like the arrow keys. A wait's age turns to the warning color after an hour and the failed color after a day.
Below the band, the activity filter and the **Tree** / **Cards** / **Table** switch each take one Tab stop and change with the arrow keys. While a filter or search narrows the board, its chips appear under the toolbar; remove one, or use **Clear all**.

Below that band, the board opens on **Tree**. Each open task is an agent card with its status, model, the tools it used and what it is doing, under a line that counts agents, running ones, the ones that need you, and the reported cost. A task whose Subagents tab you opened also counts the files its subagents changed in common. Select a card (or press Enter) to see its subagents beside it, or below it in a narrow window. A waiting subagent offers **Answer** and a failed one **Open**; both open its own task. **Cards** shows one card per workspace and **Table** one row per task; select a column header to sort by it (again to reverse, a third time for the Work queue order). If you used Cards before, Fleet switches to Tree once after the update; the layout you pick after that is kept.
Screens: [Fleet View](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/fleet.png)

## Notifications and issues

- **Notifications** in the top bar collect questions, approvals and completions. An agent run notifies once each for a sign-off request, blocked, stuck and completed. An approval answers with the same **Allow** and **Deny** (A and D keys) as Fleet View. New notices also show as toasts at the top-center. Branch status notices appear at the bottom-right, above the composer and the status bar.
- **Issues** in the top bar lists the Crane and Jira issues assigned to you; **Assign to agent** starts one locally. Connect them in **Settings > Integrations > Issues**. **Filter** opens one searchable list of source, status, priority, project and label values, and **Updated** beside it keeps tickets updated today or in the last 7, 30 or 90 days or this month; the applied filters show as chips you remove one at a time or with **Clear all**, beside the number of matching issues.

@page tools | Tools | Workspace tools | reference
@lead Tools you use outside the conversation. Most open from a right-panel button or Cmd/Ctrl+K followed by one letter.

## Tool list

| Tool              | How to open                                                | What you mostly do                                                                    |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Terminal          | **Terminal** in the right panels, Cmd/Ctrl+K then the backtick key | A shell in a work-area tab. The tab's + menu has **New Terminal** and **New CLI Session** (Claude, Codex) |
| Command palette   | Cmd/Ctrl+Shift+P                                           | Search app actions, tasks and settings. Scope: **This workspace** or **All repositories** |
| Go to file        | Cmd/Ctrl+P                                                 | Open a workspace file by name                                                         |
| Workspace Tools   | **Workspace Tools** in the right panels, Cmd/Ctrl+K then S | Saved commands, processes such as dev servers, and triggers, stored in `.stave/scripts.json` |
| Lens              | Lens in the right panels, Cmd/Ctrl+K then L                | A built-in browser tab. **Pick element** and **Visual comments** add page context to the task draft |
| Information panel | **Information** in the right panels, Cmd/Ctrl+K then I     | Todos, notes, links, documents, memory. **Create task** from a link row               |
| Inline HTML pages | Shown by an agent in the conversation                      | See charts, tables and mockups in the chat; **View source**, **Save as HTML file**    |
| Standalone CLI    | **Open Standalone CLI** in the top bar                     | Opens a CLI outside any workspace; set its folder in Settings > General              |
| MCP               | Settings > MCP                                             | **Add server**, then **Review change** and **Apply change**. The **Local MCP Server** card |

Inline HTML pages accept up to 5,120,000 characters, including the agent’s pre-display check. Workspace `.html` and `.htm` file previews accept up to 10 MiB (10,485,760 bytes) without a dev server; other text files have a 1 MiB preview limit.

Screens: [Command palette](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/command-palette.png) · [Workspace Tools](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/workspace-tools.png) · [Information panel](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/information-panel.png) · [Lens toolbar](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/lens.png) · [Settings > MCP](https://github.com/sendbird/stave/blob/main/docs/screenshots/guide/en/settings-mcp.png)

```callout tip "Keep the Local MCP Server on"
The AI can use Stave features such as the Information panel, workspace documents, schedules and Lens only while **Settings > MCP > Local MCP Server** is on. Agent runs need it too.
```

Lens opens only in the desktop app. Closing a CLI tab ends its process.

## Common shortcuts

macOS uses Cmd; Windows and Linux use Ctrl. See the full list with Cmd/Ctrl+/.

| Keys                     | Action                               |
| ------------------------ | ------------------------------------ |
| Cmd/Ctrl+N               | New task                             |
| Cmd/Ctrl+,               | Settings                             |
| Cmd/Ctrl+Shift+P         | Command palette                      |
| Cmd/Ctrl+P               | Go to file                           |
| Cmd/Ctrl+Shift+T         | Reopen closed tab                    |
| Cmd/Ctrl+Alt+R           | Toggle Review mode                   |
| Alt+P                    | Select model                         |
| Alt+1 to Alt+0           | Switch to the model mapped to that key |
| Cmd/Ctrl+K then G        | Agents                               |
| Cmd/Ctrl+K then A        | Schedules                            |
| Cmd/Ctrl+K then Q        | Side question                        |

@page help | Help | Troubleshooting | reference
@lead Where first-time users usually get stuck, and what to do. The repository's feature guides have the full detail.

## By symptom

| Symptom                                    | What to do                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| No provider in the model list              | Install and sign in to a CLI, then check **Settings > Accounts > Getting started**          |
| All right-panel buttons are disabled       | Open a repository first                                                                     |
| The AI does not know your notes or links   | Turn on **Settings > MCP > Local MCP Server**                                               |
| An agent run stops at every approval       | Check that the permission under the agent's **How it runs** is Auto                         |
| A run is halted with limit reached         | Select **Extend (+10 turns)** on the run line                                               |
| Stopped by a usage limit                   | **Resume at reset** or **Resume now**. With several accounts, turn on the run's account pool |
| Create PR or the PR status is missing      | Run `gh auth login` in a terminal                                                           |
| A closed task tab is gone from the list    | Closing is not archiving. Reopen it from Task History                                       |
| A dropped folder was not attached          | Drop or pick its files; attachments are files, not folders                                  |
| The Lens button is disabled                | It works only in the desktop app; also check that a repository is open                      |

## More documentation

- Feature guides: https://github.com/sendbird/stave/tree/main/docs/features
- Install guide: https://github.com/sendbird/stave/blob/main/docs/install-guide.md
- Agent runs: https://github.com/sendbird/stave/blob/main/docs/features/agent-runs.md
- Permissions and sandbox: https://github.com/sendbird/stave/blob/main/docs/features/provider-sandbox-and-approval.md

@page about | Help | About this guide and updates | informative
@lead This guide's source and screenshots live in the Stave repository. When a user-facing feature changes, the same PR updates the source and screenshots, and a new Heron revision is published.

```pipeline "Updating the guide when a feature changes"
Code change | User-facing behavior, labels or flow change.
Edit source | Update docs/heron/user-guide.ko.md and user-guide.en.md together.
Screenshots | Re-capture changed screens with the capture-guide-screenshots script.
! Validate | Heron validation must report no errors.
Publish | Create a new revision; a product owner publishes it.
```

## Where the source and screenshots are

| Item              | Location                                                 |
| ----------------- | -------------------------------------------------------- |
| Korean source     | `docs/heron/user-guide.ko.md`                            |
| English source    | `docs/heron/user-guide.en.md`                            |
| Screenshots       | `docs/screenshots/guide/ko`, `docs/screenshots/guide/en` |
| Screenshot script | `node scripts/capture-guide-screenshots.mjs`             |

Screenshot links point at the `main` branch on GitHub. Once re-captured screenshots are merged, the guide's links show the new screens.

## What this edition checked and did not check

- Labels and behavior were checked against the Stave 0.29.2 source and its Korean and English copy files.
- Screenshots were captured from development screens with synthetic data. Behavior with a real signed-in provider was not re-run for this edition.
- The Lens screenshot comes from the browser build, so only the toolbar is shown.

## Finding text and navigating views

Press Cmd+F / Ctrl+F while focused in the conversation or its composer, or hover the transcript and choose the search button in its top-right corner. The find bar floats over the transcript and does not move messages. It searches loaded message text, including messages outside the viewport, and excludes thinking and tool parts. Load older messages to search earlier history. Enter and Shift+Enter move between matching messages.

In a terminal, Cmd+F / Ctrl+F searches the retained terminal buffer. Enter and Shift+Enter move between matches; Escape closes the search. The terminal header shows Running or the completed command's exit code.

Closing Fleet, Agents, Schedules, Issues, or AI usage returns to the previous view. F6 and Shift+F6 cycle window regions. The sidebar view switch has text labels. Fleet without repositories offers Open repository.

When saving conflicts with a file changed on disk, use Compare, Keep mine, or Reload from disk in the editor banner. Saving again does not overwrite disk silently. Chat and Review diffs follow your diff display setting and collapse unchanged lines. Settings aligns short controls at the end of each row, and older changelog releases are collapsed. Markdown previews wrap paragraphs normally and offer highlighted code with copying.
