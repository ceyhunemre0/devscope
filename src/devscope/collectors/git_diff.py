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

# Pathspecs that strip noise from the diff before the LLM sees it. Lockfiles,
# build output, vendor dirs, and minified assets eat tokens without informing a
# commit message.
_DIFF_EXCLUDES: tuple[str, ...] = (
    ":(exclude)*.lock",
    ":(exclude)package-lock.json",
    ":(exclude)pnpm-lock.yaml",
    ":(exclude)yarn.lock",
    ":(exclude)uv.lock",
    ":(exclude)Cargo.lock",
    ":(exclude)poetry.lock",
    ":(exclude)**/dist/**",
    ":(exclude)**/build/**",
    ":(exclude)**/node_modules/**",
    ":(exclude)**/__pycache__/**",
    ":(exclude)**/target/**",
    ":(exclude)**/binaries/**",
    ":(exclude)*.min.js",
    ":(exclude)*.min.css",
    ":(exclude)*.map",
)


@dataclass(frozen=True)
class CommitExample:
    """A recent commit, used as a few-shot example for tone/style."""

    sha: str
    subject: str
    body: str


@dataclass(frozen=True)
class WorkingTreeChanges:
    status: str
    diff: str
    truncated: bool

    @property
    def is_empty(self) -> bool:
        return not self.status.strip() and not self.diff.strip()


@dataclass(frozen=True)
class WorkingTreeSummary:
    """Cheap snapshot of dirtiness — counts only, no diff text."""

    has_changes: bool
    files_changed: int
    insertions: int
    deletions: int
    untracked_count: int


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
    staged = _run(["git", "diff", "--staged", "--", *_DIFF_EXCLUDES], repo_path)
    unstaged = _run(["git", "diff", "--", *_DIFF_EXCLUDES], repo_path)

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


def summarize_working_tree(repo_path: Path) -> WorkingTreeSummary:
    """Count tracked changes + untracked files without dumping diff text."""
    empty = WorkingTreeSummary(
        has_changes=False,
        files_changed=0,
        insertions=0,
        deletions=0,
        untracked_count=0,
    )
    if not (repo_path / ".git").exists():
        return empty

    numstat = _run(["git", "diff", "--numstat", "HEAD"], repo_path)
    files_changed = 0
    insertions = 0
    deletions = 0
    for line in numstat.splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        added_raw, deleted_raw, _path = parts[0], parts[1], parts[2]
        files_changed += 1
        # Binary files are reported as "-\t-\t<path>"; treat as 0/0 for the summary.
        if added_raw.isdigit():
            insertions += int(added_raw)
        if deleted_raw.isdigit():
            deletions += int(deleted_raw)

    untracked = _run(
        ["git", "ls-files", "--others", "--exclude-standard"], repo_path
    )
    untracked_count = sum(1 for line in untracked.splitlines() if line.strip())

    has_changes = files_changed > 0 or untracked_count > 0
    return WorkingTreeSummary(
        has_changes=has_changes,
        files_changed=files_changed,
        insertions=insertions,
        deletions=deletions,
        untracked_count=untracked_count,
    )


# ASCII control chars used to delimit fields/records in `git log --format`
# output. Picked because they cannot appear inside a commit subject/body and
# survive arbitrary whitespace.
_FIELD_SEP = "\x1f"
_RECORD_SEP = "\x1e"


def recent_commit_examples(repo_path: Path, n: int = 8) -> list[CommitExample]:
    """Return the last `n` commits as few-shot examples for the LLM.

    The model uses these to match the repository's tone (terse subjects, WHY
    over WHAT in bodies). Returns an empty list if git is missing or the repo
    has no history.
    """
    if not (repo_path / ".git").exists():
        return []

    fmt = f"%H{_FIELD_SEP}%s{_FIELD_SEP}%b{_RECORD_SEP}"
    raw = _run(["git", "log", f"-n{n}", f"--format={fmt}"], repo_path)
    examples: list[CommitExample] = []
    for record in raw.split(_RECORD_SEP):
        record = record.strip()
        if not record:
            continue
        parts = record.split(_FIELD_SEP, 2)
        if len(parts) < 2:
            continue
        sha = parts[0].strip()
        subject = parts[1].strip()
        body = parts[2].strip() if len(parts) > 2 else ""
        if not subject:
            continue
        examples.append(CommitExample(sha=sha, subject=subject, body=body))
    return examples
