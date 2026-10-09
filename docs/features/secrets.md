# Secrets

## Summary

Secrets stores API keys, tokens and other secret values encrypted by the
operating system, and hands them to a task as environment variables without
putting them in chat. When an agent needs a key it does not have, it asks for
it with a masked card instead of asking you to paste it into the conversation.

## When To Use It

- A task runs a command that needs a key, for example a script that calls a
  model API or a CLI that deploys a preview.
- An agent stops to say it is missing a credential. Answer its card instead of
  pasting the value into chat, where it would reach the model, the transcript
  and exports.
- You keep an [API connection](accounts-and-gateways.md) key. The key lives in
  Secrets and the connection stores only a reference.

## Before You Start

- Secrets needs the desktop app and an OS credential store. On Linux, Stave
  refuses Electron's `basic_text` fallback and asks you to unlock a real
  keyring.
- Only a secret with an **environment variable name** can be bound to a task.

## Quick Start

1. Open **Settings → Secrets** and choose **Add secret**.
2. Enter a name, the value, and an environment variable name such as
   `OPENAI_API_KEY`.
3. In a task's composer, open **Secrets** and check the secret.
4. Send the next message. Shell commands in that turn can read
   `$OPENAI_API_KEY`.

## Interface Walkthrough

### Entry Points

- **Settings → Secrets** adds, edits, reveals, copies and deletes secrets.
- The composer's **Secrets** control binds secrets to the current task. It
  lists only secrets that define an environment variable name, and is hidden
  while a turn runs.
- A **secret request card** appears above the composer when the task's agent
  asks for a secret.

### When An Agent Asks For A Secret

An agent running in a Stave task can call the Local MCP tool
`stave_request_secret` with an environment variable name and a short reason.
Claude, Codex, Cursor and Kiro all receive this tool. The call shows a card
above that task's composer and the agent waits for your answer:

- **Save and bind** stores the value you type in Secrets, named after the
  agent's label, and binds it to the task. The field is masked, and it is
  marked so the browser and password managers do not offer to save it.
- **Use saved secret** appears when a secret with that variable name is already
  saved. It binds that secret without asking for the value again. **Enter a
  new value** replaces the saved value instead. That change also applies to
  other tasks that use the secret.
- **Decline** tells the agent no secret was given.

If you do not answer within 10 minutes, the request times out. Stopping the
turn cancels the request as soon as the provider closes the tool call.

The agent never receives the value. It gets a short result such as
`{ "status": "saved", "envVar": "OPENAI_API_KEY", "availableFrom": "next-turn" }`.
A saved secret works **from your next message**: a turn that is already
running cannot receive a new environment variable, so the agent finishes what
it can and asks you to send a follow-up.

The tool refuses reserved names, such as `PATH`, `HOME`, provider credential
variables and the Stave MCP token. Read-only subagents cannot ask for secrets,
and neither can a Local MCP client that Stave did not start.

## Files And Data

- Values are encrypted with the OS credential store in
  `<app-data>/secrets.v1.json`. The file keeps ciphertext, names, descriptions,
  variable names and a four-character preview.
- A task stores only the **ids** of its bound secrets, at most 32 of them.
  Values are resolved in the main process when the provider starts.
- A secret request card carries the variable name, the agent's reason and
  label, and the preview of an existing secret. The value goes from the card
  to the vault and nowhere else. It is never in the tool result, the Local MCP
  request log, the transcript or the conversation.

## Limitations And Advanced Options

- Bound secrets are injected only into turns you send from the task's
  composer, including queued messages. Turns Stave starts on its own, such as
  `stave_run_task`, schedules, check-backs and subagents, run without them.
- Injection keeps the value out of the model's context automatically. It is not
  a sandbox: a command that prints the variable, such as `echo $OPENAI_API_KEY`,
  can still bring the value into the conversation.
- A task that already has 32 secrets bound cannot save or bind another one from
  a request card. Decline it, unbind a secret in the composer's **Secrets**
  control, and let the agent ask again.

## Troubleshooting

### The agent still cannot read the variable

- Symptom: right after you save, the agent reports the variable is unset.
- Cause: the value is available from the next turn, not the one that asked.
- Fix: send a follow-up message in the same task.

### The card says the saved secret was removed or changed

- Symptom: **Use saved secret** fails.
- Cause: the secret was deleted, or its variable name was changed in Settings
  while the card was open.
- Fix: choose **Enter a new value**, or decline and let the agent ask again.

## Related Docs

- [Accounts and Gateways](accounts-and-gateways.md)
- [Local MCP](local-mcp-user-guide.md)
- [Runtime Safety Controls](provider-sandbox-and-approval.md)
