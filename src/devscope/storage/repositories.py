from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from devscope.storage.models import Event, LLMCall, Project, Report


class ProjectRepo:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, name: str, path: str) -> Project:
        now = datetime.now(UTC)
        p = Project(name=name, path=path, state="active", created_at=now, updated_at=now)
        self.session.add(p)
        self.session.flush()
        return p

    def get_by_name(self, name: str) -> Project | None:
        return self.session.scalar(select(Project).where(Project.name == name))

    def list_active(self) -> list[Project]:
        stmt = select(Project).where(Project.state == "active").order_by(Project.name)
        return list(self.session.scalars(stmt))


class EventRepo:
    def __init__(self, session: Session) -> None:
        self.session = session

    def upsert(
        self,
        *,
        project_id: int,
        source: str,
        type: str,
        external_id: str | None,
        payload: dict[str, Any],
        occurred_at: datetime,
    ) -> Event:
        existing = None
        if external_id is not None:
            existing = self.session.scalar(
                select(Event).where(Event.source == source, Event.external_id == external_id)
            )
        if existing is not None:
            return existing
        ev = Event(
            project_id=project_id,
            source=source,
            type=type,
            external_id=external_id,
            payload=payload,
            occurred_at=occurred_at,
            collected_at=datetime.now(UTC),
        )
        self.session.add(ev)
        self.session.flush()
        return ev

    def list_since(self, *, project_id: int, since: datetime) -> list[Event]:
        stmt = (
            select(Event)
            .where(Event.project_id == project_id, Event.occurred_at >= since)
            .order_by(Event.occurred_at.desc())
        )
        return list(self.session.scalars(stmt))


class LLMCallRepo:
    def __init__(self, session: Session) -> None:
        self.session = session

    def record(
        self,
        *,
        provider: str,
        model: str,
        purpose: str,
        prompt_tokens: int | None,
        output_tokens: int | None,
        cost_usd: float | None,
        duration_ms: int | None,
        succeeded: bool,
        error: str | None,
        called_at: datetime,
    ) -> LLMCall:
        row = LLMCall(
            provider=provider,
            model=model,
            purpose=purpose,
            prompt_tokens=prompt_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
            duration_ms=duration_ms,
            succeeded=succeeded,
            error=error,
            called_at=called_at,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def sum_cost_since(self, since: datetime) -> float:
        stmt = select(func.coalesce(func.sum(LLMCall.cost_usd), 0.0)).where(
            LLMCall.called_at >= since, LLMCall.succeeded.is_(True)
        )
        return float(self.session.scalar(stmt) or 0.0)


class ReportRepo:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save(
        self,
        *,
        project_id: int | None,
        type: str,
        content: str,
        period_start: datetime | None,
        period_end: datetime | None,
        llm_call_id: int | None,
        generated_at: datetime,
    ) -> Report:
        r = Report(
            project_id=project_id,
            type=type,
            content=content,
            period_start=period_start,
            period_end=period_end,
            llm_call_id=llm_call_id,
            generated_at=generated_at,
        )
        self.session.add(r)
        self.session.flush()
        return r

    def list_by_type(self, type: str) -> list[Report]:
        stmt = select(Report).where(Report.type == type).order_by(Report.generated_at.desc())
        return list(self.session.scalars(stmt))
