from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from devscope.cli.main import _build_chain, _today_impl
from devscope.config import Settings, load_settings
from devscope.storage.repositories import ProjectRepo, ReportRepo
from devscope.storage.session import init_db, make_engine, session_factory

_TEMPLATES_DIR = Path(__file__).parent / "templates"


def create_app() -> FastAPI:
    settings = load_settings()
    engine = make_engine(settings.storage.db_path)
    init_db(engine)
    SessionLocal = session_factory(engine)
    templates = Jinja2Templates(directory=str(_TEMPLATES_DIR))

    app = FastAPI(title="devscope", docs_url=None, redoc_url=None)

    def get_session() -> Session:
        return SessionLocal()

    def get_settings() -> Settings:
        return settings

    @app.get("/", response_class=HTMLResponse)
    def dashboard(request: Request) -> HTMLResponse:
        with get_session() as session:
            projects = ProjectRepo(session).list_active()
            reports = ReportRepo(session).list_by_type("standup")
            latest = reports[0] if reports else None
        return templates.TemplateResponse(
            request,
            "dashboard.html",
            {
                "project_count": len(projects),
                "report_count": len(reports),
                "latest": latest,
                "default_since_hours": 24,
            },
        )

    @app.get("/projects", response_class=HTMLResponse)
    def projects_view(request: Request) -> HTMLResponse:
        with get_session() as session:
            projects = ProjectRepo(session).list_active()
        return templates.TemplateResponse(request, "projects.html", {"projects": projects})

    @app.get("/reports", response_class=HTMLResponse)
    def reports_view(request: Request) -> HTMLResponse:
        with get_session() as session:
            reports = ReportRepo(session).list_by_type("standup")
        return templates.TemplateResponse(request, "reports.html", {"reports": reports})

    @app.post("/actions/run-today", response_class=HTMLResponse)
    async def run_today(
        request: Request,
        since_hours: Annotated[int, Form()] = 24,
        since_hours_override: Annotated[str, Form()] = "",
        provider: Annotated[str, Form()] = "auto",
        s: Settings = Depends(get_settings),
    ) -> HTMLResponse:
        # Validate provider choice cheaply
        try:
            _build_chain(provider, s)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        try:
            hours = int(since_hours_override) if since_hours_override else since_hours
        except ValueError:
            hours = since_hours
        hours = max(1, min(hours, 720))

        await _today_impl(hours, provider)

        with get_session() as session:
            reports = ReportRepo(session).list_by_type("standup")
            latest = reports[0] if reports else None
        return templates.TemplateResponse(request, "_latest_report.html", {"latest": latest})

    return app


app = create_app()
