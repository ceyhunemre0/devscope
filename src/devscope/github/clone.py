"""Clone a GitHub repo into a local path using the user's PAT for auth.

The token is embedded in the clone URL for the duration of the clone, then
stripped from the persisted ``origin`` URL so ``git remote -v`` won't reveal
it on disk.
"""

from __future__ import annotations

import subprocess
from pathlib import Path


class CloneError(Exception):
    pass


def _inject_token(clone_url: str, token: str) -> str:
    if clone_url.startswith("https://"):
        return clone_url.replace("https://", f"https://oauth2:{token}@", 1)
    raise CloneError(f"unsupported clone URL scheme: {clone_url}")


def clone_repo(
    *,
    token: str,
    clone_url: str,
    target_path: Path,
    timeout_seconds: int = 300,
) -> None:
    """Clone ``clone_url`` into ``target_path``. Strips token from origin afterward."""
    if target_path.exists() and any(target_path.iterdir()):
        raise CloneError(f"target path is not empty: {target_path}")
    target_path.parent.mkdir(parents=True, exist_ok=True)

    auth_url = _inject_token(clone_url, token)
    result = subprocess.run(
        ["git", "clone", auth_url, str(target_path)],
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )
    if result.returncode != 0:
        # Sanitize the token out of any error output before surfacing it.
        stderr = (result.stderr or "").replace(token, "<token>").strip()
        raise CloneError(stderr or f"git clone exited with {result.returncode}")

    # Rewrite origin to the token-free URL so the PAT doesn't persist on disk.
    subprocess.run(
        ["git", "remote", "set-url", "origin", clone_url],
        cwd=target_path,
        check=False,
        capture_output=True,
        text=True,
        timeout=10,
    )
