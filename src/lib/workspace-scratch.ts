/**
 * The workspace scratch folder: where an agent keeps what it makes while it
 * works but is not the deliverable (screenshots, logs, fetched JSON, command
 * output). It lives inside the workspace so the Scratch panel can list it
 * live, and a `.gitignore` of `*` inside it keeps it out of `git status` in
 * any repository.
 *
 * Shared by the main process (creating and listing the folder, Lens
 * screenshots), the provider prompts (Claude and Codex) and the renderer
 * (the Scratch panel).
 */

/** Relative to the workspace root. */
export const WORKSPACE_SCRATCH_DIRECTORY = ".stave/scratch";

/** Lens screenshots land in this folder under the scratch folder. */
export const WORKSPACE_SCRATCH_LENS_DIRECTORY = "lens";

/** How many files a listing returns, newest first. */
export const WORKSPACE_SCRATCH_MAX_FILES = 300;

/** How many folders deep a listing looks below the scratch folder. */
export const WORKSPACE_SCRATCH_MAX_DEPTH = 4;

/** One file in the scratch folder. */
export interface WorkspaceScratchFile {
  /** Relative to the workspace root, e.g. `.stave/scratch/lens/<name>.png`. */
  path: string;
  sizeBytes: number;
  mtimeMs: number;
}

export interface WorkspaceScratchListing {
  /** Newest first, at most `WORKSPACE_SCRATCH_MAX_FILES`. */
  files: WorkspaceScratchFile[];
  /** Every regular file found within the depth limit, including any past the cap. */
  fileCount: number;
  totalBytes: number;
  /** More files exist than `files` holds. */
  truncated: boolean;
}

/**
 * What the agent is told about the folder. It names the folder by its
 * relative path only, so it is the same text in every workspace and can sit
 * in a provider's cacheable prompt prefix.
 */
export const WORKSPACE_SCRATCH_INSTRUCTION = [
  "## Workspace scratch folder",
  `- \`${WORKSPACE_SCRATCH_DIRECTORY}/\` in the workspace root is your scratch folder. Stave creates it, keeps it out of git, and shows it to the user live while you work.`,
  `- Save what you produce along the way that is not the deliverable there: screenshots, rendered previews, logs, command output and JSON you fetched or generated. For example, run tests as \`<command> 2>&1 | tee ${WORKSPACE_SCRATCH_DIRECTORY}/tests.log\`.`,
  "- Use short descriptive file names such as `login-page.png`, `api-response.json` or `build.log`, and write as you go rather than only to /tmp.",
  "- Never write secrets, tokens, credentials or environment dumps (`env`, `printenv`, `.env` contents) there.",
  `- When you mention a scratch file in your reply, cite its path relative to the workspace root, e.g. \`${WORKSPACE_SCRATCH_DIRECTORY}/tests.log\`.`,
].join("\n");

/** The workspace-relative path of `fileName` inside the scratch folder. */
export function workspaceScratchPath(...parts: string[]): string {
  return [WORKSPACE_SCRATCH_DIRECTORY, ...parts].join("/");
}
