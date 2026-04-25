# macOS Folder Access Prompts

## Summary

- This guide explains why macOS may repeatedly ask Stave to access files in Desktop, Documents, or Downloads.
- It gives end users a short recovery path and provides a copy-paste checklist for company security teams.

## When To Use It

- You see the macOS prompt asking whether Stave may access files in a protected folder.
- The prompt comes back after an app update or reinstall.
- Your Mac is company-managed and you need security or IT approval.

## Before You Start

- Confirm you are launching the installed app from `~/Applications/Stave.app` or `/Applications/Stave.app`.
- Do not run Stave directly from `Downloads`, an extracted zip folder, or a mounted volume.
- Know whether you are using a development build, a signed release build, or an internal unsigned build.
- For install and update steps, see [Install Guide](../install-guide.md).

## Quick Start

1. Install or update Stave into `~/Applications` or `/Applications`.
2. Launch the installed app from that location.
3. When macOS asks for Desktop, Documents, or Downloads access, approve only the folders you expect to use with Stave.
4. If the prompt keeps returning, open `System Settings -> Privacy & Security -> Files and Folders -> Stave` and verify the folder toggles are still enabled.
5. If the prompt still returns after packaged app updates, use the security-team checklist below.

## Interface Walkthrough

### Entry Points

- `System Settings -> Privacy & Security -> Files and Folders`
- the Stave install flow described in [Install Guide](../install-guide.md)

### Key Controls

- the `Stave` entry under `Files and Folders`
- the per-folder toggles for `Desktop`, `Documents`, and `Downloads`
- the installed app location in `~/Applications` or `/Applications`

## Common Workflows

### Use Stave On A Personal Or Unmanaged Mac

1. Install Stave into `~/Applications` or `/Applications`.
2. Launch the installed app from that location.
3. Approve the folder access prompt once for the folders you plan to use.
4. If the prompt reappears after every update, move to the troubleshooting section for unsigned or development builds.

### Ask Your Company Security Team To Review The Prompt

1. Copy the message template below.
2. Include the exact install path you use and mention the Stave bundle identifier `com.stave.app`.
3. Ask whether your Mac is managed with a TCC configuration profile that can pre-approve `Files and Folders` access.
4. Ask whether your organization requires Stave to be distributed as a stable Developer ID-signed and notarized app before the permission can persist cleanly across updates.

## Files And Data

- Typical install location: `~/Applications/Stave.app`
- Alternative shared install location: `/Applications/Stave.app`
- macOS privacy panel: `System Settings -> Privacy & Security -> Files and Folders`
- Bundle identifier: `com.stave.app`

Security team message template:

```text
Hello Security team,

I am using Stave on macOS and macOS keeps asking whether Stave may access files in Desktop, Documents, or Downloads after installs or updates.

Could you please confirm:
- whether Stave is approved for use on managed Macs
- whether bundle identifier com.stave.app can be pre-approved through a TCC configuration profile
- whether Stave must be distributed as a stable Developer ID-signed and notarized app for permissions to persist across updates
- which install location you want us to use: ~/Applications/Stave.app or /Applications/Stave.app

Thank you.
```

## Limitations And Advanced Options

- macOS `Files and Folders` decisions are more stable when the operating system can reliably track the app identity across updates.
- Development builds can retrigger prompts because rebuilt app binaries may not look like the same app to macOS.
- Unsigned or ad hoc signed internal builds can also retrigger prompts after updates.
- `Full Disk Access` is not the default fix for this issue. Use it only if your security team explicitly requires it.
- `security-scoped bookmarks` are mainly for sandboxed apps that need to reopen user-selected files or folders later. They are not the primary fix for repeated folder prompts after ordinary app updates.

## Troubleshooting

### The Prompt Appears After Every App Update

- Symptom: macOS asks again for Desktop, Documents, or Downloads access after each packaged update.
- Cause: macOS may not be treating the updated build as the same app identity, especially for unsigned, ad hoc signed, or otherwise unstable release builds.
- Fix: keep Stave installed in a stable Applications folder, launch the installed app rather than the downloaded bundle, and ask for a stable signed and notarized distribution flow or a company TCC approval profile.

### The Prompt Appears Every Session In A Development Build

- Symptom: the same prompt returns after rebuilding or relaunching a local development build.
- Cause: development builds often change frequently enough that macOS treats them as a new app instance for privacy tracking.
- Fix: this is expected during development. Manually enable the needed folders in `System Settings -> Privacy & Security -> Files and Folders -> Stave`, or use a stable signed development build if your team maintains one.

### A Company-Managed Mac Blocks Access Or Hides The Toggle

- Symptom: the prompt cannot be approved, the toggle is disabled, or the setting immediately flips back.
- Cause: your organization may enforce privacy settings through device management or endpoint security policy.
- Fix: send the security-team template above and ask whether they can pre-approve Stave for `Files and Folders` access by bundle identifier `com.stave.app`.

## Related Docs

- [Install Guide](../install-guide.md)
