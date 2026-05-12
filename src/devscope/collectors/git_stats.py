"""Walk a repo's commit history and emit per-commit diff statistics.

Used by the activity/stats endpoint. Each commit is enriched with file count
and line +/- so the UI can aggregate without re-reading the repo. Operates
live (no DB cache) so the figures always reflect on-disk reality.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import pygit2
from pygit2.enums import SortMode


@dataclass(frozen=True)
class CommitStat:
    sha: str
    occurred_at: datetime
    author_name: str
    author_email: str
    subject: str
    files_changed: int
    insertions: int
    deletions: int


def collect_commit_stats(
    repo_path: Path, *, since: datetime, until: datetime | None = None
) -> list[CommitStat]:
    """Return commits authored in [since, until] with diff stats, newest first."""
    if since.tzinfo is None:
        since = since.replace(tzinfo=UTC)
    if until is not None and until.tzinfo is None:
        until = until.replace(tzinfo=UTC)
    if not (repo_path / ".git").exists():
        return []
    try:
        repo = pygit2.Repository(str(repo_path))
    except pygit2.GitError:
        return []
    if repo.is_empty or repo.head_is_unborn:
        return []

    out: list[CommitStat] = []
    for commit in repo.walk(repo.head.target, SortMode.TIME):
        occurred = datetime.fromtimestamp(commit.commit_time, tz=UTC)
        if occurred < since:
            break
        if until is not None and occurred > until:
            continue
        files_changed, insertions, deletions = _commit_stats(repo, commit)
        subject = commit.message.splitlines()[0] if commit.message else ""
        out.append(
            CommitStat(
                sha=str(commit.id),
                occurred_at=occurred,
                author_name=commit.author.name or "",
                author_email=commit.author.email or "",
                subject=subject,
                files_changed=files_changed,
                insertions=insertions,
                deletions=deletions,
            )
        )
    return out


def _commit_stats(
    repo: pygit2.Repository, commit: pygit2.Commit
) -> tuple[int, int, int]:
    """Return (files_changed, insertions, deletions) for ``commit``.

    The initial commit is diffed against an empty tree so the first commit's
    file count + additions are still meaningful.
    """
    try:
        if commit.parents:
            diff = repo.diff(commit.parents[0], commit)
        else:
            diff = commit.tree.diff_to_tree(swap=True)
    except pygit2.GitError:
        return (0, 0, 0)
    if diff is None:
        return (0, 0, 0)
    stats = diff.stats
    return (int(stats.files_changed), int(stats.insertions), int(stats.deletions))
