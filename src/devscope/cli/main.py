from __future__ import annotations

from pathlib import Path

import pygit2
import typer
from rich.console import Console
from rich.table import Table

from devscope.config import load_settings
from devscope.storage.repositories import ProjectRepo
from devscope.storage.session import init_db, make_engine, session_factory

app = typer.Typer(no_args_is_help=True, help="devscope — AI-powered dev productivity engine.")
projects_app = typer.Typer(no_args_is_help=True, help="Manage tracked projects.")
app.add_typer(projects_app, name="projects")

console = Console()


def _engine_session_factory():
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
    path: Path = typer.Argument(..., exists=True, file_okay=False, dir_okay=True,
                                resolve_path=True),
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
        table.add_row(p.name, p.path,
                      p.last_activity_at.isoformat() if p.last_activity_at else "—")
    console.print(table)
