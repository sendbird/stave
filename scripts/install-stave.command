#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
SOURCE_APP="$SCRIPT_DIR/Stave.app"
TARGET_DIR="$HOME/Applications"
TARGET_APP="$TARGET_DIR/Stave.app"

if [ ! -d "$SOURCE_APP" ]; then
  echo "Stave.app was not found next to this installer."
  echo "Unzip the release bundle first, then run Install Stave.command from the extracted folder."
  exit 1
fi

mkdir -p "$TARGET_DIR"
rm -rf "$TARGET_APP"
ditto "$SOURCE_APP" "$TARGET_APP"
xattr -dr com.apple.quarantine "$TARGET_APP" 2>/dev/null || true
open "$TARGET_APP"
