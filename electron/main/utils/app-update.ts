import { app } from "electron";
import { spawn } from "node:child_process";
import { constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  AppUpdateInstallResult,
  AppUpdateStatusSnapshot,
} from "../../../src/lib/app-update";
import {
  compareAppVersionTags,
  isAppUpdateAvailable,
  normalizeAppVersionTag,
} from "../../../src/lib/app-update";
import { resolveStaveReleaseRepo } from "../../../src/lib/release-repo";
import { resolveExecutableLookupPath } from "../../providers/executable-path";
import { bypassQuitConfirmation } from "../quit-state";
import { runCommandArgs } from "./command";

const FALLBACK_LOOKUP_PATH =
  "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

function resolveReleaseRepo() {
  return resolveStaveReleaseRepo(process.env.STAVE_REPO);
}

function isSupportedAppUpdateTarget() {
  return process.platform === "darwin" && app.isPackaged;
}

function buildTimestampedLogLine(message: string) {
  return `printf '[%s] %s\\n' "$(date '+%Y-%m-%d %H:%M:%S')" '${message.replaceAll("'", `'\\''`)}' >> "$LOG_FILE"`;
}

function quoteShell(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function isTransientAppBundlePath(value: string) {
  return value.startsWith("/Volumes/") || value.includes("/AppTranslocation/");
}

function resolveCurrentAppBundlePath() {
  if (process.platform !== "darwin") {
    return null;
  }
  const executablePath = app.getPath("exe");
  const contentsDir = path.dirname(path.dirname(executablePath));
  if (path.basename(contentsDir) !== "Contents") {
    return null;
  }
  const bundlePath = path.dirname(contentsDir);
  return bundlePath.endsWith(".app") ? bundlePath : null;
}

async function canWriteInstallDir(dirPath: string) {
  try {
    await fs.access(dirPath, fsConstants.W_OK);
    return true;
  } catch {
    try {
      await fs.access(path.dirname(dirPath), fsConstants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}

async function resolvePreferredInstallDir() {
  const bundlePath = resolveCurrentAppBundlePath();
  if (!bundlePath || isTransientAppBundlePath(bundlePath)) {
    return null;
  }
  const installDir = path.dirname(bundlePath);
  return (await canWriteInstallDir(installDir)) ? installDir : null;
}

async function runGhCommand(commandArgs: string[]) {
  return runCommandArgs({
    command: "gh",
    commandArgs,
  });
}

async function resolveLatestReleaseTag(repo: string) {
  const result = await runGhCommand([
    "release",
    "view",
    "--repo",
    repo,
    "--json",
    "tagName",
    "--jq",
    ".tagName",
  ]);
  const latestVersion = normalizeAppVersionTag(result.stdout);
  return {
    result,
    latestVersion,
  };
}

export async function getAppUpdateStatusSnapshot(): Promise<AppUpdateStatusSnapshot> {
  const checkedAt = new Date().toISOString();
  const currentVersion = normalizeAppVersionTag(app.getVersion());

  if (!isSupportedAppUpdateTarget()) {
    return {
      state: "unsupported",
      supported: false,
      checkedAt,
      currentVersion,
      latestVersion: null,
      summary: "In-app updates are available only in packaged macOS builds.",
      detail:
        "Use the authenticated install script or the daily LaunchAgent flow outside development builds.",
      canInstall: false,
    };
  }

  const ghVersionResult = await runGhCommand(["--version"]);
  if (!ghVersionResult.ok) {
    return {
      state: "blocked",
      supported: true,
      checkedAt,
      currentVersion,
      latestVersion: null,
      summary: "GitHub CLI is required for in-app updates.",
      detail: ghVersionResult.stderr || "Install `gh` and retry.",
      canInstall: false,
    };
  }

  const ghAuthResult = await runGhCommand(["auth", "status"]);
  if (!ghAuthResult.ok) {
    return {
      state: "blocked",
      supported: true,
      checkedAt,
      currentVersion,
      latestVersion: null,
      summary: "GitHub CLI login is required for in-app updates.",
      detail: ghAuthResult.stderr || "Run `gh auth login` and retry.",
      canInstall: false,
    };
  }

  const repo = resolveReleaseRepo();
  const { result: latestResult, latestVersion } =
    await resolveLatestReleaseTag(repo);
  if (!latestResult.ok || !latestVersion) {
    return {
      state: "error",
      supported: true,
      checkedAt,
      currentVersion,
      latestVersion: null,
      summary: "Failed to resolve the latest Stave release.",
      detail:
        latestResult.stderr ||
        latestResult.stdout ||
        `Unable to read the latest tag from ${repo}.`,
      canInstall: false,
    };
  }

  if (isAppUpdateAvailable({ currentVersion, latestVersion })) {
    return {
      state: "available",
      supported: true,
      checkedAt,
      currentVersion,
      latestVersion,
      summary: `Update available: ${currentVersion ?? "unknown"} -> ${latestVersion}`,
      detail: "Install the latest packaged release and restart Stave.",
      canInstall: true,
    };
  }

  const compareResult =
    currentVersion && latestVersion
      ? compareAppVersionTags({ currentVersion, latestVersion })
      : 0;

  return {
    state: "up-to-date",
    supported: true,
    checkedAt,
    currentVersion,
    latestVersion,
    summary:
      compareResult < 0
        ? `Installed build is newer than the latest published release (${currentVersion}).`
        : `Stave is up to date (${latestVersion}).`,
    detail:
      compareResult < 0
        ? "No in-app update is required for this build."
        : "No newer GitHub release is available right now.",
    canInstall: false,
  };
}

async function writeUpdateHelperScript(args: { repo: string }) {
  const helperDir = await fs.mkdtemp(path.join(os.tmpdir(), "stave-update-"));
  const helperPath = path.join(helperDir, "install-and-relaunch.sh");
  const lookupPath =
    resolveExecutableLookupPath({
      basePath: process.env.PATH,
    }) || FALLBACK_LOOKUP_PATH;
  const preferredInstallDir = await resolvePreferredInstallDir();
  const currentAppBundlePath = resolveCurrentAppBundlePath();
  const script = `#!/bin/bash
set -euo pipefail

SELF="$0"
CURRENT_PID=${process.pid}
REPO=${quoteShell(args.repo)}
LOOKUP_PATH=${quoteShell(lookupPath)}
PREFERRED_INSTALL_DIR=${quoteShell(preferredInstallDir ?? "")}
CURRENT_APP_BUNDLE=${quoteShell(currentAppBundlePath ?? "")}
LOG_DIR="$HOME/Library/Logs/Stave"
LOG_FILE="$LOG_DIR/in-app-update.log"

cleanup() {
  rm -f "$SELF"
  rmdir "$(dirname "$SELF")" 2>/dev/null || true
}

wait_for_process_exit() {
  local pid="$1"
  local attempts=0
  while kill -0 "$pid" 2>/dev/null; do
    sleep 0.2
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 150 ]; then
      break
    fi
  done
}

