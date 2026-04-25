# Skill Selector

## Goal

- Discover installed skills from global, user, and workspace-local roots.
- Let users type `$` in the prompt composer to search and insert skill tokens.
- Resolve `$skill-name` selections into provider-appropriate dispatch at send time.

![Skills panel showing detected workspace and shared skills](../screenshots/skills-panel.png)

This rendered example shows the right-rail Skills panel with installed skills grouped from shared and workspace roots.

## Discovery Model

Stave reads three scope layers:

- `global`
  - shared agent root: resolved from Settings when configured, otherwise from `STAVE_SHARED_SKILLS_HOME` when set
  - provider system roots such as `<provider-home>/skills/.system`
- `user`
  - Claude user root: resolved from `CLAUDE_HOME` when set, otherwise the active Claude home directory
  - Codex user root: resolved from `CODEX_HOME` when set, otherwise the active Codex home directory
- `local`
  - `<workspace>/skills`
  - `<workspace>/.agents/skills`
  - `<workspace>/.claude/skills`
  - `<workspace>/.codex/skills`
  - `<workspace>/.agents/claude/skills`
  - `<workspace>/.agents/codex/skills`

Important behavior:

- User roots are not hardcoded beyond the provider defaults. If the provider home is redirected through env or a symlinked home, Stave resolves the real path and scans that location.
- Duplicate `SKILL.md` files are deduped by resolved real path.
- Effective lookup precedence is `local > user > global`, with provider-specific skills preferred over shared skills at the same scope.

## Composer UX

- Typing `$` near the current caret position opens the skill palette in `PromptInput`.
- The visible draft stays inline as `$skill-name`.
- `Tab` inserts the highlighted skill token.
- `Enter` still sends unless the user explicitly selected or highlighted a matching skill entry.
- The Settings dialog shows the detected roots and a sampled catalog for the current workspace.
- The Settings dialog can override the shared global skill root without editing shell environment variables.

## Send Path

On send, Stave resolves compatible skills for the active provider and strips recognized `$skill-name` tokens from the provider-facing prompt.

- Claude and Codex
  - selected skills are normalized into an `[Activated Skills]` prompt section with the resolved skill instructions
  - Stave-managed `$skill` activations are prompt-context based, not provider-native slash skill registrations
  - provider-native `/` commands remain separate and are not generated from `$skill` tokens

## Verification

- `tests/skill-catalog.test.ts`
  - provider-home override discovery
  - `$skill-name` token resolution and replacement
  - Claude and Codex prompt serialization
