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

/** Sub-agents save their output in `agents/<short-id>/` under the scratch folder. */
export const WORKSPACE_SCRATCH_AGENTS_DIRECTORY = "agents";

/** A text preview reads at most this many bytes from the end of a file. */
export const WORKSPACE_SCRATCH_TAIL_BYTES = 256 * 1024;

/** In a workspace that is never archived (a project's main checkout), files older than this are removed. */
export const WORKSPACE_SCRATCH_RETENTION_DAYS = 30;

/** Pushed by main to a subscribed window when a watched scratch folder changes. */
export const WORKSPACE_SCRATCH_CHANGED_CHANNEL = "scratch:changed";

export interface WorkspaceScratchChangedEvent {
  rootPath: string;
  /**
   * false: the folder is no longer watched (the watcher failed or the folder
   * was removed), so the window lists it on a timer instead.
   */
  watching: boolean;
}

/** The end of a text file in the scratch folder, for a preview. */
export interface WorkspaceScratchTail {
  content: string;
  sizeBytes: number;
  /** Only the last `WORKSPACE_SCRATCH_TAIL_BYTES` (or fewer) bytes are in `content`. */
  truncated: boolean;
}

/** One file in the scratch folder. */
export interface WorkspaceScratchFile {
  /** Relative to the workspace root, e.g. `.stave/scratch/lens/<name>.png`. */
  path: string;
  sizeBytes: number;
  mtimeMs: number;
}

export function scratchArtifactKind(path: string) {
  if (/\.html?$/i.test(path)) return "html";
  if (/\.(md|markdown)$/i.test(path)) return "markdown";
  if (/\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(path)) return "image";
  if (path.startsWith(workspaceScratchPath("artifacts") + "/")) return "artifact";
  return undefined;
}

export interface WorkspaceScratchListing {
  /** Additional results older than the newest files in the general listing. */
  olderArtifacts?: WorkspaceScratchFile[];
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
  `- Put files intended for the user to inspect in ${WORKSPACE_SCRATCH_DIRECTORY}/artifacts/. Keep diagnostic logs and intermediate output outside that subfolder.`,
  "- Use short descriptive file names such as `login-page.png`, `api-response.json` or `build.log`, and write as you go rather than only to /tmp.",
  "- Never write secrets, tokens, credentials or environment dumps (`env`, `printenv`, `.env` contents) there.",
  `- When you mention a scratch file in your reply, cite its path relative to the workspace root, e.g. \`${WORKSPACE_SCRATCH_DIRECTORY}/tests.log\`.`,
].join("\n");

/**
 * The line a sub-agent's brief gets so it keeps its own output apart from the
 * lead's: `folder` is where it should write.
 */
export function buildWorkspaceScratchSubagentInstruction(folder: string): string {
  return [
    `Stave scratch folder for this sub-agent: \`${folder}\`. Save screenshots, logs, command output and JSON you produce along the way there (create the folder first) instead of /tmp,`,
    "never write secrets, tokens or environment dumps there, and cite the paths of any files you mention in your final report.",
  ].join(" ");
}

/**
 * Codex has no hook that can rewrite a sub-agent's brief, so the lead is
 * asked to pass the same line on when it starts one.
 */
export const WORKSPACE_SCRATCH_SUBAGENT_DELEGATION_INSTRUCTION =
  "- When you start a subagent (for example with `spawn_agent`), pick a short name for it and add this line to its message: " +
  `"${buildWorkspaceScratchSubagentInstruction(
    `${WORKSPACE_SCRATCH_DIRECTORY}/${WORKSPACE_SCRATCH_AGENTS_DIRECTORY}/<short-name>/`,
  )}"`;

/** The workspace-relative path of `fileName` inside the scratch folder. */
export function workspaceScratchPath(...parts: string[]): string {
  return [WORKSPACE_SCRATCH_DIRECTORY, ...parts].join("/");
}
