#!/bin/bash
# --------------------------------------------------------------------------
# Stave Auto-Update Setup
#
# One-liner install:
#   gh api -H 'Accept: application/vnd.github.v3.raw+json' \
#     repos/sendbird-playground/stave/contents/scripts/setup-auto-update.sh | bash
#
# Uninstall:
#   gh api -H 'Accept: application/vnd.github.v3.raw+json' \
#     repos/sendbird-playground/stave/contents/scripts/setup-auto-update.sh | bash -s -- uninstall
#
# Status:
#   gh api -H 'Accept: application/vnd.github.v3.raw+json' \
#     repos/sendbird-playground/stave/contents/scripts/setup-auto-update.sh | bash -s -- status
# --------------------------------------------------------------------------
set -euo pipefail

LABEL="com.stave.app.auto-update"
STAVE_BIN_DIR="$HOME/.stave/bin"
SCRIPT_PATH="${STAVE_BIN_DIR}/auto-update-stave.sh"
PLIST_NAME="${LABEL}.plist"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}"
LOG_DIR="$HOME/Library/Logs/Stave"
LOG_FILE="${LOG_DIR}/auto-update.log"
DEFAULT_REPO="sendbird-playground/stave"
REPO="${STAVE_REPO:-$DEFAULT_REPO}"
if [ -z "$REPO" ]; then
  REPO="$DEFAULT_REPO"
fi
GUI_DOMAIN="gui/$(id -u)"

info()  { printf "\033[1;34m==>\033[0m %s\n" "$1"; }
ok()    { printf "\033[1;32m==>\033[0m %s\n" "$1"; }
warn()  { printf "\033[1;33m==>\033[0m %s\n" "$1"; }
error() { printf "\033[1;31mError:\033[0m %s\n" "$1" >&2; exit 1; }

# ---------------------------------------------------------------------------
# uninstall
# ---------------------------------------------------------------------------
do_uninstall() {
  info "Uninstalling Stave auto-update..."

  if launchctl print "${GUI_DOMAIN}/${LABEL}" >/dev/null 2>&1; then
    launchctl bootout "${GUI_DOMAIN}/${PLIST_PATH}" 2>/dev/null || true
    ok "LaunchAgent unloaded."
  else
    warn "LaunchAgent was not loaded."
  fi

  [ -f "$PLIST_PATH" ]  && rm -f "$PLIST_PATH"  && ok "Removed ${PLIST_PATH}"
  [ -f "$SCRIPT_PATH" ] && rm -f "$SCRIPT_PATH" && ok "Removed ${SCRIPT_PATH}"

  # clean up bin dir if empty
  [ -d "$STAVE_BIN_DIR" ] && rmdir "$STAVE_BIN_DIR" 2>/dev/null || true

  ok "Stave auto-update has been uninstalled."
}

# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------
do_status() {
  printf "\n"
  info "Stave Auto-Update Status"
  printf "  Script:       %s  —  %s\n" "$SCRIPT_PATH" "$([ -f "$SCRIPT_PATH" ] && echo 'installed' || echo 'not found')"
  printf "  LaunchAgent:  %s  —  %s\n" "$PLIST_PATH"  "$([ -f "$PLIST_PATH" ]  && echo 'installed' || echo 'not found')"

  if launchctl print "${GUI_DOMAIN}/${LABEL}" >/dev/null 2>&1; then
    printf "  Service:      \033[1;32mloaded\033[0m\n"
  else
    printf "  Service:      \033[1;31mnot loaded\033[0m\n"
  fi

  if [ -f "$LOG_FILE" ]; then
    printf "\n  Last 5 log lines (%s):\n" "$LOG_FILE"
    tail -n 5 "$LOG_FILE" | sed 's/^/    /'
  else
    printf "\n  Log file:     %s  —  not yet created\n" "$LOG_FILE"
  fi
  printf "\n"
}

