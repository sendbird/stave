export type AppUpdateState =
  | "unsupported"
  | "up-to-date"
  | "available"
  | "blocked"
  | "error";

export interface AppUpdateStatusSnapshot {
  state: AppUpdateState;
  supported: boolean;
  checkedAt: string | null;
  currentVersion: string | null;
  latestVersion: string | null;
  summary: string;
  detail: string;
  canInstall: boolean;
}

export interface AppUpdateInstallResult {
  ok: boolean;
  scheduled: boolean;
  summary: string;
  detail: string;
}

function parseSemverVersion(value: string) {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemverVersions(
  left: { major: number; minor: number; patch: number },
  right: { major: number; minor: number; patch: number },
) {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  return left.patch - right.patch;
}

export function normalizeAppVersionTag(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

export function compareAppVersionTags(args: {
  currentVersion: string;
  latestVersion: string;
}) {
  const current = parseSemverVersion(args.currentVersion);
  const latest = parseSemverVersion(args.latestVersion);
  if (!current || !latest) {
    if (args.currentVersion === args.latestVersion) {
      return 0;
    }
    return args.latestVersion.localeCompare(args.currentVersion);
  }
  return compareSemverVersions(latest, current);
}

export function isAppUpdateAvailable(args: {
  currentVersion: string | null | undefined;
  latestVersion: string | null | undefined;
}) {
  const currentVersion = normalizeAppVersionTag(args.currentVersion);
  const latestVersion = normalizeAppVersionTag(args.latestVersion);
  if (!currentVersion || !latestVersion) {
    return false;
  }
  return compareAppVersionTags({ currentVersion, latestVersion }) > 0;
}
