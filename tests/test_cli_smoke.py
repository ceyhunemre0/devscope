from pathlib import Path
from unittest.mock import patch

import pygit2
import pytest
from typer.testing import CliRunner

from devscope.cli.main import app
from devscope.llm.base import LLMResponse


class FakeOllama:
    name = "ollama"

    async def complete(self, req):
        return LLMResponse(
            text="# Standup\n- did stuff\n",
            prompt_tokens=20,
            output_tokens=10,
            cost_usd=0.0,
        )


@pytest.fixture
def isolated_home(tmp_path: Path, monkeypatch) -> Path:
    home = tmp_path / "devscope-home"
    monkeypatch.setenv("DEVSCOPE_HOME", str(home))
    return home


@pytest.fixture
def repo_path(tmp_path: Path) -> Path:
    p = tmp_path / "demo-repo"
    repo = pygit2.init_repository(str(p), bare=False)
    sig = pygit2.Signature("ceyhun", "c@example.com")
    (p / "README.md").write_text("# demo\n")
    repo.index.add("README.md")
    repo.index.write()
    tree = repo.index.write_tree()
    repo.create_commit("HEAD", sig, sig, "feat: initial", tree, [])
    return p


def test_init_creates_db_and_home(isolated_home):
    runner = CliRunner()
    result = runner.invoke(app, ["init"])
    assert result.exit_code == 0, result.output
    assert (isolated_home / "devscope.db").exists()
    assert "initialized" in result.output.lower()


def test_projects_add_registers_repo(isolated_home, repo_path):
    runner = CliRunner()
    runner.invoke(app, ["init"])
    result = runner.invoke(app, ["projects", "add", str(repo_path), "--name", "demo"])
    assert result.exit_code == 0, result.output
    assert "demo" in result.output

    result = runner.invoke(app, ["projects", "list"])
    assert result.exit_code == 0
    assert "demo" in result.output


def test_projects_add_rejects_non_repo(isolated_home, tmp_path):
    runner = CliRunner()
    runner.invoke(app, ["init"])
    result = runner.invoke(app, ["projects", "add", str(tmp_path), "--name", "x"])
    assert result.exit_code != 0
    # Rich wraps console output to terminal width; CI's narrow runner inserts a
    # newline between "not a" and "git repository", so collapse whitespace
    # before asserting on the phrase.
    flattened = " ".join(result.output.lower().split())
    assert "not a git repository" in flattened


def test_today_runs_end_to_end(isolated_home, repo_path):
    runner = CliRunner()
    runner.invoke(app, ["init"])
    runner.invoke(app, ["projects", "add", str(repo_path), "--name", "demo"])
    with patch("devscope.cli.main.OllamaProvider", return_value=FakeOllama()):
        result = runner.invoke(app, ["today"])
    assert result.exit_code == 0, result.output
    assert "Standup" in result.output


def test_today_handles_no_activity(isolated_home, repo_path):
    runner = CliRunner()
    runner.invoke(app, ["init"])
    runner.invoke(app, ["projects", "add", str(repo_path), "--name", "demo"])
    result = runner.invoke(app, ["today", "--since-hours", "0"])
    assert result.exit_code == 0
    assert "no activity" in result.output.lower()


def test_today_with_project_filter_only_uses_that_project(isolated_home, tmp_path):
    """--project demo should only scan 'demo', not 'other'."""
    import pygit2

    # Create two separate git repos
    demo_path = tmp_path / "demo-repo"
    other_path = tmp_path / "other-repo"
    sig = pygit2.Signature("ceyhun", "c@example.com")

    for p, msg in ((demo_path, "feat: demo commit"), (other_path, "feat: other commit")):
        repo = pygit2.init_repository(str(p), bare=False)
        (p / "README.md").write_text("# readme\n")
        repo.index.add("README.md")
        repo.index.write()
        tree = repo.index.write_tree()
        repo.create_commit("HEAD", sig, sig, msg, tree, [])

    runner = CliRunner()
    runner.invoke(app, ["init"])
    runner.invoke(app, ["projects", "add", str(demo_path), "--name", "demo"])
    runner.invoke(app, ["projects", "add", str(other_path), "--name", "other"])

    captured_prompts: list[str] = []

    class CapturingOllama:
        name = "ollama"

        async def complete(self, req):
            from devscope.llm.base import LLMResponse

            captured_prompts.append(req.prompt)
            return LLMResponse(
                text="# Standup\n- did stuff\n",
                prompt_tokens=20,
                output_tokens=10,
                cost_usd=0.0,
            )

    with patch("devscope.cli.main.OllamaProvider", return_value=CapturingOllama()):
        result = runner.invoke(app, ["today", "--project", "demo"])

    assert result.exit_code == 0, result.output
    assert len(captured_prompts) == 1
    assert "demo" in captured_prompts[0]
    assert "other" not in captured_prompts[0]


def test_today_with_unknown_project_errors(isolated_home, repo_path):
    """--project with a non-existent name should exit non-zero."""
    runner = CliRunner()
    runner.invoke(app, ["init"])
    runner.invoke(app, ["projects", "add", str(repo_path), "--name", "demo"])
    result = runner.invoke(app, ["today", "--project", "nonexistent"])
    assert result.exit_code != 0
