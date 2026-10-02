# Accounts And API Connections

## Summary

- Stave runs Claude and Codex with the sign-in their CLIs already use on this computer. That sign-in is the **System default** account, and you do not need to set anything up to use it.
- Add an account when you want a second Claude or Codex subscription, for example work and personal. Each account has its own sign-in, conversation history, and usage limits.
- Add an **API connection**, such as a company Vercel AI Gateway key, when turns should be billed per token instead of a subscription. One connection serves both Claude and Codex with the same key, and it can offer open models such as Kimi, GLM, Qwen, DeepSeek or gpt-oss.

## When To Use It

### Which Do I Need?

| You want to | Use | Who bills you | Sign-in |
|---|---|---|---|
| Keep using the CLI login you already have | **System default** (nothing to do) | Your current Claude or Codex plan | Already done in the CLI |
| Use a second subscription, such as work and personal | **Add an account** | That account's own plan and usage limits | Once per account, in the terminal Stave opens |
| Use a company API key for Claude, Codex or both, through a gateway such as Vercel AI Gateway | **Add an API connection** | The gateway, per token | None. The key is saved in Secrets |
| Try open models such as Kimi, GLM, Qwen, DeepSeek or gpt-oss | **Add an API connection** and pin those models | The gateway, per token | None |

## Before You Start

- Install the CLI for the provider: `claude` for Claude Code, `codex` for Codex. Settings > Tooling shows whether Stave found them.
- Open a workspace. The sign-in terminal runs inside the active workspace, so Stave asks you to open one first.
- For an API connection, get the gateway's API key and save it in **Settings > Secrets** before you add the connection.

## Quick Start

1. Open **Settings > Tooling**. You can also search Settings for "account" or "sign in", or choose **Add an account** in the status bar usage meter.
2. In **Claude accounts** (or **Codex accounts**), under **Add an account**, type a name such as `Work`.
3. Choose **Add and sign in**. Stave creates a folder for the account and opens a sign-in terminal below the form.
4. Follow the steps in the terminal; it may open your browser. When the terminal says you are signed in, choose **Close sign-in terminal**.
5. Pick the account for new turns: in the status bar usage meter, or in **Account for new turns** at the top of the card.

You sign in once per account, not once per CLI binary. The sign-in is saved in the account's own folder, so it keeps working in every task and CLI tab that uses the account, whichever Claude or Codex binary runs it.

## Interface Walkthrough

### Entry Points

- **Settings > Tooling > Claude accounts** and **Codex accounts**: add, rename, sign in, and remove accounts.
- **Settings > Tooling > API connections**: add, check, edit, and remove API connections.
- **Status bar usage meter**: shows the account new turns use and its usage, and switches accounts when there is more than one. An API connection is listed there as an account, marked **API billing**.
- **Standalone CLI**: each Claude Code and Codex tab has its own account select. See [Standalone CLI](standalone-cli.md).

### Key Controls

- **Account for new turns**: the account the next turns use. It appears only when the provider has two or more accounts. API connections that serve the provider are listed here too.
- **Sign in**: opens `claude auth login` or `codex login` for that account in a terminal. Stave cannot read the result from the terminal; after you close it, Stave refreshes sign-in status and usage for the account new turns use.
- **Save name**: renames an account. The name is only a label; the folder and sign-in stay the same.
- **Remove**: forgets the account in Stave. Its folder and sign-in stay on disk. If new turns used it, they go back to System default.
- **Advanced: reuse a folder you already use**: registers a folder you already signed in to, such as one you use with `CLAUDE_CONFIG_DIR` or `CODEX_HOME`. Stave uses the sign-in saved there and skips the sign-in step.

## Common Workflows

### Add A Second Subscription

