/**
 * OpenCode versions Stave has verified end to end over ACP: initialize,
 * `session/new` config options, `session/set_config_option`, permission
 * requests driven by `OPENCODE_CONFIG_CONTENT`, streaming, `session/load` and
 * `session/cancel`. Both release lines ship the same `opencode` binary name,
 * so each line has its own floor.
 *
 * Fail closed: an older build, an unverified major line, or output Stave
 * cannot read is refused before a turn starts instead of failing midway.
 */
export const OPENCODE_SUPPORTED_VERSION_FLOORS = [
  { major: 1, minor: 19, patch: 0 },
  { major: 2, minor: 0, patch: 29 },
] as const;

export type OpenCodeVersion = { major: number; minor: number; patch: number };

export type OpenCodeVersionSupport =
  | { supported: true; version: OpenCodeVersion; text: string }
  | { supported: false; version: OpenCodeVersion | null; text: string; reason: string };

function formatVersion(version: OpenCodeVersion) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/** Reads `1.19.0` (1.x) and `opencode v2.0.29` (2.x) `--version` output. */
export function parseOpenCodeVersion(text: string): OpenCodeVersion | null {
  const match = text.match(/(?:^|[^\d.])v?(\d+)\.(\d+)\.(\d+)(?![\d.])/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function describeOpenCodeSupportedVersions() {
  return OPENCODE_SUPPORTED_VERSION_FLOORS.map(
    (floor) => `${formatVersion(floor)} or newer in the ${floor.major}.x line`,
  ).join(", or ");
}

export function resolveOpenCodeVersionSupport(
  versionText: string | null | undefined,
): OpenCodeVersionSupport {
  const text = versionText?.trim() ?? "";
  const version = parseOpenCodeVersion(text);
  const required = describeOpenCodeSupportedVersions();
  if (!version) {
    return {
      supported: false,
      version: null,
      text,
      reason: `Stave could not read the OpenCode version. Stave requires OpenCode ${required}.`,
    };
  }
  const floor = OPENCODE_SUPPORTED_VERSION_FLOORS.find(
    (candidate) => candidate.major === version.major,
  );
  const meetsFloor =
    floor !== undefined &&
    (version.minor > floor.minor ||
      (version.minor === floor.minor && version.patch >= floor.patch));
  if (!meetsFloor) {
    return {
      supported: false,
      version,
      text,
      reason: `Unsupported OpenCode version ${formatVersion(version)}. Stave requires OpenCode ${required}.`,
    };
  }
  return { supported: true, version, text };
}
