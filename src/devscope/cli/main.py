from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pygit2
import typer
from rich.console import Console
from rich.markdown import Markdown
from rich.table import Table
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from devscope.collectors.base import Event
from devscope.collectors.git_local import GitLocalCollector
from devscope.config import Settings, load_settings
from devscope.generators.standup import StandupGenerator
from devscope.llm.base import LLMProvider
from devscope.llm.budget import BudgetGuard
from devscope.llm.providers.ollama import OllamaProvider
from devscope.llm.providers.openai import OpenAIProvider
from devscope.llm.router import LLMRouter
from devscope.secrets import has_secret
from devscope.storage.repositories import (
    EventRepo,
    LLMCallRepo,
    ProjectRepo,
    ReportRepo,
)
from devscope.storage.session import init_db, make_engine, session_factory

app = typer.Typer(no_args_is_help=True, help="devscope — AI-powered dev productivity engine.")
projects_app = typer.Typer(no_args_is_help=True, help="Manage tracked projects.")
app.add_typer(projects_app, name="projects")

console = Console()


def _engine_session_factory() -> tuple[Engine, sessionmaker[Session], Settings]:
    settings = load_settings()
    engine = make_engine(settings.storage.db_path)
    return engine, session_factory(engine), settings


@app.command()
def init() -> None:
    """Create DEVSCOPE_HOME, database, and default config."""
    engine, _, settings = _engine_session_factory()
    init_db(engine)
    console.print(
        f"[green]devscope initialized.[/green]\n"
        f"  home: {settings.storage.home}\n"
        f"  db:   {settings.storage.db_path}"
    )


@projects_app.command("add")
def projects_add(
    path: Path = typer.Argument(
        ..., exists=True, file_okay=False, dir_okay=True, resolve_path=True
    ),
    name: str = typer.Option(..., "--name", "-n", help="Friendly name for the project."),
) -> None:
    """Register a local git repository as a tracked project."""
    if not (path / ".git").exists():
        console.print(f"[red]error:[/red] {path} is not a git repository.")
        raise typer.Exit(code=2)

    try:
        pygit2.Repository(str(path))
    except pygit2.GitError as exc:
        console.print(f"[red]error:[/red] invalid git repo: {exc}")
        raise typer.Exit(code=2) from exc

    _, SessionLocal, _ = _engine_session_factory()
    with SessionLocal() as session:
        repo = ProjectRepo(session)
        existing = repo.get_by_name(name)
        if existing is not None:
            console.print(f"[yellow]'{name}' already registered ({existing.path}).[/yellow]")
            raise typer.Exit(code=1)
        repo.create(name=name, path=str(path))
        session.commit()
    console.print(f"[green]added project '{name}' -> {path}[/green]")


@projects_app.command("list")
def projects_list() -> None:
    """List tracked projects."""
    _, SessionLocal, _ = _engine_session_factory()
    with SessionLocal() as session:
        repos = ProjectRepo(session).list_active()
    table = Table("name", "path", "last activity")
    for p in repos:
        table.add_row(p.name, p.path, p.last_activity_at.isoformat() if p.last_activity_at else "—")
    console.print(table)


@app.command()
def serve(
    host: str = typer.Option("", "--host", help="Override bind host (default from config)."),
    port: int = typer.Option(0, "--port", help="Override bind port (default from config)."),
    reload: bool = typer.Option(False, "--reload", help="Auto-reload on code changes (dev)."),
) -> None:
    """Run the web dashboard."""
    import uvicorn

    settings = load_settings()
    uvicorn.run(
        "devscope.web.app:app",
        host=host or settings.web.host,
        port=port or settings.web.port,
        reload=reload,
    )


@app.command()
def today(
    since_hours: int = typer.Option(24, "--since-hours", "-s", help="Window size in hours."),
    provider: str = typer.Option(
        "auto",
        "--provider",
        "-p",
        help="LLM provider: auto | openai | ollama. 'auto' uses OpenAI if "
        "OPENAI_API_KEY is set, else Ollama.",
    ),
    project_name: str | None = typer.Option(
        None,
        "--project",
        "-P",
        help="Scope to a single project by name. Defaults to all active projects.",
    ),
) -> None:
    """Generate a standup summary from the last N hours of activity across all projects."""
    asyncio.run(_today_impl(since_hours, provider, project_name))


def _build_chain(
    provider_choice: str, settings: Settings
) -> tuple[list[LLMProvider], dict[str, str]]:
    has_openai = has_secret("OPENAI_API_KEY")
    if provider_choice == "auto":
        provider_choice = "openai" if has_openai else "ollama"

    if provider_choice == "openai":
        if not has_openai:
            raise typer.BadParameter(
                "--provider openai requires an OpenAI key. "
                "Set OPENAI_API_KEY env var or save it via the web UI (/settings)."
            )
        return [OpenAIProvider()], {"openai": settings.llm.default_model.openai}
    if provider_choice == "ollama":
        return [OllamaProvider()], {"ollama": settings.llm.default_model.ollama}
    raise typer.BadParameter(f"Unknown provider: {provider_choice}")


async def _today_impl(
    since_hours: int,
    provider_choice: str = "auto",
    project_name: str | None = None,
) -> None:
    settings = load_settings()
    engine = make_engine(settings.storage.db_path)
    SessionLocal = session_factory(engine)

    now = datetime.now(UTC)
    since = now - timedelta(hours=since_hours)

    events_by_project: dict[str, list[Event]] = {}
    scoped_project_id: int | None = None

    with SessionLocal() as session:
        project_repo = ProjectRepo(session)
        if project_name is not None:
            matched = project_repo.get_by_name(project_name)
            if matched is None:
                raise typer.BadParameter(f"unknown project: {project_name}")
            projects = [matched]
            scoped_project_id = matched.id
        else:
            projects = project_repo.list_active()

        event_repo = EventRepo(session)
        for project in projects:
            repo_path = Path(project.path)
            if not (repo_path / ".git").exists():
                continue
            collector = GitLocalCollector(repo_path)
            collected = collector.fetch(since=since)
            for ev in collected:
                event_repo.upsert(
                    project_id=project.id,
                    source=ev.source,
                    type=ev.type,
                    external_id=ev.external_id,
                    payload=ev.payload,
                    occurred_at=ev.occurred_at,
                )
            if collected:
                events_by_project[project.name] = collected
        session.commit()

        llm_repo = LLMCallRepo(session)
        guard = BudgetGuard(
            repo=llm_repo,
            monthly_usd=settings.llm.budget.monthly_usd,
            hard_stop=settings.llm.budget.hard_stop,
        )
        chain, model_for = _build_chain(provider_choice, settings)
        router = LLMRouter(
            chain=chain,
            guard=guard,
            repo=llm_repo,
            model_for=model_for,
        )
        generator = StandupGenerator(router=router)
        output = await generator.run(
            events_by_project=events_by_project,
            since=since,
            until=now,
        )

        ReportRepo(session).save(
            project_id=scoped_project_id,
            type="standup",
            content=output.content,
            period_start=since,
            period_end=now,
            llm_call_id=None,
            generated_at=now,
        )
        session.commit()

    console.print(Markdown(output.content))
