from pathlib import Path

import pygit2
import pytest
from typer.testing import CliRunner

from devscope.cli.main import app


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
