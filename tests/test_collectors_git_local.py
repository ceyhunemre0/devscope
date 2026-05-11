from datetime import datetime, timedelta, timezone
from pathlib import Path

import pygit2
import pytest

from devscope.collectors.git_local import GitLocalCollector


@pytest.fixture
def tmp_repo(tmp_path: Path) -> Path:
    repo_path = tmp_path / "repo"
    repo = pygit2.init_repository(str(repo_path), bare=False)
    sig = pygit2.Signature("test", "test@example.com")

    (repo_path / "a.txt").write_text("first\n")
    repo.index.add("a.txt")
    repo.index.write()
    tree = repo.index.write_tree()
    repo.create_commit("HEAD", sig, sig, "feat: first commit", tree, [])

    (repo_path / "a.txt").write_text("second\n")
    repo.index.add("a.txt")
    repo.index.write()
    tree = repo.index.write_tree()
    parent = repo.head.target
    repo.create_commit("HEAD", sig, sig, "fix: second commit", tree, [parent])
    return repo_path


def test_git_local_collector_returns_commits_in_range(tmp_repo):
    collector = GitLocalCollector(tmp_repo)
    since = datetime.now(timezone.utc) - timedelta(minutes=5)
    events = collector.fetch(since=since)
    assert len(events) == 2
    messages = {e.payload["message_summary"] for e in events}
    assert messages == {"feat: first commit", "fix: second commit"}


def test_git_local_collector_filters_by_since(tmp_repo):
    collector = GitLocalCollector(tmp_repo)
    future = datetime.now(timezone.utc) + timedelta(days=1)
    assert collector.fetch(since=future) == []


def test_git_local_collector_event_fields(tmp_repo):
    collector = GitLocalCollector(tmp_repo)
    since = datetime.now(timezone.utc) - timedelta(minutes=5)
    events = collector.fetch(since=since)
    e = events[0]
    assert e.source == "git_local"
    assert e.type == "commit"
    assert isinstance(e.external_id, str) and len(e.external_id) == 40
    assert "author_name" in e.payload
    assert "files_changed" in e.payload
