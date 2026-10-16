export interface CommandResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
}

export interface SourceControlStatusItem {
  code: string;
  path: string;
  indexStatus?: string;
  workingTreeStatus?: string;
}

export interface DetachedCheckoutResult extends CommandResult {
  /** Resolved remote ref such as `origin/main`, or an empty string when resolution failed. */
  ref: string;
  /** Short commit hash of the detached HEAD, or an empty string when the checkout failed. */
  head: string;
}

export interface RootFileEntry {
  relativePath: string;
}
