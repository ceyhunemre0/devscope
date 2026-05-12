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
from devscope.collectors.git_diff import (
    collect_working_tree_changes,
    recent_commit_examples,
    summarize_working_tree,
)
from devscope.config import load_settings
from devscope.generators.commit_message import CommitMessageGenerator
from devscope.github import client as gh_client
from devscope.github.clone import CloneError, clone_repo
from devscope.github.local_match import read_github_full_name
from devscope.llm.budget import BudgetGuard
from devscope.llm.router import LLMRouter
from devscope.secrets import (
    _load_file as _load_secrets_file,
)
from devscope.secrets import (
    delete_secret,
    get_secret,
    mask,
    set_secret,
)
from devscope.storage.models import Project
from devscope.storage.repositories import LLMCallRepo, ProjectRepo, ReportRepo
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
    github_full_name: str | None = None

    @field_validator("last_activity_at", mode="before")
    @classmethod
    def _aware_last_activity(cls, v: Any) -> Any:
        return _ensure_aware_utc(v) if isinstance(v, datetime) else v


def _project_to_out(project: Project) -> ProjectOut:
    """Convert a Project ORM row to ProjectOut, enriching with GitHub identity."""
    base = ProjectOut.model_validate(project, from_attributes=True)
    gh = read_github_full_name(Path(project.path))
    if gh:
        return base.model_copy(update={"github_full_name": gh})
    return base


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


class SuggestCommitIn(BaseModel):
    provider: str = Field(default="auto", pattern=r"^(auto|openai|ollama)$")


class SuggestCommitOut(BaseModel):
    has_changes: bool
    status: str
    message: str
    truncated: bool


class WorkingTreeStatusOut(BaseModel):
    has_changes: bool
    files_changed: int
    insertions: int
    deletions: int
    untracked_count: int


class GitHubStatusOut(BaseModel):
    configured: bool
    login: str | None = None
    avatar_url: str | None = None
    masked: str
    error: str | None = None


class GitHubTokenIn(BaseModel):
    token: str | None = None
    clear: bool = False


class GitHubRepoOut(BaseModel):
    full_name: str
    name: str
    description: str | None = None
    private: bool
    fork: bool
    archived: bool
    default_branch: str
    clone_url: str
    pushed_at: str | None = None
    stargazers_count: int
    language: str | None = None


class GitHubContribDayOut(BaseModel):
    date: str
    count: int
    color: str


class GitHubContributionsOut(BaseModel):
    login: str
    total: int
    commits: int
    issues: int
    pull_requests: int
    reviews: int
    days: list[GitHubContribDayOut]


