# Language Intelligence

Stave's built-in editor understands TypeScript, JavaScript, and Python. This page explains how to turn the advanced project-aware layer on and what to do if macOS blocks file access.

![Settings dialog showing the Project Language Servers card with TypeScript and Python commands](../screenshots/language-intelligence.png)

## What You Get Out Of The Box

TypeScript and JavaScript work immediately. You get:

- module resolution based on your `tsconfig.json`
- diagnostics as you type
- hover info
- completion
- go to definition

This is powered by Monaco's built-in TypeScript worker, so it works with no configuration.

## Turning On Project Language Servers

For deeper, project-aware intelligence, Stave can also run real language servers (LSP) in the background.

Supported today:

- TypeScript and JavaScript via `typescript-language-server`
- Python via `pyright-langserver` or `basedpyright-langserver`

When enabled, Stave starts one language-server session per workspace root and forwards the editor through that server. You still keep Monaco's fast in-browser checks on top.

### Quick Start

1. Install the language server you want. For example:
   ```bash
   npm install -g typescript-language-server typescript
   # or
   npm install -g pyright
   ```
2. Open `Settings > Editor`.
3. Toggle on `Project Language Servers`.
4. If Stave does not auto-detect the binary, paste the exact command in the per-language override field.
5. Reopen the file to see the new diagnostics and completions.

## What Works And What Does Not

### Works

- Diagnostics as you edit
- Hover and completion
- Go to definition
- One session per workspace root and language

### Not Yet

- Rename, references, and code actions
- Nested per-package config discovery inside monorepos
- Project LSPs for languages beyond TypeScript, JavaScript, and Python

## macOS Keeps Asking For File Access

If your project lives in `~/Desktop`, `~/Documents`, `~/Downloads`, or iCloud Drive, macOS may prompt you to allow Stave to read those folders. Stave needs access to read source files and `node_modules` type definitions.

- Packaged release builds: approve the prompt once and macOS remembers it.
- Development builds: the prompt can return after every rebuild. Grant folder access in `System Settings > Privacy & Security > Files and Folders > Stave` to suppress it.

If you would rather skip the prompt entirely, keep your projects outside those protected folders (for example, under `~/projects` instead of `~/Documents`).

For the full checklist on managing these prompts, see [macOS Folder Access](macos-folder-access-prompts.md).

## Troubleshooting

### Diagnostics Did Not Improve After Enabling LSP

- Symptom: toggling `Project Language Servers` did not change anything in the editor.
- Cause: the language-server binary is not on your `PATH`, or the command override is wrong.
- Fix: open a terminal and run the command listed in the override field. If it prints "command not found", install the server or point the override at the absolute path.

### Python Completion Is Missing

- Symptom: Python files only get basic highlighting.
- Cause: Stave only runs a Python LSP when one is configured and enabled.
- Fix: install `pyright` or `basedpyright`, toggle `Project Language Servers` on, and confirm the Python command override.

### TypeScript Paths From `tsconfig.json` Are Not Respected

- Symptom: go-to-definition fails for path aliases like `@/components/...`.
- Cause: the current TypeScript workspace root does not include the relevant `tsconfig.json`, or path discovery is not yet implemented for the nested package.
- Fix: open the project at the root that contains the `tsconfig.json` with the path mapping, or rely on direct relative imports while nested package config is not supported.

## Related Docs

- [macOS Folder Access](macos-folder-access-prompts.md)
- [Integrated Terminal](integrated-terminal.md)
- [Command Palette](command-palette.md)
