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
            prompt_tokens=20, output_tokens=10, cost_usd=0.0,
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
    assert "not a git" in result.output.lower()


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
