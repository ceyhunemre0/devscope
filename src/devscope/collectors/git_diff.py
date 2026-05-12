"""Collect uncommitted changes (staged, unstaged, untracked) from a git repo.

Used by the commit-message suggestion feature. Falls back gracefully if git is
absent or the path is not a repository.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

# Cap how much diff text is shipped to the LLM. Larger diffs are truncated with
# a marker so the model is told the input is incomplete.
_MAX_DIFF_CHARS = 12_000


@dataclass(frozen=True)
class WorkingTreeChanges:
    status: str
    diff: str
    truncated: bool

    @property
    def is_empty(self) -> bool:
        return not self.status.strip() and not self.diff.strip()


def _run(args: list[str], cwd: Path) -> str:
    result = subprocess.run(
        args,
        cwd=cwd,
        check=False,
        capture_output=True,
        text=True,
        timeout=15,
    )
    if result.returncode != 0:
        return ""
    return result.stdout


def collect_working_tree_changes(repo_path: Path) -> WorkingTreeChanges:
    """Read status + tracked diff + untracked file headers from a git working tree.

    Untracked files are listed but not diffed (their full contents would balloon
    the prompt and rarely informs a commit message).
    """
    if not (repo_path / ".git").exists():
        return WorkingTreeChanges(status="", diff="", truncated=False)

    status = _run(["git", "status", "--short"], repo_path)
    staged = _run(["git", "diff", "--staged"], repo_path)
    unstaged = _run(["git", "diff"], repo_path)

    combined: list[str] = []
    if staged.strip():
        combined.append("=== staged ===\n" + staged)
    if unstaged.strip():
        combined.append("=== unstaged ===\n" + unstaged)
    diff = "\n\n".join(combined)

    truncated = False
    if len(diff) > _MAX_DIFF_CHARS:
        diff = diff[:_MAX_DIFF_CHARS] + "\n\n[…truncated…]"
        truncated = True

    return WorkingTreeChanges(status=status.rstrip(), diff=diff, truncated=truncated)
