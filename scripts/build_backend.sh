#!/usr/bin/env bash
# Build the devscope-backend Python bundle for the host platform.
# Produces a directory (PyInstaller --onedir) at:
#     src-tauri/binaries/devscope-backend-bundle/
# The executable inside is "devscope-backend"; Tauri spawns it as a sidecar via
# a resource-resolved path (see src-tauri/src/lib.rs). Onedir is chosen over
# onefile so cold-start avoids per-launch /tmp extraction (~50s -> ~1s).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Activate venv if not already active
if [ -z "${VIRTUAL_ENV:-}" ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

# Detect Rust target triple — Tauri uses this for sidecar naming.
TRIPLE="$(rustc -vV | awk '/^host:/ { print $2 }')"
if [ -z "$TRIPLE" ]; then
  echo "could not detect rust target triple" >&2
  exit 1
fi

mkdir -p src-tauri/binaries
OUT_DIR="$(mktemp -d)"
BUNDLE_DEST="src-tauri/binaries/devscope-backend-bundle"
trap 'rm -rf "$OUT_DIR"' EXIT

# Critical hidden imports that PyInstaller's static analysis misses:
# - devscope.web.app is loaded by string in uvicorn.run(), not statically imported
# - sqlalchemy.dialects.sqlite (loaded by dialect name string)
# - alembic.* (runtime imports)
# - pygit2 native libs travel via wheel
# - jinja2 standard prompts dir loaded via FileSystemLoader
# - uvicorn loggers
HIDDEN_IMPORTS=(
  # All devscope submodules (PyInstaller can't trace uvicorn.run string imports)
  "devscope"
  "devscope.web"
  "devscope.web.app"
  "devscope.config"
  "devscope.secrets"
  "devscope.cli"
  "devscope.cli.main"
  "devscope.collectors"
  "devscope.collectors.base"
  "devscope.collectors.git_local"
  "devscope.collectors.git_diff"
  "devscope.collectors.git_stats"
  "devscope.generators"
  "devscope.generators.base"
  "devscope.generators.standup"
  "devscope.generators.commit_message"
  "devscope.github"
  "devscope.github.client"
  "devscope.github.clone"
  "devscope.github.local_match"
  "devscope.llm"
  "devscope.llm.base"
  "devscope.llm.budget"
  "devscope.llm.providers"
  "devscope.llm.providers.ollama"
  "devscope.llm.providers.openai"
  "devscope.llm.router"
  "devscope.storage"
  "devscope.storage.models"
  "devscope.storage.repositories"
  "devscope.storage.session"
  # SQLAlchemy dialect loaded by name string
  "sqlalchemy.dialects.sqlite"
  # uvicorn internal modules not always picked up
  "uvicorn.logging"
  "uvicorn.protocols.http.h11_impl"
  "uvicorn.protocols.websockets.websockets_impl"
  "uvicorn.lifespan.on"
)

PYI_HIDDEN_ARGS=()
for mod in "${HIDDEN_IMPORTS[@]}"; do
  PYI_HIDDEN_ARGS+=(--hidden-import "$mod")
done

pyinstaller \
  --onedir \
  --name devscope-backend \
  --distpath "$OUT_DIR/dist" \
  --workpath "$OUT_DIR/build" \
  --specpath "$OUT_DIR" \
  --noconfirm \
  --clean \
  --add-data "$ROOT/src/devscope/generators/prompts:devscope/generators/prompts" \
  --collect-all cffi \
  --collect-binaries pygit2 \
  "${PYI_HIDDEN_ARGS[@]}" \
  "$ROOT/src/devscope/server_main.py"

# Replace the previous bundle with the freshly built one.
rm -rf "$BUNDLE_DEST"
cp -R "$OUT_DIR/dist/devscope-backend" "$BUNDLE_DEST"
chmod +x "$BUNDLE_DEST/devscope-backend"

# Clean up any stale onefile-era binary so Tauri doesn't pick it up.
rm -f "src-tauri/binaries/devscope-backend-$TRIPLE"

echo "Built sidecar bundle: $BUNDLE_DEST (triple: $TRIPLE)"
