#!/bin/bash
set -euo pipefail

SILENT=false
for arg in "$@"; do
  case "$arg" in
    --silent) SILENT=true ;;
  esac
done

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

APP_NAME="${STAVE_APP_NAME:-Stave}"
DEFAULT_REPO="sendbird-playground/stave"
REPO="${STAVE_REPO:-$DEFAULT_REPO}"
if [ -z "$REPO" ]; then
  REPO="$DEFAULT_REPO"
fi
ASSET_NAME="${STAVE_RELEASE_ASSET:-Stave-macOS.zip}"
DEFAULT_INSTALL_DIR="$HOME/Applications"
CURRENT_APP_PATH="${STAVE_CURRENT_APP_PATH:-}"
WORK_DIR="$(mktemp -d -t stave-install.XXXXXX)"
ARCHIVE_PATH="${WORK_DIR}/${ASSET_NAME}"
EXTRACT_DIR="${WORK_DIR}/extracted"
FRAMEWORK_LINK_RELATIVE="Contents/Frameworks/Electron Framework.framework/Electron Framework"
FRAMEWORK_CURRENT_RELATIVE="Contents/Frameworks/Electron Framework.framework/Versions/Current/Electron Framework"

info() {
  printf "==> %s\n" "$1"
}

error() {
  printf "Error: %s\n" "$1" >&2
  exit 1
}

cleanup() {
  local exit_code="$1"
  set +e
  if [ "$exit_code" -ne 0 ] && [ -n "${BACKUP_APP:-}" ] && [ -d "${BACKUP_APP}" ] && [ ! -e "${TARGET_APP:-}" ]; then
    mv "$BACKUP_APP" "$TARGET_APP" 2>/dev/null || true
  fi
  if [ "$exit_code" -eq 0 ] && [ -n "${BACKUP_APP:-}" ]; then
    rm -rf "$BACKUP_APP" 2>/dev/null || true
  fi
  rm -rf "$WORK_DIR" 2>/dev/null || true
  if [ -n "${STAGED_APP:-}" ]; then
    rm -rf "$STAGED_APP" 2>/dev/null || true
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Required command not found: $1"
  fi
}

normalize_app_bundle_path() {
  local candidate="$1"
  if [ -z "$candidate" ]; then
    return 1
  fi
  case "$candidate" in
    *.app)
      printf "%s\n" "$candidate"
      return 0
      ;;
    */Contents/*)
      printf "%s\n" "${candidate%%/Contents/*}.app"
      return 0
      ;;
  esac
  return 1
}

is_transient_app_bundle_path() {
  case "$1" in
    /Volumes/*|*/AppTranslocation/*)
      return 0
      ;;
  esac
  return 1
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

  local current_bundle=""
  current_bundle="$(normalize_app_bundle_path "$CURRENT_APP_PATH" || true)"
  if [ -n "$current_bundle" ] && ! is_transient_app_bundle_path "$current_bundle"; then
    local current_dir
    current_dir="$(dirname "$current_bundle")"
    if can_write_install_dir "$current_dir"; then
      printf "%s\n" "$current_dir"
      return 0
    fi
  fi

  local candidate_dir
  for candidate_dir in "$HOME/Applications" "/Applications"; do
    if [ -d "${candidate_dir}/${APP_NAME}.app" ] && can_write_install_dir "$candidate_dir"; then
      printf "%s\n" "$candidate_dir"
      return 0
    fi
  done

  printf "%s\n" "$DEFAULT_INSTALL_DIR"
}

trap 'status=$?; cleanup "$status"; exit "$status"' EXIT

require_command gh
require_command ditto
require_command readlink
require_command xattr
require_command open

INSTALL_DIR="$(resolve_install_dir)"
TARGET_APP="${INSTALL_DIR}/${APP_NAME}.app"
STAGED_APP="${INSTALL_DIR}/.${APP_NAME}.app.staged"
BACKUP_APP="${INSTALL_DIR}/.${APP_NAME}.app.previous"

if ! gh auth status >/dev/null 2>&1; then
  error "GitHub CLI is not authenticated. Run 'gh auth login' first and ensure your account can access ${REPO}."
fi

info "Resolving latest release for ${REPO}..."
TAG_NAME="$(gh release view --repo "$REPO" --json tagName --jq '.tagName')"
if [ -z "$TAG_NAME" ]; then
  error "Failed to resolve the latest release tag for ${REPO}."
fi
info "Latest release: ${TAG_NAME}"

mkdir -p "$EXTRACT_DIR"

info "Downloading ${ASSET_NAME}..."
gh release download --repo "$REPO" --pattern "$ASSET_NAME" --dir "$WORK_DIR" --clobber >/dev/null

if [ ! -f "$ARCHIVE_PATH" ]; then
  error "Downloaded asset not found: ${ARCHIVE_PATH}"
fi

info "Extracting ${ASSET_NAME}..."
ditto -x -k "$ARCHIVE_PATH" "$EXTRACT_DIR"

SOURCE_APP="$(find "$EXTRACT_DIR" -maxdepth 2 -type d -name "${APP_NAME}.app" | head -n 1 || true)"
if [ -z "$SOURCE_APP" ] || [ ! -d "$SOURCE_APP" ]; then
  error "Expected ${APP_NAME}.app in the extracted release bundle, but it was not found."
fi

FRAMEWORK_LINK="${SOURCE_APP}/${FRAMEWORK_LINK_RELATIVE}"
FRAMEWORK_TARGET="$(readlink "$FRAMEWORK_LINK" || true)"
if [ -z "$FRAMEWORK_TARGET" ]; then
  error "Release bundle is invalid: Electron Framework link is missing."
fi
if [ "${FRAMEWORK_TARGET#/}" != "$FRAMEWORK_TARGET" ]; then
  error "Release bundle is invalid: Electron Framework uses an absolute symlink target (${FRAMEWORK_TARGET}). Install a newer Stave release."
fi
if [ ! -e "${SOURCE_APP}/${FRAMEWORK_CURRENT_RELATIVE}" ]; then
  error "Release bundle is invalid: Electron Framework binary is missing from the app bundle."
fi

mkdir -p "$INSTALL_DIR"
rm -rf "$STAGED_APP" "$BACKUP_APP"

info "Using install directory: ${INSTALL_DIR}"
info "Staging ${APP_NAME}..."
ditto "$SOURCE_APP" "$STAGED_APP"

info "Removing quarantine attribute..."
xattr -dr com.apple.quarantine "$STAGED_APP" 2>/dev/null || true

if [ -d "$TARGET_APP" ]; then
  info "Backing up existing installation..."
  mv "$TARGET_APP" "$BACKUP_APP"
fi

info "Installing ${APP_NAME} into ${INSTALL_DIR}..."
mv "$STAGED_APP" "$TARGET_APP"

if [ "$SILENT" = false ]; then
  info "Opening ${APP_NAME}..."
  open "$TARGET_APP"
fi

info "${APP_NAME} ${TAG_NAME} installed successfully."
if [ "$SILENT" = false ]; then
  printf "Open later with: open %s\n" "$(printf '%q' "$TARGET_APP")"
fi