# ---------------------------------------------------------------------------
# install (default)
# ---------------------------------------------------------------------------
do_install() {
  # --- prerequisites -------------------------------------------------------
  if [ "$(uname -s)" != "Darwin" ]; then
    error "Auto-update is only supported on macOS."
  fi

  if ! command -v gh >/dev/null 2>&1; then
    error "GitHub CLI (gh) is required. Install with: brew install gh"
  fi

  if ! gh auth status >/dev/null 2>&1; then
    error "GitHub CLI is not authenticated. Run 'gh auth login' first."
  fi

  # --- create auto-update script ------------------------------------------
  info "Installing auto-update script to ${SCRIPT_PATH}..."
  mkdir -p "$STAVE_BIN_DIR"
  mkdir -p "$LOG_DIR"

  cat > "$SCRIPT_PATH" << 'AUTOUPDATE_SCRIPT'
#!/bin/bash
# Stave daily auto-update — executed by launchd
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

APP_NAME="Stave"
DEFAULT_REPO="sendbird-playground/stave"
REPO="${STAVE_REPO:-$DEFAULT_REPO}"
if [ -z "$REPO" ]; then
  REPO="$DEFAULT_REPO"
fi
DEFAULT_INSTALL_DIR="$HOME/Applications"
INSTALL_DIR=""
TARGET_APP="${INSTALL_DIR}/${APP_NAME}.app"
LOG_DIR="$HOME/Library/Logs/Stave"
LOG_FILE="${LOG_DIR}/auto-update.log"

mkdir -p "$LOG_DIR"

log() {
  printf "[%s] %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG_FILE"
}

can_write_install_dir() {
  local dir="$1"
  if [ -d "$dir" ] && [ -w "$dir" ]; then
    return 0
  fi
  local parent_dir
  parent_dir="$(dirname "$dir")"
  [ -d "$parent_dir" ] && [ -w "$parent_dir" ]
}

resolve_install_dir() {
  if [ -n "${STAVE_INSTALL_DIR:-}" ]; then
    printf "%s\n" "$STAVE_INSTALL_DIR"
    return 0
  fi

  if [ -d "$HOME/Applications/${APP_NAME}.app" ]; then
    printf "%s\n" "$HOME/Applications"
    return 0
  fi

  if [ -d "/Applications/${APP_NAME}.app" ] && can_write_install_dir "/Applications"; then
    printf "/Applications\n"
    return 0
  fi

  printf "%s\n" "$DEFAULT_INSTALL_DIR"
}

run_installer() {
  gh api -H 'Accept: application/vnd.github.v3.raw+json' \
    "repos/${REPO}/contents/scripts/install-latest-release.sh" \
    | env PATH="$PATH" GH_PROMPT_DISABLED=1 STAVE_REPO="$REPO" STAVE_INSTALL_DIR="$INSTALL_DIR" bash -s -- --silent
}

INSTALL_DIR="$(resolve_install_dir)"
TARGET_APP="${INSTALL_DIR}/${APP_NAME}.app"

log "--- auto-update check started ---"
log "Install dir: ${INSTALL_DIR}"

# 1. Verify gh authentication
if ! gh auth status >/dev/null 2>&1; then
  log "ERROR: gh is not authenticated. Skipping update. Run 'gh auth login' to fix."
  exit 1
fi

# 2. Resolve remote latest tag
REMOTE_TAG="$(gh release view --repo "$REPO" --json tagName --jq '.tagName' 2>/dev/null || true)"
if [ -z "$REMOTE_TAG" ]; then
  log "ERROR: Failed to resolve latest release tag from ${REPO}."
  exit 1
fi

# 3. Read local installed version from Info.plist
LOCAL_VERSION=""
PLIST="${TARGET_APP}/Contents/Info.plist"
if [ -f "$PLIST" ]; then
  RAW="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST" 2>/dev/null || true)"
  if [ -n "$RAW" ]; then
    LOCAL_VERSION="v${RAW}"
  fi
fi

log "Remote: ${REMOTE_TAG}, Local: ${LOCAL_VERSION:-not installed}"

# 4. Compare versions
if [ "$REMOTE_TAG" = "$LOCAL_VERSION" ]; then
  log "Already up-to-date (${REMOTE_TAG}). Skipping."
  exit 0
fi

# 5. Run silent install
log "Update available: ${LOCAL_VERSION:-none} -> ${REMOTE_TAG}. Installing..."

if run_installer >> "$LOG_FILE" 2>&1; then
  log "Update to ${REMOTE_TAG} completed successfully."
else
  log "ERROR: Update to ${REMOTE_TAG} failed (exit $?)."
  exit 1
fi
AUTOUPDATE_SCRIPT

  chmod +x "$SCRIPT_PATH"
  ok "Auto-update script installed."

  # --- create LaunchAgent plist --------------------------------------------
  info "Installing LaunchAgent to ${PLIST_PATH}..."
  mkdir -p "$(dirname "$PLIST_PATH")"

  # Build a PATH that covers both Apple Silicon and Intel homebrew locations,
  # plus the system defaults. This ensures gh is found in launchd context.
  LAUNCH_PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

  cat > "$PLIST_PATH" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${SCRIPT_PATH}</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>10</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${LAUNCH_PATH}</string>
    </dict>

    <key>StandardOutPath</key>
    <string>${LOG_FILE}</string>
    <key>StandardErrorPath</key>
    <string>${LOG_FILE}</string>

    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
PLIST_EOF

  ok "LaunchAgent plist installed."

  # --- register with launchd -----------------------------------------------
  # Unload first if already registered (idempotent re-install)
  if launchctl print "${GUI_DOMAIN}/${LABEL}" >/dev/null 2>&1; then
    info "Unloading previous LaunchAgent..."
    launchctl bootout "${GUI_DOMAIN}/${PLIST_PATH}" 2>/dev/null || true
  fi

  info "Registering LaunchAgent with launchd..."
  launchctl bootstrap "$GUI_DOMAIN" "$PLIST_PATH"
  ok "LaunchAgent loaded."

  # --- first run (optional, non-blocking) ----------------------------------
  info "Running first update check now..."
  if bash "$SCRIPT_PATH"; then
    ok "First update check completed."
  else
    warn "First update check had issues. Check ${LOG_FILE} for details."
  fi

  # --- summary -------------------------------------------------------------
  printf "\n"
  ok "Stave auto-update is now active!"
  printf "  Schedule:  every day at 10:00 AM (or when your Mac wakes up)\n"
  printf "  Script:    %s\n" "$SCRIPT_PATH"
  printf "  Plist:     %s\n" "$PLIST_PATH"
  printf "  Log:       %s\n" "$LOG_FILE"
  printf "\n"
  printf "  To check status:\n"
  printf "    launchctl print %s/%s\n" "$GUI_DOMAIN" "$LABEL"
  printf "\n"
  printf "  To uninstall:\n"
  printf "    gh api -H 'Accept: application/vnd.github.v3.raw+json' \\\\\n"
  printf "      repos/%s/contents/scripts/setup-auto-update.sh | bash -s -- uninstall\n" "$REPO"
  printf "\n"
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
ACTION="${1:-install}"

case "$ACTION" in
  install)   do_install   ;;
  uninstall) do_uninstall ;;
  status)    do_status    ;;
  *)         error "Unknown action: ${ACTION}. Use install, uninstall, or status." ;;
esac
