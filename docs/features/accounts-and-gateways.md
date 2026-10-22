# Accounts And API Connections

## Summary

- Stave runs Claude and Codex with the sign-in their CLIs already use on this computer. That sign-in is the **System default** account, and you do not need to set anything up to use it.
- Add an account when you want a second Claude or Codex subscription, for example work and personal. Each account has its own sign-in, conversation history, and usage limits. Stave shows who each account is signed in as, and a new account can reuse your skills and instructions from System default.
- Add an **API connection**, such as a company Vercel AI Gateway key, when turns should be billed per token instead of a subscription. One connection serves both Claude and Codex with the same key, and it can offer open models such as Kimi, GLM, Qwen, DeepSeek or gpt-oss.

## When To Use It

### Which Do I Need?

| You want to | Use | Who bills you | Sign-in |
|---|---|---|---|
| Keep using the CLI login you already have | **System default** (nothing to do) | Your current Claude or Codex plan | Already done in the CLI |
| Use a second subscription, such as work and personal | **Add an account** | That account's own plan and usage limits | Once per account, in the terminal Stave opens |
| Use a company API key for Claude, Codex or both, through a gateway such as Vercel AI Gateway | **Add an API connection** | The gateway, per token | None. The key is saved in Secrets |
| Try open models such as Kimi, GLM, Qwen, DeepSeek or gpt-oss | **Add an API connection**, pin those models and use them in Codex | The gateway, per token | None |
| Keep using an open model that keeps failing in Codex | **OpenCode**, as a fallback; install the OpenCode CLI first | The gateway, per token, through the key you connect in OpenCode | In the OpenCode CLI |

## Before You Start

- Install the CLI for the provider: `claude` for Claude Code, `codex` for Codex. **Getting started** in Settings > Accounts says whether Stave found them and copies the install command; Settings > Tooling shows the path and version.
- Open a workspace. The sign-in terminal runs inside the active workspace, so Stave asks you to open one first.
- For an API connection, have the gateway's API key ready. You can paste it while adding the connection, or save it in **Settings > Secrets** first.

## Quick Start

New to Stave? Open **Settings > Accounts** and follow **Getting started** at the top. It lists what is left before your first turn, in order, with one button per step:

1. **Install a provider CLI**: Claude Code, Codex, Cursor, Kiro or OpenCode. It copies the Claude Code or Codex install command, or opens Settings > Tooling.
2. **Sign in**: for Claude Code or Codex, opens the sign-in terminal for System default; with no workspace open, it asks you to open a repository first. For Cursor, Kiro or OpenCode, **How to sign in** goes to that CLI's row, which copies its own login command. **Check again** asks every CLI again.
3. **Add another account** (optional): goes to the **Add an account** form.
4. **Connect a gateway** (optional): goes to the **Add a connection** form.
5. **Pick a model**: closes Settings and opens the composer's model selector. The selector is in a task's composer, so the button stays off and says **Open a task first** until a task is open (or **Open a repository and a task first** without a workspace).

Any of the five providers counts: once one of them can take a turn (its own CLI is installed and its own sign-in, or its selected API connection, works), steps 1, 2 and 5 are done. A sign-in Stave remembers for a provider whose CLI is gone does not count. Each step updates as you work; closing the sign-in terminal checks again. **Skip** marks an optional step as done, and **Hide** folds the list. Both are remembered. Once every step is done or skipped, the list folds to one line on its own. When you open Stave and no provider can take a turn yet (Claude Code, Codex, Cursor, Kiro and OpenCode all included), the welcome screen shows the required steps with **Open Accounts**.

To add a second subscription:

1. Open **Settings > Accounts**. You can also search Settings for "account" or "sign in", choose **Add an account** in the status bar usage meter, or run **Add an account** from the command palette.
2. In **Claude accounts** (or **Codex accounts**), under **Add an account**, type a name such as `Work`.
3. Leave **Use my skills and instructions from System default** checked to start the account with your setup, or clear it for an empty account.
4. Choose **Add and sign in**. Stave creates a folder for the account, shares your setup into it, and opens a sign-in terminal below the form.
5. Follow the steps in the terminal; it may open your browser. When the terminal says you are signed in, choose **Close sign-in terminal**. The account then shows **Signed in as** your email and plan.
6. Pick the account for new turns: in the status bar usage meter, or in **Account for new turns** at the top of the card.

You sign in once per account, not once per CLI binary. The sign-in is saved in the account's own folder, so it keeps working in every task and CLI tab that uses the account, whichever Claude or Codex binary runs it.

