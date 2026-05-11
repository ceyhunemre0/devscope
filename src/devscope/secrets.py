"""Persistent secret store backed by ``~/.devscope/.env`` (chmod 600).

Lookup precedence is **env var first, file second**. This means a user can
override at the shell level without editing the stored file, but the UI can
still persist a key for convenience between sessions.

The file format is a minimal subset of dotenv: one ``KEY=value`` per line,
no quoting, no expansion. We control writes; we tolerate blank lines and
``#`` comments on read.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

from devscope.config import load_settings

_KEY_RE = re.compile(r"^[A-Z_][A-Z0-9_]*$")


def _secrets_path() -> Path:
    return load_settings().storage.home / ".env"


def _load_file() -> dict[str, str]:
    path = _secrets_path()
    if not path.exists():
        return {}
    out: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if _KEY_RE.match(key):
            out[key] = value.strip()
    return out


def get_secret(name: str) -> str | None:
    """Resolve a secret by name. Env var wins over the stored file."""
    env = os.environ.get(name)
    if env:
        return env
    stored = _load_file().get(name)
    return stored or None


def set_secret(name: str, value: str) -> None:
    """Persist ``name=value`` to ``~/.devscope/.env`` (chmod 600)."""
    if not _KEY_RE.match(name):
        raise ValueError(f"Invalid secret name: {name!r}")
    if "\n" in value or "\r" in value:
        raise ValueError("Secret value must not contain newlines.")

    path = _secrets_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    current = _load_file()
    current[name] = value

    body = "".join(f"{k}={v}\n" for k, v in sorted(current.items()))
    path.write_text(body, encoding="utf-8")
    path.chmod(0o600)


def delete_secret(name: str) -> None:
    """Remove a secret from storage (no-op if absent)."""
    current = _load_file()
    if name not in current:
        return
    del current[name]
    path = _secrets_path()
    body = "".join(f"{k}={v}\n" for k, v in sorted(current.items()))
    path.write_text(body, encoding="utf-8")
    path.chmod(0o600)


def mask(value: str | None) -> str:
    """Render a key for display: only the last 4 chars, prefixed with ellipsis."""
    if not value:
        return "—"
    if len(value) <= 4:
        return "•" * len(value)
    return "…" + value[-4:]


def has_secret(name: str) -> bool:
    return get_secret(name) is not None
