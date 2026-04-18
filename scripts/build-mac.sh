#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/packages/desktop"
RELEASE_DIR="$DESKTOP_DIR/release"
VERSION="$(node -p "require('$DESKTOP_DIR/package.json').version")"
ARCH="$(uname -m)"

case "$ARCH" in
  arm64) ARCH_LABEL="arm64" ;;
  x86_64) ARCH_LABEL="x64" ;;
  *)
    echo "Unsupported macOS architecture: $ARCH" >&2
    exit 1
    ;;
esac

echo "Building Paseo macOS desktop for $ARCH_LABEL..."
(cd "$ROOT_DIR" && npm run build:desktop)

APP_PATH="$(find "$RELEASE_DIR" -maxdepth 2 -path "*/Paseo.app" -print -quit)"
if [[ -z "$APP_PATH" ]]; then
  echo "Failed to locate built Paseo.app under $RELEASE_DIR" >&2
  exit 1
fi

PKG_PATH="$RELEASE_DIR/Paseo-$VERSION-$ARCH_LABEL.pkg"
rm -f "$PKG_PATH"
productbuild --component "$APP_PATH" /Applications "$PKG_PATH"

echo
echo "Artifacts:"
ls -lh "$PKG_PATH" "$RELEASE_DIR/Paseo-$VERSION-$ARCH_LABEL.dmg" "$RELEASE_DIR/Paseo-$VERSION-$ARCH_LABEL.zip"
echo
echo "SHA256:"
shasum -a 256 "$PKG_PATH" "$RELEASE_DIR/Paseo-$VERSION-$ARCH_LABEL.dmg" "$RELEASE_DIR/Paseo-$VERSION-$ARCH_LABEL.zip"
