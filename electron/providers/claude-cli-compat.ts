import {
  compareSemverVersions,
  type ParsedSemverVersion,
} from "./runtime-shared";

// Claude Code added the hidden --enable-auto-mode flag in 2.1.71.
// Older builds reject both the flag and `--permission-mode auto`.
export const CLAUDE_CLI_AUTO_MODE_MIN_VERSION = {
  major: 2,
  minor: 1,
  patch: 71,
} satisfies ParsedSemverVersion;

export function isClaudeCliAutoModeSupportedVersion(args: {
  version: ParsedSemverVersion | null;
}) {
  if (!args.version) {
    return false;
  }
  return compareSemverVersions(args.version, CLAUDE_CLI_AUTO_MODE_MIN_VERSION) >= 0;
}