## Interface Walkthrough

### Entry Points

- **Settings > Accounts** (first item under AI & Agents), from top to bottom:
  - **Getting started**: the steps above.
  - **Choose how you pay**: your subscription, another subscription, or a company gateway key. Each button goes to its form; a way you already use reads **In use**.
  - **Claude accounts** and **Codex accounts**: add, rename, sign in, and remove accounts.
  - **Cursor, Kiro and OpenCode sign-in**: whether each CLI is signed in, and **Copy Login Command**. These CLIs keep their own sign-in, so Stave does not manage accounts for them. **CLI not installed** links to Settings > Tooling.
  - **API connections**: add, check, edit, and remove API connections.
- **Settings > Tooling** keeps CLI paths, install status, and versions. Its top card points to Settings > Accounts.
- **Composer model selector**: its foot names a provider you set up that stopped working, with the button that fixes it: a CLI that is installed but not signed in (for Cursor, Kiro and OpenCode the button goes to that CLI's row), or an API connection whose key Stave cannot read. A CLI that is not installed is not listed there; the composer line covers the task's own provider, and **Getting started** and **Manage accounts and connections…** cover installing. It offers **Add other models with Vercel AI Gateway…** when you have no API connection, and ends with **Manage accounts and connections…**. An API connection's group has **Edit models**, which opens that connection's edit form.
- **Composer**: when the task's provider cannot send with its selected account, a line above the input says why, with one button: **Sign in**, **Connect key**, **Switch account**, **Add an account**, or **Set up**. For Cursor, Kiro and OpenCode the button goes to that CLI's row in Settings > Accounts. The usage-limit line follows the same rule as sending: it checks the selected model, so a limit only another model uses does not show it, and Stave Auto never shows it because it routes around an exhausted account. Nothing shows while sending works.
- **A turn that ended on the account**: under a sign-in failure, **Open Accounts** (for Cursor, Kiro and OpenCode, at that CLI's row); under a Claude Code or Codex usage-limit failure, **Switch account** (or **Add an account** when there is no other account).
- **Status bar usage meter**: shows the account new turns use and its usage, and switches accounts when there is more than one. An API connection is listed there as an account, marked **API billing**; a Vercel AI Gateway connection also shows its credit balance. **Manage accounts** and **Add an account** open Settings > Accounts.
- **Command palette**: **Open Settings: Accounts**, **Add an account**, and **Add an API connection**.
- **Standalone CLI**: each Claude Code and Codex tab has its own account select. See [Standalone CLI](standalone-cli.md).

### Key Controls

- **Account for new turns**: the account the next turns use. It appears only when the provider has two or more accounts. API connections that serve the provider are listed here too.
- **Sign in**: opens `claude auth login` or `codex login` for that account in a terminal. Stave cannot read the result from the terminal; after you close it, Stave checks who is signed in and refreshes usage for the account new turns use.
- **Signed in as <email> · <plan>**: under each account's name in Settings, and under it in the status bar switch. It reads **Not signed in** when the account has no sign-in, and **Can't check sign-in** when the check did not finish. **Check again** asks again. It shows only an email and a plan; a field the CLI does not report is left out, not guessed.
- **Use my skills and instructions from System default**: shares your setup from System default into an account Stave created. Turn it off to stop sharing. See [Share your setup](#share-your-setup-between-accounts).
- **Update copied settings**: copies System default's settings into the account again.
- **Save name**: renames an account. The name is only a label; the folder and sign-in stay the same.
- **Remove**: forgets the account in Stave. Its folder and sign-in stay on disk. If new turns used it, they go back to System default.
- **Advanced: reuse a folder you already use**: registers a folder you already signed in to, such as one you use with `CLAUDE_CONFIG_DIR` or `CODEX_HOME`. Stave uses the sign-in saved there and skips the sign-in step.

## Common Workflows

### Add A Second Subscription

1. Follow [Quick Start](#quick-start) with a name such as `Personal`.
2. Sign in with the other subscription in the terminal.
3. Switch between the accounts from the status bar whenever you start new work.

By default a new account starts with your System default setup. Clear **Use my skills and instructions from System default** before you add it if you want an empty account. Instructions and settings stored in the repository apply either way.

### Share Your Setup Between Accounts

Claude and Codex read skills, instructions, and settings from the account's own folder, so a new account would otherwise start without any of them. Sharing fills that in from System default. It applies to accounts Stave created; a folder you registered yourself and an API connection are never changed.

| What | Claude | Codex | How |
|---|---|---|---|
| Skills | yes | yes | Linked. A skill you add later appears in every account. |
| Agents, commands, plugins | yes | prompts only | Linked, the same way. |
| Instructions (`CLAUDE.md`, `AGENTS.md`) | yes | yes | Linked. Edit them once. |
| Settings | yes | no | Claude's `settings.json` is copied, not linked, and Stave leaves out keys that name an API key or a login rule and `env` entries that look like credentials. Codex's `config.toml` can hold endpoint and credential settings, so it is not shared. |
| Sign-in | never | never | Every account signs in on its own. |
| Conversation and prompt history | never | never | History stays with the account that made it. |
| MCP servers | yes | with `config.toml` | Claude: the user and local MCP servers in System default's `.claude.json` (for example ones added with `claude mcp add --scope user`) reach every task and CLI tab the account runs. Stave reads them at launch and never copies `.claude.json`, which also holds the sign-in. A server the account defines itself with the same name wins. Codex keeps MCP servers in `config.toml`, so they are shared only while that file is linked. |

- If the account already has its own version of an entry, Stave keeps it and says so under the checkbox.
- Use **Update copied settings** after you change System default's settings; the copy is replaced only while you have not edited it in the account.
- Clearing the checkbox removes the links and an unedited settings copy that Stave added. It never touches your System default folder or anything the account owns.

### Switch Accounts

Switching changes **new turns only**:

| What | Account it uses after you switch |
|---|---|
| A turn you send next | The new account |
| A turn already running | The account it started with |
| A queued message | The account it was queued with, unless a usage limit paused it |
| A turn or queue a usage limit paused | The new account, when you resume it |
| An Agent run | The account selected when it started, for every turn it starts itself, until a usage limit moves it within its account pool (only when you turned the pool on). Your replies follow the first row |
| A subagent an agent starts | The account of the turn that started it, follow-ups included |
| A review, follow-up or retry you start | The new account |
| An open Standalone CLI tab | Its own account until you switch that tab |

Agent runs can use API connections. Each automatically started turn resolves
the key in the main process using the account captured when the run started,
including after an app restart or key replacement. Keys are not saved in the
run, sent to the renderer, or included in the Agent's prompt.

Delegated turns with no explicit model resolve a model from the captured
connection. Wake-ups and report follow-ups reuse the task's captured accounts
and resolve a fresh key for every new turn.

Auto uses only the models pinned on the selected connection, intersected with
your allowed-model settings. The Agent editor's fixed-model picker and Auto
settings use the same account catalogs as the composer.

A Gateway decision model such as Jev can classify work while Claude or Codex
executes it on a subscription account. Choose it under Settings → Auto →
Routing decision model; the Agent editor can inherit or override that choice.
The default remains available Luna first, then Haiku. See [Auto routing](auto-routing.md).

Provider conversations belong to the account that started them. **Copy debug info** in a task tab's context menu lists one provider session per account, suffixed with the account id when it is not System default.

### Resume After A Usage Limit

When an account limit stops a turn or refuses a queued message, the composer
pauses the task's queue. Choose **Resume now** to try again, or **Resume at
reset** to reserve a retry one minute after the reported reset. Automatic
resume checks usage again and waits for another exhausted window if needed.
If no reset time is known, resume manually.

Switching accounts is how you get past a limit: resuming the paused work, by
hand or at the reserved reset, continues the stopped turn and sends the held
queue on the account selected when it resumes. Messages queued behind a turn
that is still running keep the account they were queued with. **Resume now**
still passes through the usage guard; it does not override a limit on the
account it resumes on. The reservation runs only while Stave is open and is
not saved across restarts.

See [When A Usage Limit Stops Work](turn-activity.md#when-a-usage-limit-stops-work)
for continuation behavior, cancellation and restored queues.

### Let An Agent Run Continue On Your Other Accounts

An Agent run can move to another of your own subscription accounts when a
usage limit stops it, but only if you turn on its **Account pool** before it
starts (the composer's **Account pool** button). It is off by default.

- The pool holds the provider's subscription accounts whose sign-in check
  confirms a sign-in: the account the run starts on, then the others in the
  order they appear in Settings. Signed-out accounts and accounts whose check
  failed stay out.
  You can leave accounts out; to change the order, reorder them in Settings.
  API connections are never part of a pool, so a run never falls back to
  per-token billing, and Stave never adds an account.
- At a limit, Stave checks the other accounts' usage in that order and
  continues on the first with usage left, in a new provider conversation on
  that account with the run's briefing. If none has usage left, the run waits
  for the earliest reset among them.
- Each switch shows as **Account switched · <from> → <to> · usage limit** in
  the transcript and the run report, without a notification.
- Automatic account switching may be limited by each provider's terms.

See [Agent Runs: Continue on another account](agent-runs.md#continue-on-another-account-account-pool).

### Reuse A Folder You Already Use

1. Under **Add an account**, type a name.
2. Open **Advanced: reuse a folder you already use** and enter the folder's absolute path.
3. Choose **Add account**. Use **Sign in** on the account later only if that folder is not signed in yet.

Each folder can belong to one account, and the System default folder cannot be added again.

### Use A Company Gateway Key With Claude And Codex

An API connection is one gateway key that both Claude Code and Codex can use. This is how a company Vercel AI Gateway key works:

1. In **Settings > Accounts > API connections**, under **Add a connection**, keep **Vercel AI Gateway**.
2. **Key**: choose a key saved in Secrets, or choose **Paste a new key**, paste it, and choose **Save key**. Stave saves the key encrypted in Settings > Secrets (named `Vercel AI Gateway` unless you change it) and picks it. The connection stores only a reference to the key.
3. **Name**: type a name such as `Company gateway`.
4. **Models**: under **Find models on Vercel AI Gateway**, search and **Pin** the models you want, for example `anthropic/claude-sonnet-5`, `openai/gpt-6-astra` and `zai/glm-5.3`. Each row shows the model's context window and its list price per 1M input and output tokens. Models you pinned on your other connections are offered first, when the catalog lists them.
5. The step line under the form shows which of key, name, and models are done. Choose **Add connection**, then **Check connection** in the box that follows. Stave asks the gateway whether it accepts the key and lists the pinned models; no prompt is sent and nothing is billed.
6. Choose **Use in Codex** (or **Use in Claude Code** for a connection that serves only Claude Code). Stave makes the connection that runtime's account for new turns and opens the composer's model selector. The runtime is checked again after the switch, so its tab can take a moment to appear; the selector then moves to it, at the connection's group, unless you picked another tab first. With no workspace open the button is off. With a workspace but no task open there is no composer to open, so the button only switches the account: Settings stays open and says that new turns now use the connection, and you pick its model once you open a task. You can also pick the connection in the status bar account switch, or in **Account for new turns** in the **Claude accounts** or **Codex accounts** card. Each runtime is chosen on its own, so Claude can use the connection while Codex keeps its sign-in, or the other way round.
7. In the composer, choose one of its models. They appear in the model picker under the runtime, in a group named after the connection, for example **Company gateway · API billing**. The runtime's own models stay in the picker next to that group, whichever account is selected. Picking a connection's model makes that connection the runtime's account for new turns; picking one of the runtime's own models switches back to the sign-in account the runtime used last (System default when Stave does not know one, for example after a restart).

What to expect:

- Every turn on the connection is billed per token by the gateway, not by your Claude or Codex subscription. The status bar shows **API billing** instead of a subscription meter.
- For a Vercel AI Gateway connection, the meter also shows the team's credit balance and total spend from the gateway, for example `$95.50 left · $4.50 used`. Stave reads them when the meter opens and at most once a minute otherwise; the key stays in Stave's main process. When the gateway does not answer, the meter shows a dash and its details say **Balance unavailable**. A connection to another gateway shows **API billing** only.
- Your other accounts keep working as before. Switch back to a sign-in account at any time.
- Budgets and rate limits belong to the gateway. Stave does not switch to a connection on its own when a subscription runs out.
- Claude Code runs its background requests and subagents on the first pinned Claude model. Codex starts on the first pinned OpenAI model when you have not chosen one.
- **Edit** changes the connection's name, its key, and its pinned models. Where it sends turns cannot change: to use another gateway, add a new connection and remove the old one. You can also replace the key's value in Secrets at any time.

For a gateway other than Vercel, choose **Other gateway** and enter the endpoints it gives you: a **Claude Code endpoint** (the HTTPS URL before `/v1/messages`) and a **Codex endpoint** (the HTTPS URL before `/responses`). Fill in one or both; the connection serves only the runtimes that have one. Add its models with **Add a model by ID**, using the IDs the gateway lists.

### Use Open Models

A connection can pin any model the gateway offers, not only Claude and OpenAI ones.

- **In Codex**, these models run through the gateway's Codex endpoint like any other model. Vercel documents that every model in its catalog works with Codex. This is the recommended way to use open models, because the key stays in Stave and Codex is a managed provider.
- **In Claude Code**, non-Claude models are marked **Experimental in Claude Code**. Anthropic doesn't support routing Claude Code to non-Claude models through any gateway, so a turn can fail when the model rejects a field Claude Code sends, such as its thinking settings or a beta header. If a model keeps failing in Claude Code, try it in Codex instead.
- **In OpenCode**, as a fallback. If a model keeps failing in Codex, for example on tool calls, use it through OpenCode instead. This needs the OpenCode CLI; see [Use Gateway Models Through OpenCode](#use-gateway-models-through-opencode). Stave does not switch a task to OpenCode on its own.
- Open models are not all cheaper. Compare the prices shown next to each model before pinning it.

### Use Gateway Models Through OpenCode

Use OpenCode when a gateway model keeps failing in Codex. OpenCode handles each model's tool calls itself, so a model such as GLM, DeepSeek or Gemini that misbehaves in Codex can still work here. Codex with an API connection stays the recommended path, because OpenCode is not a managed provider: it is not used for Agent Runs, delegation or reviews.

OpenCode needs its own CLI and its own provider sign-in. Stave does not pass an API connection or a Secrets key to it, so connect the gateway key in OpenCode as well.

1. Install OpenCode 1.19.0 or newer (`npm i -g opencode-ai`) or 2.0.29 or newer (`npm i -g @opencode/cli`). Both install the `opencode` command.
2. Connect Vercel AI Gateway in OpenCode: run `npx vercel ai-gateway setup --agent opencode`, or open the OpenCode TUI and use `/connect`. For another provider, run `opencode auth login`.
3. In Stave, open **Settings > Tooling** and check that the **OpenCode** row shows **Ready**; **Settings > Accounts** shows it as **Managed in CLI**. Set **Settings > Providers > OpenCode > CLI Path** if Stave did not find it.
4. In the composer, open the model selector, choose the **OpenCode** tab and search for the model, for example `vercel/zai/glm-5.3`. Model ids are `provider/model`, as OpenCode lists them.

What to expect:

- Billing and rate limits are your OpenCode provider's, for example the Vercel AI Gateway key you connected in OpenCode. OpenCode reports no usage limits, so its status bar meter reads **No limits reported** and shows only the tokens of turns run in Stave.
- If a model needs a sign-in OpenCode does not have, the turn ends with an "Authentication required" error that names the commands above.
- The models in the selector are the ones `opencode models` reports. If the list is empty, connect a provider in OpenCode and choose **Refresh** in the selector.

## Files And Data

- `<app-data>/provider-accounts.json` holds account names, folder paths, and API connection details. It never holds a password, token, or API key. Sign-in identity and shared-setup state are not stored there: identity is asked from the CLI and kept only in memory, and shared-setup state is recorded in `.stave-shared-setup.json` inside the account's own folder.
- To show an email and plan, Stave runs `claude auth status` or `codex login status` with the account's environment. For a Codex ChatGPT sign-in, which prints no identity, Stave reads that account's `auth.json` inside the app, picks out the email and plan claims, and discards the rest. It never logs, stores, or sends a token, and it does not open `auth.json` for an API-key sign-in.
- Accounts you add without a folder get one under `<app-data>/provider-accounts/`. The sign-in itself is saved by the CLI in that folder (and, for Claude on macOS, in a Keychain entry tied to it).
- An API connection stores only a reference to its key; the key stays in Secrets. Each runtime it serves keeps its own conversation history under `<app-data>/provider-accounts/connections/<id>/`.
- A Claude gateway you added in an earlier version becomes an API connection with the same name, key, models and conversation history. A Vercel AI Gateway connection also starts serving Codex, so it appears under Codex accounts too.

## Limitations And Advanced Options

- Non-Claude models are experimental in Claude Code; see [Use Open Models](#use-open-models).
- An API connection serves Claude Code and Codex only. OpenCode uses the provider sign-ins in its own configuration; see [Use Gateway Models Through OpenCode](#use-gateway-models-through-opencode).
- In Claude Code, commands the agent runs can read the connection's key. Claude Code reads the key from its environment, and its Bash tool inherits that environment. Codex hides the key from the commands it runs. Claude Code's own setting for hiding credentials from commands also forces every turn into the default permission mode, so Stave leaves it off. Treat the key as visible to the agent's commands, and keep a spending limit on it at the gateway.
- Model discovery reads the Vercel AI Gateway catalog only. For other gateways, add model IDs by hand.
- **Check connection** does not run a turn, so it cannot confirm that tools and streaming work with a model. Send a short turn to confirm.
- Claude's `claude auth status` fields for email and plan are observed rather than documented. If a future version drops them, the row shows **Signed in** without an email.
- A Codex sign-in stored in the system keyring (not `auth.json`) shows **Signed in** without an email.
- Claude MCP servers that sign in with OAuth (`/mcp` login) keep their sign-in per account, so authenticate them once in each account. Codex MCP servers are shared only while `config.toml` is linked.

## Troubleshooting

### "Open a workspace before signing in."

- Symptom: **Add and sign in** adds the account, but no terminal opens.
- Cause: the sign-in terminal runs in the active workspace.
- Fix: open any workspace, then choose **Sign in** on the account.

### The status bar did not change after I signed in

- Symptom: the sign-in terminal said you are signed in, but the usage meter looks the same.
- Cause: the meter shows the account new turns use, which may be another account.
- Fix: pick the account you signed in to in the status bar or in **Account for new turns**.

### The account says "Not signed in" but I signed in

- Cause: Stave checked before the sign-in finished, or you signed in outside Stave.
- Fix: choose **Check again** on the account. Closing the sign-in terminal checks automatically.

### The account says "Can't check sign-in"

- Cause: the CLI did not answer in time, was not found, or answered in a form Stave does not recognise.
- Fix: choose **Check again**. If it persists, confirm the CLI works in Settings > Tooling.

### Signed in, but no email is shown

- Cause: API-key sign-ins, keyring-stored sign-ins, and CLI versions that do not report an email have no identity to show.
- Fix: none needed. The account works the same.

### My skills are missing in a new account

- Cause: the account was added with **Use my skills and instructions from System default** cleared, or it already had its own entry.
- Fix: select the checkbox on the account. Stave keeps anything the account already has and lists it under the checkbox.

### I cannot find the account select

- Cause: account selects appear only when a provider has two or more accounts.
- Fix: add an account first.

### "Check connection" says a model is not listed

- Cause: the model ID does not match one the gateway offers.
- Fix: unpin it and pin it again from the list, or copy the ID from the gateway's model list. For Vercel AI Gateway, `claude-code/anthropic/claude-sonnet-5[1m]` and `anthropic/claude-sonnet-5` are the same model; Stave ignores the `claude-code/` prefix and the `[1m]` marker when it compares.

### The gateway refuses requests

- HTTP 401 or 403: the key is wrong, expired, or not allowed on this gateway. Replace its value in Secrets.
- HTTP 402: the key's budget on the gateway is used up. Ask whoever manages the gateway to raise it, or wait until it resets.
- HTTP 429: the gateway's rate limit or free-tier limit was reached. Wait a minute, or ask for a higher limit.
- "The API connection's key is unavailable": the saved secret is missing or locked. Check Settings > Secrets.

### "Check connection" or the model list fails before the gateway answers

**Check connection** and **Find models on Vercel AI Gateway** say which of these happened:

- **Could not reach the gateway**: no connection was made (offline, DNS, VPN, or a blocked endpoint). Check the network and, for another gateway, the endpoint URL.
- **The gateway did not answer in time**: the request timed out. Try again; if it keeps happening, check the network or proxy.
- **The gateway's certificate is not trusted on this network**: usually a company proxy that inspects TLS traffic and re-signs it with its own certificate. Ask whoever runs the network to allow the gateway, or try another network.

Stave shows only the class of failure; it never shows the proxy's or gateway's raw error text or the key.

### "Choose a model pinned on this API connection"

- Cause: the composer still names a model from the account you used before, or an auxiliary setting names a model the connection does not pin. A model without a creator prefix is matched to the same pinned model: `gpt-5.5` uses a pinned `openai/gpt-5.5` in Codex, and `claude-sonnet-5` uses a pinned `anthropic/claude-sonnet-5` in Claude Code.
- Fix: choose one of the connection's models in the composer, or pin the model the setting uses.

## Related Docs

- [Standalone CLI](standalone-cli.md)
- [Integrated Terminal](integrated-terminal.md)
- [Provider runtimes: account profiles and API connections](https://github.com/sendbird/stave/blob/main/docs/providers/provider-runtimes.md)