reopen_current_app() {
  if [ -n "$CURRENT_APP_BUNDLE" ] && [ -d "$CURRENT_APP_BUNDLE" ]; then
    open "$CURRENT_APP_BUNDLE" >/dev/null 2>&1 || true
  fi
}

run_installer() {
  if [ -n "$PREFERRED_INSTALL_DIR" ]; then
    gh api -H 'Accept: application/vnd.github.v3.raw+json' "repos/\${REPO}/contents/scripts/install-latest-release.sh" \
      | env PATH="$PATH" GH_PROMPT_DISABLED=1 STAVE_REPO="$REPO" STAVE_INSTALL_DIR="$PREFERRED_INSTALL_DIR" bash
    return
  fi

  gh api -H 'Accept: application/vnd.github.v3.raw+json' "repos/\${REPO}/contents/scripts/install-latest-release.sh" \
    | env PATH="$PATH" GH_PROMPT_DISABLED=1 STAVE_REPO="$REPO" bash
}

trap cleanup EXIT

mkdir -p "$LOG_DIR"
export PATH="$LOOKUP_PATH"
${buildTimestampedLogLine("starting in-app update")}

if ! command -v gh >/dev/null 2>&1; then
  ${buildTimestampedLogLine("update failed: gh not found on helper PATH")}
  reopen_current_app
  exit 1
fi

wait_for_process_exit "$CURRENT_PID"

if run_installer >> "$LOG_FILE" 2>&1; then
  ${buildTimestampedLogLine("update installed successfully")}
else
  ${buildTimestampedLogLine("update failed")}
  reopen_current_app
  exit 1
fi
`;

  await fs.writeFile(helperPath, script, { mode: 0o700 });
  return helperPath;
}

export async function scheduleAppUpdateInstallAndRestart(): Promise<AppUpdateInstallResult> {
  const status = await getAppUpdateStatusSnapshot();
  if (!status.supported) {
    return {
      ok: false,
      scheduled: false,
      summary: status.summary,
      detail: status.detail,
    };
  }

  if (status.state !== "available" || !status.canInstall) {
    return {
      ok: false,
      scheduled: false,
      summary: status.summary,
      detail: status.detail,
    };
  }

  const helperPath = await writeUpdateHelperScript({
    repo: resolveReleaseRepo(),
  });

  const lookupPath =
    resolveExecutableLookupPath({
      basePath: process.env.PATH,
    }) || FALLBACK_LOOKUP_PATH;
  const helperProcess = spawn("/bin/bash", [helperPath], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PATH: lookupPath,
    },
  });
  helperProcess.unref();

  // Skip the quit-confirmation dialog — the user already confirmed the update.
  bypassQuitConfirmation();
  setTimeout(() => {
    app.quit();
  }, 150);

  return {
    ok: true,
    scheduled: true,
    summary: `Installing ${status.latestVersion} and restarting Stave.`,
    detail: "Stave will close now and reopen after the update completes.",
  };
}
