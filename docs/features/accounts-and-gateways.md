# Accounts And API Gateways

## Summary

- Stave runs Claude and Codex with the sign-in their CLIs already use on this computer. That sign-in is the **System default** account, and you do not need to set anything up to use it.
- Add an account when you want a second Claude or Codex subscription, for example work and personal. Each account has its own sign-in, conversation history, and usage limits.
- Connect Claude to an API gateway, such as a company Vercel AI Gateway key, when turns should be billed per token instead of a subscription. Gateways work for Claude models only today.

## When To Use It

### Which Do I Need?

| You want to | Use | Who bills you | Sign-in |
|---|---|---|---|
| Keep using the CLI login you already have | **System default** (nothing to do) | Your current Claude or Codex plan | Already done in the CLI |
| Use a second subscription, such as work and personal | **Add an account** | That account's own plan and usage limits | Once per account, in the terminal Stave opens |
| Use a company API key for Claude through a gateway such as Vercel AI Gateway | **Connect Claude to an API gateway** | The gateway, per token | None. The key is saved in Secrets |
| Use the company gateway with Codex, or with non-Claude models such as Kimi, GLM, Qwen, DeepSeek or gpt-oss | Not supported yet | — | — |

## Before You Start

- Install the CLI for the provider: `claude` for Claude Code, `codex` for Codex. Settings > Tooling shows whether Stave found them.
- Open a workspace. The sign-in terminal runs inside the active workspace, so Stave asks you to open one first.
- For a gateway, get the API key and save it in **Settings > Secrets** before you add the connection.

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
- **Settings > Tooling > Claude accounts > Connect Claude to an API gateway**: add a gateway connection.
- **Status bar usage meter**: shows the account new turns use and its usage, and switches accounts when there is more than one.
- **Standalone CLI**: each Claude Code and Codex tab has its own account select. See [Standalone CLI](standalone-cli.md).

### Key Controls

- **Account for new turns**: the account the next turns use. It appears only when the provider has two or more accounts.
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

### Connect Claude To An API Gateway

This is how a company Vercel AI Gateway key works today:

1. Save the key in **Settings > Secrets**, for example as `Vercel AI Gateway`.
2. In **Settings > Tooling > Claude accounts**, find **Connect Claude to an API gateway** and choose **Vercel AI Gateway**. Stave fills in the base URL `https://ai-gateway.vercel.sh/claude-code` and the model `anthropic/claude-sonnet-5`.
3. Add any other Claude models you want, separated by commas, using the IDs the gateway lists, for example `anthropic/claude-sonnet-5, anthropic/claude-haiku-4.5`. The first model also runs background requests and subagents.
4. Name the connection, choose the key, and choose **Add connection**.
5. Choose **Check model list** on the new connection. Stave asks the gateway which models it offers and confirms yours are on it; no prompt is sent.
6. Pick the connection as the account for new turns, then choose one of its models in the composer.

What to expect:

- Every turn on the connection is billed per token by the gateway, not by your Claude subscription. The status bar shows **API billing** instead of a subscription meter.
- Your other accounts keep working as before. Switch back to a sign-in account at any time.
- Budgets and rate limits belong to the gateway. Stave does not switch to a gateway on its own when a subscription runs out.
- A connection cannot be edited. To change its URL or models, add a new connection and remove the old one. You can replace the key's value in Secrets at any time.

For an Anthropic-compatible endpoint other than Vercel, choose **Anthropic-compatible endpoint** and enter the HTTPS base URL that comes before `/v1/messages`.

## Files And Data

- `<app-data>/provider-accounts.json` holds account names, folder paths, and gateway details. It never holds a password, token, or API key.
- Accounts you add without a folder get one under `<app-data>/provider-accounts/`. The sign-in itself is saved by the CLI in that folder (and, for Claude on macOS, in a Keychain entry tied to it).
- A gateway connection stores only a reference to its key. The key stays in Secrets.

## Limitations And Advanced Options

- **Codex through a gateway is not supported yet.** Codex accounts use Codex sign-ins only.
- **Non-Claude models through a gateway are not supported yet.** Gateway model IDs must be Claude models (`claude-…`, optionally with an `anthropic/` prefix).
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

### "Check model list" says a model is not listed

- Cause: the model ID does not match one the gateway offers.
- Fix: copy the ID from the gateway's model list. For Vercel AI Gateway, `claude-code/anthropic/claude-sonnet-5[1m]` and `anthropic/claude-sonnet-5` are the same model; Stave ignores the `claude-code/` prefix and the `[1m]` marker when it compares.

### The gateway refuses requests

- HTTP 401 or 403: the key is wrong, expired, or not allowed on this gateway. Replace its value in Secrets.
- HTTP 402: the key's budget on the gateway is used up. Ask whoever manages the gateway.
- HTTP 429: the gateway's rate limit or free tier limit was reached. Wait, or ask for a higher limit.
- "Gateway API key is unavailable": the saved secret is missing or locked. Check Settings > Secrets.

## Related Docs

- [Standalone CLI](standalone-cli.md)
- [Integrated Terminal](integrated-terminal.md)
- [Provider runtimes: account profiles and gateway connections](../providers/provider-runtimes.md)
