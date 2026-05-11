from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pygit2

from devscope.collectors.base import Event


class GitLocalCollector:
    def __init__(self, repo_path: Path) -> None:
        self._repo_path = Path(repo_path)

    def fetch(self, *, since: datetime) -> list[Event]:
        if since.tzinfo is None:
            since = since.replace(tzinfo=timezone.utc)

        repo = pygit2.Repository(str(self._repo_path))
        if repo.is_empty or repo.head_is_unborn:
            return []

        events: list[Event] = []
        for commit in repo.walk(repo.head.target, pygit2.GIT_SORT_TIME):
            occurred = datetime.fromtimestamp(commit.commit_time, tz=timezone.utc)
            if occurred < since:
                break
            events.append(
                Event(
                    source="git_local",
                    type="commit",
                    external_id=str(commit.id),
                    payload={
                        "message_summary": commit.message.splitlines()[0]
                        if commit.message else "",
                        "message_body": commit.message,
                        "author_name": commit.author.name,
                        "author_email": commit.author.email,
                        "files_changed": _files_changed(repo, commit),
                    },
                    occurred_at=occurred,
                )
            )
        return events


def _files_changed(repo: pygit2.Repository, commit: pygit2.Commit) -> list[str]:
    if not commit.parents:
        return _walk_tree(repo, commit.tree)
    parent = commit.parents[0]
    diff = repo.diff(parent, commit)
    return [patch.delta.new_file.path for patch in diff]


def _walk_tree(repo: pygit2.Repository, tree: pygit2.Tree, prefix: str = "") -> list[str]:
    paths: list[str] = []
    for entry in tree:
        if entry.type_str == "tree":
            subtree = repo[entry.id]
            paths.extend(_walk_tree(repo, subtree, prefix + entry.name + "/"))
        else:
            paths.append(prefix + entry.name)
    return paths
