"""Entrypoint used by the Tauri sidecar bundle.

When built with PyInstaller, this becomes the `devscope-backend` executable.
It reads PORT and HOST from environment variables (set by Tauri), falling
back to the configured defaults from devscope.config.
"""

from __future__ import annotations

import os
import sys

import uvicorn

from devscope.config import load_settings


def main() -> None:
    settings = load_settings()
    host = os.environ.get("DEVSCOPE_HOST") or settings.web.host
    try:
        port = int(os.environ.get("DEVSCOPE_PORT") or settings.web.port)
    except ValueError:
        print("DEVSCOPE_PORT must be an integer", file=sys.stderr)
        sys.exit(2)

    uvicorn.run(
        "devscope.web.app:app",
        host=host,
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
