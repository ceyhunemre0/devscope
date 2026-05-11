from datetime import UTC, datetime, timedelta
from pathlib import Path

import pygit2
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def isolated_home(tmp_path: Path, monkeypatch) -> Path:
    home = tmp_path / "devscope-home"
    home.mkdir()
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


def _client(isolated_home):
    # Import fresh so create_app() reads the isolated home.
    import importlib

    import devscope.web.app as web_app

    importlib.reload(web_app)
    return TestClient(web_app.app)


def test_dashboard_renders(isolated_home):
    client = _client(isolated_home)
    resp = client.get("/")
    assert resp.status_code == 200
    assert "Dashboard" in resp.text
    assert "tracked projects: 0" in resp.text


def test_projects_page_lists_registered_projects(isolated_home, repo_path):
    from devscope.config import load_settings
    from devscope.storage.repositories import ProjectRepo
    from devscope.storage.session import init_db, make_engine, session_factory

    settings = load_settings()
    engine = make_engine(settings.storage.db_path)
    init_db(engine)
    SessionLocal = session_factory(engine)
    with SessionLocal() as session:
        ProjectRepo(session).create(name="demo", path=str(repo_path))
        session.commit()

    client = _client(isolated_home)
    resp = client.get("/projects")
    assert resp.status_code == 200
    assert "demo" in resp.text
    assert str(repo_path) in resp.text


def test_reports_page_shows_existing_reports(isolated_home):
    from devscope.config import load_settings
    from devscope.storage.repositories import ReportRepo
    from devscope.storage.session import init_db, make_engine, session_factory

    settings = load_settings()
    engine = make_engine(settings.storage.db_path)
    init_db(engine)
    SessionLocal = session_factory(engine)
    now = datetime.now(UTC)
    with SessionLocal() as session:
        ReportRepo(session).save(
            project_id=None,
            type="standup",
            content="# Yesterday\n- shipped storage layer",
            period_start=now - timedelta(hours=24),
            period_end=now,
            llm_call_id=None,
            generated_at=now,
        )
        session.commit()

    client = _client(isolated_home)
    resp = client.get("/reports")
    assert resp.status_code == 200
    assert "shipped storage layer" in resp.text
