#!/bin/sh
set -e

REPO="derekr/athr"
INSTALL_DIR="${ATHR_INSTALL_DIR:-$HOME/.local/bin}"

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  darwin) PLATFORM="darwin" ;;
  linux)  PLATFORM="linux" ;;
  *)      echo "Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64)        ARCH="x64" ;;
  *)             echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

TARGET="${PLATFORM}-${ARCH}"
BINARY="athr-${TARGET}"

# Get latest release tag
TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | head -1 | cut -d'"' -f4)

if [ -z "$TAG" ]; then
  echo "Failed to find latest release"
  exit 1
fi

URL="https://github.com/${REPO}/releases/download/${TAG}/${BINARY}"

echo "Installing athr ${TAG} (${TARGET})..."
echo "  From: ${URL}"
echo "  To:   ${INSTALL_DIR}/athr"

# Create install dir if needed
mkdir -p "$INSTALL_DIR"

# Download
curl -fsSL "$URL" -o "${INSTALL_DIR}/athr"
chmod +x "${INSTALL_DIR}/athr"

# Verify
if "${INSTALL_DIR}/athr" --help > /dev/null 2>&1; then
  echo "Installed successfully!"
else
  echo "Installed binary but it may not run on this platform."
fi

# Check PATH
case ":$PATH:" in
  *":${INSTALL_DIR}:"*) ;;
  *) echo ""; echo "Add to your PATH: export PATH=\"${INSTALL_DIR}:\$PATH\"" ;;
esac
