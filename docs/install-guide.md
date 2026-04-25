# Install Guide

This is the recommended macOS install flow for Stave. It uses GitHub CLI to fetch the latest release and open the app directly into the desktop workspace.

## Prerequisites

- macOS with the built-in `ditto`, `xattr`, and `open` commands available
- [`gh` CLI](https://cli.github.com/)
- a GitHub CLI session authenticated for `github.com`

## First-Time Setup

Install GitHub CLI if needed:

```bash
brew install gh
```

Authenticate and verify access:

```bash
gh auth login
gh auth status
```

If your organization requires SSO re-authorization or refreshed scopes, run:

```bash
gh auth refresh -h github.com -s repo,read:org
```

## One-Command Install

Once `gh` is authenticated, install the latest Stave release with:

```bash
gh api -H 'Accept: application/vnd.github.v3.raw+json' repos/sendbird-playground/stave/contents/scripts/install-latest-release.sh | bash
```

The installer script:

- downloads the latest `Stave-macOS.zip` release asset
- extracts the bundle into a temporary directory
- stages the new bundle before replacing the existing app so a failed update can recover cleanly
- prefers the current writable install location and otherwise falls back to `~/Applications`
- removes the macOS quarantine attribute from the installed app
- opens Stave after installation

After a successful install, Stave opens into the desktop workspace shown below.

![Stave desktop workspace after install](screenshots/stave-app.png)

The installed app uses this same workspace shell for chat, editor, side panels, terminal work, and update actions.

## In-App Update Button

Packaged macOS builds also show an app update action in the top bar.

- It checks the latest authenticated GitHub release for `sendbird-playground/stave`
- It compares that tag against the installed app version
- If a newer release is available, it can install the update and restart Stave automatically

This uses the same authenticated `gh`-based release flow as the terminal installer, so `gh auth login` is still required.

On packaged macOS builds, the restart helper also carries a Homebrew-friendly PATH so GUI-launched Stave can still find `gh` during the install step.

If macOS keeps re-asking for Desktop, Documents, or Downloads access after install or update, see [macOS Folder Access Prompts](features/macos-folder-access-prompts.md).

## Manual Fallback

If you need the release bundle directly, download `Stave-macOS.zip` from the latest release.

The bundle contains:

- `Stave.app`
- `Install Stave.command`
- `Install Stave in Terminal.txt`

That path remains available as an offline/manual fallback, but the `gh` installer is the preferred install flow.
