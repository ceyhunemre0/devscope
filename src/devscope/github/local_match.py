"""Match local tracked projects to their GitHub identity by reading origin URL."""

from __future__ import annotations

import re
from pathlib import Path

import pygit2

_GH_PATTERNS = (
    re.compile(r"^https?://github\.com/([^/]+/[^/]+?)(?:\.git)?/?$"),
    re.compile(r"^git@github\.com:([^/]+/[^/]+?)(?:\.git)?/?$"),
    re.compile(r"^ssh://git@github\.com[:/]([^/]+/[^/]+?)(?:\.git)?/?$"),
)


def parse_github_full_name(url: str) -> str | None:
    """Return ``owner/repo`` if the URL points at github.com, else None."""
    for pattern in _GH_PATTERNS:
        m = pattern.match(url.strip())
        if m:
            return m.group(1)
    return None


def read_github_full_name(repo_path: Path) -> str | None:
    """Read the local repo's origin URL via pygit2 and parse a GitHub identity.

    Returns None if the path is not a repo, has no origin, or the origin is
    hosted somewhere other than github.com.
    """
    if not (repo_path / ".git").exists():
        return None
    try:
        repo = pygit2.Repository(str(repo_path))
        remote = repo.remotes["origin"]
        url = remote.url
    except (pygit2.GitError, KeyError, AttributeError):
        return None
    if not url:
        return None
    return parse_github_full_name(url)