1. Follow [Quick Start](#quick-start) with a name such as `Personal`.
2. Sign in with the other subscription in the terminal.
3. Switch between the accounts from the status bar whenever you start new work.

A new account starts with an empty folder. User-level Claude settings, skills, and personal instructions from System default are not copied into it; instructions and settings stored in the repository still apply.

### Switch Accounts

Switching changes **new turns only**:

| What | Account it uses after you switch |
|---|---|
| A turn you send next | The new account |
| A turn already running | The account it started with |
| A queued message | The account it was queued with |
| An open Standalone CLI tab | Its own account until you switch that tab |

Provider conversations belong to the account that started them. The **Session IDs** dialog of a task lists one provider session per account, named when it is not System default.

### Reuse A Folder You Already Use

1. Under **Add an account**, type a name.
2. Open **Advanced: reuse a folder you already use** and enter the folder's absolute path.
3. Choose **Add account**. Use **Sign in** on the account later only if that folder is not signed in yet.

Each folder can belong to one account, and the System default folder cannot be added again.

### Use A Company Gateway Key With Claude And Codex

An API connection is one gateway key that both Claude Code and Codex can use. This is how a company Vercel AI Gateway key works:

1. Save the key in **Settings > Secrets**, for example as `Vercel AI Gateway`.
2. In **Settings > Tooling > API connections**, under **Add a connection**, keep **Vercel AI Gateway**, type a name such as `Company gateway`, and choose the key.
3. Under **Find models on Vercel AI Gateway**, search and **Pin** the models you want, for example `anthropic/claude-sonnet-5`, `openai/gpt-6-astra` and `zai/glm-5.3`. Each row shows the model's context window and its list price per 1M input and output tokens.
4. Choose **Add connection**, then **Check connection**. Stave asks the gateway whether it accepts the key and lists the pinned models; no prompt is sent and nothing is billed.
5. Pick the connection as the account for new turns: in the status bar account switch, or in **Account for new turns** in the **Claude accounts** or **Codex accounts** card. Each runtime is chosen on its own, so Claude can use the connection while Codex keeps its sign-in, or the other way round.
6. In the composer, choose one of its models. They appear in the model picker under the runtime, in a group named after the connection, for example **Company gateway · API billing**.

What to expect:

- Every turn on the connection is billed per token by the gateway, not by your Claude or Codex subscription. The status bar shows **API billing** instead of a subscription meter.
- Your other accounts keep working as before. Switch back to a sign-in account at any time.
- Budgets and rate limits belong to the gateway. Stave does not switch to a connection on its own when a subscription runs out.
- Claude Code runs its background requests and subagents on the first pinned Claude model. Codex starts on the first pinned OpenAI model when you have not chosen one.
- **Edit** changes the connection's name, its key, and its pinned models. Where it sends turns cannot change: to use another gateway, add a new connection and remove the old one. You can also replace the key's value in Secrets at any time.

For a gateway other than Vercel, choose **Other gateway** and enter the endpoints it gives you: a **Claude Code endpoint** (the HTTPS URL before `/v1/messages`) and a **Codex endpoint** (the HTTPS URL before `/responses`). Fill in one or both; the connection serves only the runtimes that have one. Add its models with **Add a model by ID**, using the IDs the gateway lists.

### Use Open Models

A connection can pin any model the gateway offers, not only Claude and OpenAI ones.

- **In Codex**, these models run through the gateway's Codex endpoint like any other model. Vercel documents that every model in its catalog works with Codex.
- **In Claude Code**, non-Claude models are marked **Experimental in Claude Code**. Anthropic doesn't support routing Claude Code to non-Claude models through any gateway, so a turn can fail when the model rejects a field Claude Code sends, such as its thinking settings or a beta header. If a model keeps failing in Claude Code, try it in Codex instead.
- Open models are not all cheaper. Compare the prices shown next to each model before pinning it.

## Files And Data

- `<app-data>/provider-accounts.json` holds account names, folder paths, and API connection details. It never holds a password, token, or API key.
- Accounts you add without a folder get one under `<app-data>/provider-accounts/`. The sign-in itself is saved by the CLI in that folder (and, for Claude on macOS, in a Keychain entry tied to it).
- An API connection stores only a reference to its key; the key stays in Secrets. Each runtime it serves keeps its own conversation history under `<app-data>/provider-accounts/connections/<id>/`.
- A Claude gateway you added in an earlier version becomes an API connection with the same name, key, models and conversation history. A Vercel AI Gateway connection also starts serving Codex, so it appears under Codex accounts too.

## Limitations And Advanced Options

- Non-Claude models are experimental in Claude Code; see [Use Open Models](#use-open-models).
- Model discovery reads the Vercel AI Gateway catalog only. For other gateways, add model IDs by hand.
- **Check connection** does not run a turn, so it cannot confirm that tools and streaming work with a model. Send a short turn to confirm.
- Stave cannot show yet which person or plan an account is signed in as.
- Settings and skills are not shared between accounts.

## Troubleshooting

### "Open a workspace before signing in."

- Symptom: **Add and sign in** adds the account, but no terminal opens.
- Cause: the sign-in terminal runs in the active workspace.
- Fix: open any workspace, then choose **Sign in** on the account.

### The status bar did not change after I signed in

- Symptom: the sign-in terminal said you are signed in, but the usage meter looks the same.
- Cause: the meter shows the account new turns use, which may be another account.
- Fix: pick the account you signed in to in the status bar or in **Account for new turns**.

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

### "Choose a model pinned on this API connection"

- Cause: the composer still names a model from the account you used before, or an auxiliary setting names a model the connection does not pin.
- Fix: choose one of the connection's models in the composer, or pin the model the setting uses.

## Related Docs

- [Standalone CLI](standalone-cli.md)
- [Integrated Terminal](integrated-terminal.md)
- [Provider runtimes: account profiles and API connections](../providers/provider-runtimes.md)