class GitHubCloneIn(BaseModel):
    full_name: str
    clone_url: str
    parent_dir: str
    name: str | None = None


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
            return [_project_to_out(r) for r in rows]

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
            return _project_to_out(project)

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
                out.append(_project_to_out(project))
            s.commit()
        return out

    @app.get("/api/reports", response_model=list[ReportOut])
    def list_reports(limit: int = 50, project_id: int | None = None) -> list[ReportOut]:
        limit = max(1, min(limit, 200))
        with session() as s:
            repo = ReportRepo(s)
            if project_id is not None:
                rows = repo.list_by_type_and_project("standup", project_id)[:limit]
            else:
                rows = repo.list_by_type("standup")[:limit]
            return [ReportOut.model_validate(r, from_attributes=True) for r in rows]

    @app.get(
        "/api/projects/{project_id}/working-tree-status",
        response_model=WorkingTreeStatusOut,
    )
    def working_tree_status(project_id: int) -> WorkingTreeStatusOut:
        with session() as s:
            project = s.get(Project, project_id)
            if project is None:
                raise HTTPException(404, f"project {project_id} not found")
            summary = summarize_working_tree(Path(project.path))
        return WorkingTreeStatusOut(
            has_changes=summary.has_changes,
            files_changed=summary.files_changed,
            insertions=summary.insertions,
            deletions=summary.deletions,
            untracked_count=summary.untracked_count,
        )

    @app.post(
        "/api/projects/{project_id}/suggest-commit",
        response_model=SuggestCommitOut,
    )
    async def suggest_commit(project_id: int, body: SuggestCommitIn) -> SuggestCommitOut:
        with session() as s:
            project = s.get(Project, project_id)
            if project is None:
                raise HTTPException(404, f"project {project_id} not found")
            repo_path = Path(project.path)

        changes = collect_working_tree_changes(repo_path)
        if changes.is_empty:
            return SuggestCommitOut(
                has_changes=False, status="", message="", truncated=False
            )

        try:
            chain, model_for = _build_chain(body.provider, settings)
        except Exception as exc:
            raise HTTPException(400, str(exc)) from exc

        with session() as s:
            llm_repo = LLMCallRepo(s)
            guard = BudgetGuard(
                repo=llm_repo,
                monthly_usd=settings.llm.budget.monthly_usd,
                hard_stop=settings.llm.budget.hard_stop,
            )
            router = LLMRouter(
                chain=chain, guard=guard, repo=llm_repo, model_for=model_for
            )
            generator = CommitMessageGenerator(router=router)
            examples = recent_commit_examples(repo_path, n=8)
            try:
                output = await generator.run(changes, examples=examples)
            except Exception as exc:
                raise HTTPException(502, f"LLM error: {exc}") from exc
            s.commit()

        return SuggestCommitOut(
            has_changes=True,
            status=changes.status,
            message=output.content,
            truncated=changes.truncated,
        )

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

    # ---------- GitHub ----------

    @app.get("/api/github/status", response_model=GitHubStatusOut)
    async def github_status() -> GitHubStatusOut:
        token = get_secret("GITHUB_PAT")
        if not token:
            return GitHubStatusOut(configured=False, masked=mask(None))
        try:
            user = await gh_client.whoami(token)
        except gh_client.GitHubError as exc:
            return GitHubStatusOut(
                configured=True, masked=mask(token), error=str(exc)
            )
        except Exception as exc:  # belt-and-suspenders for raw transport errors
            return GitHubStatusOut(
                configured=True,
                masked=mask(token),
                error=f"unexpected error: {exc.__class__.__name__}",
            )
        return GitHubStatusOut(
            configured=True,
            login=user.login,
            avatar_url=user.avatar_url,
            masked=mask(token),
        )

    @app.post("/api/github/token", response_model=GitHubStatusOut)
    async def github_save_token(body: GitHubTokenIn) -> GitHubStatusOut:
        if body.clear:
            delete_secret("GITHUB_PAT")
            return await github_status()
        if not body.token or not body.token.strip():
            raise HTTPException(400, "token must not be empty")
        token = body.token.strip()
        try:
            await gh_client.whoami(token)
        except gh_client.GitHubError as exc:
            raise HTTPException(400, f"token rejected by GitHub: {exc}") from exc
        set_secret("GITHUB_PAT", token)
        return await github_status()

    @app.get("/api/github/repos", response_model=list[GitHubRepoOut])
    async def github_repos() -> list[GitHubRepoOut]:
        token = get_secret("GITHUB_PAT")
        if not token:
            raise HTTPException(400, "GitHub token not configured")
        try:
            repos = await gh_client.list_repos(token)
        except gh_client.GitHubError as exc:
            raise HTTPException(502, str(exc)) from exc
        return [GitHubRepoOut(**r.__dict__) for r in repos]

    @app.get(
        "/api/github/contributions", response_model=GitHubContributionsOut
    )
    async def github_contributions(days: int = 365) -> GitHubContributionsOut:
        token = get_secret("GITHUB_PAT")
        if not token:
            raise HTTPException(400, "GitHub token not configured")
        days = max(7, min(days, 365))
        try:
            c = await gh_client.contributions(token, days=days)
        except gh_client.GitHubError as exc:
            raise HTTPException(502, str(exc)) from exc
        return GitHubContributionsOut(
            login=c.login,
            total=c.total,
            commits=c.commits,
            issues=c.issues,
            pull_requests=c.pull_requests,
            reviews=c.reviews,
            days=[GitHubContribDayOut(date=d.date, count=d.count, color=d.color) for d in c.days],
        )

    @app.post(
        "/api/github/clone", response_model=ProjectOut, status_code=201
    )
    async def github_clone(body: GitHubCloneIn) -> ProjectOut:
        token = get_secret("GITHUB_PAT")
        if not token:
            raise HTTPException(400, "GitHub token not configured")
        parent = Path(body.parent_dir).expanduser().resolve()
        if not parent.exists() or not parent.is_dir():
            raise HTTPException(400, f"parent_dir does not exist: {parent}")
        repo_dir_name = (body.name or body.full_name.split("/")[-1]).strip()
        if not repo_dir_name:
            raise HTTPException(400, "could not derive a directory name")
        target = parent / repo_dir_name
        try:
            clone_repo(token=token, clone_url=body.clone_url, target_path=target)
        except CloneError as exc:
            raise HTTPException(400, f"clone failed: {exc}") from exc

        project_name = repo_dir_name
        with session() as s:
            repo = ProjectRepo(s)
            if repo.get_by_name(project_name) is not None:
                # Fall back to full_name if the bare repo name collides.
                project_name = body.full_name.replace("/", "-")
                if repo.get_by_name(project_name) is not None:
                    raise HTTPException(409, f"project named '{project_name}' already exists")
            project = repo.create(name=project_name, path=str(target))
            s.commit()
            return _project_to_out(project)

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
