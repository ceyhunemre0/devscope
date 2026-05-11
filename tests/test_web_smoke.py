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
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
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
    import importlib

    import devscope.web.app as web_app

    importlib.reload(web_app)
    return TestClient(web_app.app)


def test_health(isolated_home):
    c = _client(isolated_home)
    resp = c.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_dashboard_empty_state(isolated_home):
    c = _client(isolated_home)
    resp = c.get("/api/dashboard")
    assert resp.status_code == 200
    body = resp.json()
    assert body["project_count"] == 0
    assert body["report_count"] == 0
    assert body["latest"] is None
    assert body["openai_stored"] is False


def test_add_project_via_api(isolated_home, repo_path):
    c = _client(isolated_home)
    resp = c.post("/api/projects", json={"path": str(repo_path), "name": "demo"})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "demo"
    assert body["state"] == "active"

    resp = c.get("/api/projects")
    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()]
    assert "demo" in names


def test_add_project_rejects_non_git(isolated_home, tmp_path):
    c = _client(isolated_home)
    resp = c.post("/api/projects", json={"path": str(tmp_path), "name": "x"})
    assert resp.status_code == 400
    assert "git" in resp.text.lower()


def test_add_project_rejects_duplicate_name(isolated_home, repo_path):
    c = _client(isolated_home)
    c.post("/api/projects", json={"path": str(repo_path), "name": "demo"})
    resp = c.post("/api/projects", json={"path": str(repo_path), "name": "demo"})
    assert resp.status_code == 409


def test_discover_finds_git_repos(isolated_home, tmp_path):
    # Two repos at depth 1
    for name in ("alpha", "beta"):
        d = tmp_path / "workspace" / name
        d.mkdir(parents=True)
        pygit2.init_repository(str(d), bare=False)

    c = _client(isolated_home)
    resp = c.post(
        "/api/projects/discover",
        json={"root": str(tmp_path / "workspace"), "depth": 3},
    )
    assert resp.status_code == 200
    found = {item["suggested_name"] for item in resp.json()}
    assert {"alpha", "beta"} <= found


def test_bulk_add(isolated_home, tmp_path):
    repo_dir = tmp_path / "ws" / "alpha"
    repo_dir.mkdir(parents=True)
    pygit2.init_repository(str(repo_dir), bare=False)

    c = _client(isolated_home)
    resp = c.post(
        "/api/projects/bulk-add",
        json={"items": [{"path": str(repo_dir), "name": "alpha"}]},
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_reports_endpoint_returns_stored_reports(isolated_home):
    from devscope.config import load_settings
    from devscope.storage.repositories import ReportRepo
    from devscope.storage.session import init_db, make_engine, session_factory

    s = load_settings()
    engine = make_engine(s.storage.db_path)
    init_db(engine)
    SessionLocal = session_factory(engine)
    now = datetime.now(UTC)
    with SessionLocal() as sess:
        ReportRepo(sess).save(
            project_id=None,
            type="standup",
            content="# Yesterday\n- shipped storage layer",
            period_start=now - timedelta(hours=24),
            period_end=now,
            llm_call_id=None,
            generated_at=now,
        )
        sess.commit()

    c = _client(isolated_home)
    resp = c.get("/api/reports")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert "shipped storage layer" in items[0]["content"]


def test_settings_get_and_save_openai_key(isolated_home, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    c = _client(isolated_home)
    resp = c.get("/api/settings")
    assert resp.status_code == 200
    assert resp.json()["openai_stored"] is False

    resp = c.post("/api/settings", json={"openai_api_key": "sk-abc1234567890"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["openai_stored"] is True
    assert body["openai_masked"].endswith("7890")
    env_file = isolated_home / ".env"
    assert "OPENAI_API_KEY=sk-abc1234567890" in env_file.read_text()


def test_settings_clear_openai(isolated_home, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    c = _client(isolated_home)
    c.post("/api/settings", json={"openai_api_key": "sk-abc"})
    resp = c.post("/api/settings", json={"clear_openai": True})
    assert resp.status_code == 200
    assert resp.json()["openai_stored"] is False


def test_settings_shows_env_var_active(isolated_home, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-from-env")
    c = _client(isolated_home)
    resp = c.get("/api/settings")
    assert resp.status_code == 200
    assert resp.json()["openai_env_active"] is True
