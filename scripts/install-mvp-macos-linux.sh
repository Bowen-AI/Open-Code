#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL="${OPEN_CODE_GEMMA_MODEL:-gemma3:4b}"
TOOLCHAIN_DIR="${OPEN_CODE_TOOLCHAIN_DIR:-$ROOT/.open-code/toolchain}"
DOWNLOAD_DIR="$TOOLCHAIN_DIR/downloads"
NODE_VERSION="${OPEN_CODE_NODE_VERSION:-v20.18.3}"
RUST_TOOLCHAIN="${OPEN_CODE_RUST_TOOLCHAIN:-1.85.0}"

case "$(uname -s)" in
  Darwin)
    OS="darwin"
    ;;
  Linux)
    OS="linux"
    ;;
  *)
    echo "Open Code MVP installer currently supports macOS and Linux only."
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64|aarch64)
    ARCH="arm64"
    RUST_ARCH="aarch64"
    ;;
  x86_64|amd64)
    ARCH="x64"
    RUST_ARCH="x86_64"
    ;;
  *)
    echo "Unsupported CPU architecture: $(uname -m)"
    exit 1
    ;;
esac

if [ "$OS" = "darwin" ]; then
  RUST_TARGET="${RUST_ARCH}-apple-darwin"
else
  RUST_TARGET="${RUST_ARCH}-unknown-linux-gnu"
fi

mkdir -p "$DOWNLOAD_DIR"

need_node_install=1
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
  if [ "$node_major" -ge 20 ]; then
    need_node_install=0
    NODE_BIN_DIR="$(dirname "$(command -v node)")"
  fi
fi

if [ "$need_node_install" -ne 0 ]; then
  node_name="node-${NODE_VERSION}-${OS}-${ARCH}"
  node_dir="$TOOLCHAIN_DIR/$node_name"
  node_tar="$DOWNLOAD_DIR/$node_name.tar.xz"
  if [ ! -x "$node_dir/bin/node" ]; then
    echo "Installing sandboxed Node.js $NODE_VERSION into $TOOLCHAIN_DIR..."
    curl -fL "https://nodejs.org/dist/${NODE_VERSION}/${node_name}.tar.xz" -o "$node_tar"
    rm -rf "$node_dir"
    tar -xJf "$node_tar" -C "$TOOLCHAIN_DIR"
  fi
  export PATH="$node_dir/bin:$PATH"
  NODE_BIN_DIR="$node_dir/bin"
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm are unavailable after sandbox bootstrap."
  exit 1
fi

need_rust_install=1
if command -v cargo >/dev/null 2>&1 && command -v rustc >/dev/null 2>&1; then
  need_rust_install=0
fi

export CARGO_HOME="${OPEN_CODE_CARGO_HOME:-$TOOLCHAIN_DIR/cargo}"
export RUSTUP_HOME="${OPEN_CODE_RUSTUP_HOME:-$TOOLCHAIN_DIR/rustup}"
export PATH="$CARGO_HOME/bin:$PATH"

if [ "$need_rust_install" -ne 0 ] && ! command -v cargo >/dev/null 2>&1; then
  rustup_bin="$DOWNLOAD_DIR/rustup-init-$RUST_TARGET"
  if [ ! -x "$rustup_bin" ]; then
    echo "Installing sandboxed Rust $RUST_TOOLCHAIN into $TOOLCHAIN_DIR..."
    curl -fL "https://static.rust-lang.org/rustup/dist/${RUST_TARGET}/rustup-init" -o "$rustup_bin"
    chmod +x "$rustup_bin"
  fi
  "$rustup_bin" -y --no-modify-path --profile minimal --default-toolchain "$RUST_TOOLCHAIN"
fi

if ! command -v cargo >/dev/null 2>&1 || ! command -v rustc >/dev/null 2>&1; then
  echo "Rust cargo/rustc are unavailable after sandbox bootstrap."
  exit 1
fi

cd "$ROOT"

ENV_FILE="$TOOLCHAIN_DIR/env.sh"
{
  echo "export CARGO_HOME=\"$CARGO_HOME\""
  echo "export RUSTUP_HOME=\"$RUSTUP_HOME\""
  echo "export PATH=\"$CARGO_HOME/bin:$NODE_BIN_DIR:\$PATH\""
  echo "export OPEN_CODE_GEMMA_MODEL=\"$MODEL\""
} > "$ENV_FILE"

echo "Installing JavaScript dependencies..."
npm install

echo "Running bootstrap checks..."
npm run check:bootstrap

echo "Building extension and memory service..."
npm run build

if command -v ollama >/dev/null 2>&1; then
  echo "Preparing local Gemma model: $MODEL"
  ollama pull "$MODEL"
  echo "Verifying local Gemma response..."
  OPEN_CODE_E2E_MODEL="$MODEL" OPEN_CODE_E2E_BASE_URL="http://127.0.0.1:11434" node scripts/e2e-local-model.mjs
  echo "Gemma is ready through Ollama. Base URL: http://127.0.0.1:11434"
else
  echo
  echo "Ollama is not installed, so the extension and memory daemon are built but local Gemma is not ready yet."
  if [ "$OS" = "linux" ]; then
    echo "Linux one-liner:"
    echo "  curl -fsSL https://ollama.com/install.sh | sh"
  else
    echo "macOS download:"
    echo "  https://ollama.com/download"
  fi
  echo "Then rerun:"
  echo "  OPEN_CODE_GEMMA_MODEL=$MODEL scripts/install-mvp-macos-linux.sh"
fi

echo
echo "Done."
echo "Sandboxed toolchain path: $TOOLCHAIN_DIR"
echo "Reusable environment file: $ENV_FILE"
echo "For extension development in this shell, run:"
echo "  . \"$ENV_FILE\""
echo "  npm run watch"
