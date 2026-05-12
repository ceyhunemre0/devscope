"""JSON API for the devscope web/desktop frontend.

The Python backend exposes only JSON endpoints under ``/api/*``. The frontend
(React + Vite, see ``frontend/``) is a separate SPA that is either:
- served by Vite dev server during development, proxying ``/api`` here, or
- bundled into ``frontend/dist`` and served as static files from this app.

Eventually wrapped by Tauri as a desktop application.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from devscope import __version__
from devscope.cli.main import _build_chain, _today_impl
from devscope.config import load_settings
from devscope.secrets import (
    _load_file as _load_secrets_file,
)
from devscope.secrets import (
    delete_secret,
    get_secret,
    mask,
    set_secret,
)
from devscope.storage.repositories import ProjectRepo, ReportRepo
from devscope.storage.session import init_db, make_engine, session_factory

_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent.parent / "frontend" / "dist"


def _ensure_aware_utc(value: datetime | None) -> datetime | None:
    """Stamp naive datetimes (legacy SQLite rows) as UTC so JSON ISO output carries an offset."""
    if isinstance(value, datetime) and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


# ---------- Pydantic response/request models ----------


class ProjectOut(BaseModel):
    id: int
    name: str
    path: str
    state: str
    summary: str | None = None
    tech_stack: list[str] | None = None
    last_activity_at: datetime | None = None

    @field_validator("last_activity_at", mode="before")
    @classmethod
    def _aware_last_activity(cls, v: Any) -> Any:
        return _ensure_aware_utc(v) if isinstance(v, datetime) else v


class ReportOut(BaseModel):
    id: int
    project_id: int | None = None
    type: str
    content: str
    period_start: datetime | None = None
    period_end: datetime | None = None
    generated_at: datetime

    @field_validator("period_start", "period_end", "generated_at", mode="before")
    @classmethod
    def _aware_dates(cls, v: Any) -> Any:
        return _ensure_aware_utc(v) if isinstance(v, datetime) else v


class DashboardOut(BaseModel):
    project_count: int
    report_count: int
    latest: ReportOut | None = None
    openai_stored: bool
    openai_env_active: bool
    ollama_default_model: str
    openai_default_model: str


class AddProjectIn(BaseModel):
    path: str
    name: str = Field(min_length=1, max_length=64)


class DiscoverIn(BaseModel):
    root: str
    depth: int = Field(default=3, ge=1, le=6)


class DiscoveredRepo(BaseModel):
    path: str
    suggested_name: str


class BulkAddIn(BaseModel):
    items: list[AddProjectIn]


class RunTodayIn(BaseModel):
    since_hours: int = Field(default=24, ge=1, le=720)
    provider: str = Field(default="auto", pattern=r"^(auto|openai|ollama)$")
    project: str | None = None


class SettingsOut(BaseModel):
    secrets_path: str
    openai_env_active: bool
    openai_stored: bool
    openai_masked: str


class SettingsIn(BaseModel):
    openai_api_key: str | None = None
    clear_openai: bool = False


# ---------- App factory ----------


def create_app() -> FastAPI:
    settings = load_settings()
    engine = make_engine(settings.storage.db_path)
    init_db(engine)
    SessionLocal = session_factory(engine)

    app = FastAPI(
        title="devscope",
        version=__version__,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )

    # Permissive CORS in dev so Vite (port 5173) can hit FastAPI (port 8765).
    # Tauri/production serve the SPA from the same origin and CORS is moot.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def session() -> Session:
        return SessionLocal()

    # ---------- routes ----------

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        return {"ok": True, "version": __version__}

    @app.get("/api/dashboard", response_model=DashboardOut)
    def dashboard() -> DashboardOut:
        with session() as s:
            projects = ProjectRepo(s).list_active()
            reports = ReportRepo(s).list_by_type("standup")
            latest = reports[0] if reports else None
        file_keys = _load_secrets_file()
        return DashboardOut(
            project_count=len(projects),
            report_count=len(reports),
            latest=ReportOut.model_validate(latest, from_attributes=True) if latest else None,
            openai_stored="OPENAI_API_KEY" in file_keys,
            openai_env_active=bool(os.environ.get("OPENAI_API_KEY")),
            ollama_default_model=settings.llm.default_model.ollama,
            openai_default_model=settings.llm.default_model.openai,
        )

    @app.get("/api/projects", response_model=list[ProjectOut])
    def list_projects() -> list[ProjectOut]:
        with session() as s:
            rows = ProjectRepo(s).list_active()
            return [ProjectOut.model_validate(r, from_attributes=True) for r in rows]

    @app.post("/api/projects", response_model=ProjectOut, status_code=201)
    def add_project(body: AddProjectIn) -> ProjectOut:
        repo_path = Path(body.path).expanduser().resolve()
        if not repo_path.exists() or not repo_path.is_dir():
            raise HTTPException(400, f"path does not exist or is not a directory: {repo_path}")
        if not (repo_path / ".git").exists():
            raise HTTPException(400, f"{repo_path} is not a git repository")

        with session() as s:
            repo = ProjectRepo(s)
            if repo.get_by_name(body.name) is not None:
                raise HTTPException(409, f"project named '{body.name}' already exists")
            project = repo.create(name=body.name, path=str(repo_path))
            s.commit()
            return ProjectOut.model_validate(project, from_attributes=True)

    @app.post("/api/projects/discover", response_model=list[DiscoveredRepo])
    def discover(body: DiscoverIn) -> list[DiscoveredRepo]:
        root = Path(body.root).expanduser().resolve()
        if not root.exists() or not root.is_dir():
            raise HTTPException(400, f"root not found: {root}")

        results: list[DiscoveredRepo] = []
        for git_dir in _walk_for_git(root, max_depth=body.depth):
            repo_dir = git_dir.parent
            results.append(DiscoveredRepo(path=str(repo_dir), suggested_name=repo_dir.name))
        results.sort(key=lambda r: r.path)
        return results

    @app.post("/api/projects/bulk-add", response_model=list[ProjectOut])
    def bulk_add(body: BulkAddIn) -> list[ProjectOut]:
        out: list[ProjectOut] = []
        with session() as s:
            repo = ProjectRepo(s)
            for item in body.items:
                p = Path(item.path).expanduser().resolve()
                if not (p / ".git").exists():
                    continue
                if repo.get_by_name(item.name) is not None:
                    continue
                project = repo.create(name=item.name, path=str(p))
                out.append(ProjectOut.model_validate(project, from_attributes=True))
            s.commit()
        return out

    @app.get("/api/reports", response_model=list[ReportOut])
    def list_reports(limit: int = 50) -> list[ReportOut]:
        limit = max(1, min(limit, 200))
        with session() as s:
            rows = ReportRepo(s).list_by_type("standup")[:limit]
            return [ReportOut.model_validate(r, from_attributes=True) for r in rows]

    @app.post("/api/actions/run-today", response_model=ReportOut)
    async def run_today(body: RunTodayIn) -> ReportOut:
        try:
            _build_chain(body.provider, settings)
        except Exception as exc:  # typer.BadParameter or similar
            raise HTTPException(400, str(exc)) from exc

        try:
            await _today_impl(body.since_hours, body.provider, body.project)
        except Exception as exc:  # typer.BadParameter for unknown project
            raise HTTPException(400, str(exc)) from exc

        with session() as s:
            reports = ReportRepo(s).list_by_type("standup")
            latest = reports[0] if reports else None
        if latest is None:
            raise HTTPException(500, "report generation produced no output")
        return ReportOut.model_validate(latest, from_attributes=True)

    @app.get("/api/settings", response_model=SettingsOut)
    def get_settings_view() -> SettingsOut:
        file_keys = _load_secrets_file()
        stored = get_secret("OPENAI_API_KEY")
        return SettingsOut(
            secrets_path=str(settings.storage.home / ".env"),
            openai_env_active=bool(os.environ.get("OPENAI_API_KEY")),
            openai_stored="OPENAI_API_KEY" in file_keys,
            openai_masked=mask(stored),
        )

    @app.post("/api/settings", response_model=SettingsOut)
    def save_settings(body: SettingsIn) -> SettingsOut:
        if body.clear_openai:
            delete_secret("OPENAI_API_KEY")
        elif body.openai_api_key:
            key = body.openai_api_key.strip()
            if key:
                set_secret("OPENAI_API_KEY", key)
        return get_settings_view()

    # ---------- SPA static mount (if frontend has been built) ----------

    if _FRONTEND_DIST.exists() and (_FRONTEND_DIST / "index.html").exists():
        # Serve hashed assets verbatim
        app.mount("/assets", StaticFiles(directory=_FRONTEND_DIST / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa_fallback(full_path: str) -> FileResponse:
            # Anything that isn't /api/* falls back to the SPA shell
            return FileResponse(_FRONTEND_DIST / "index.html")

    return app


# ---------- helpers ----------


def _walk_for_git(root: Path, max_depth: int) -> list[Path]:
    """Find .git directories under ``root`` up to ``max_depth`` levels."""
    found: list[Path] = []
    skip = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build"}

    def walk(current: Path, depth: int) -> None:
        if depth > max_depth:
            return
        try:
            entries = list(current.iterdir())
        except (PermissionError, FileNotFoundError):
            return
        if any(e.name == ".git" for e in entries):
            found.append(current / ".git")
            return  # don't recurse into a repo
        for entry in entries:
            if entry.is_dir() and entry.name not in skip and not entry.is_symlink():
                walk(entry, depth + 1)

    walk(root, 0)
    return found


app = create_app()
