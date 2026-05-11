from datetime import UTC, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from devscope.storage.models import Base, Event, Idea, LLMCall, Project, Report


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    return Session(engine, future=True)


def test_project_round_trip():
    s = _session()
    p = Project(
        name="my-saas",
        path="/tmp/my-saas",
        summary="A TR SaaS bootstrap project.",
        tech_stack=["python", "fastapi"],
        state="active",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    s.add(p)
    s.commit()
    loaded = s.query(Project).filter_by(name="my-saas").one()
    assert loaded.tech_stack == ["python", "fastapi"]
    assert loaded.state == "active"


def test_event_unique_external_id_per_source():
    import pytest
    from sqlalchemy.exc import IntegrityError

    s = _session()
    s.add(
        Project(
            name="p",
            path="/tmp/p",
            state="active",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
    )
    s.commit()
    pid = s.query(Project).one().id
    now = datetime.now(UTC)
    s.add(
        Event(
            project_id=pid,
            source="git_local",
            type="commit",
            external_id="abc123",
            payload={"msg": "x"},
            occurred_at=now,
            collected_at=now,
        )
    )
    s.commit()
    s.add(
        Event(
            project_id=pid,
            source="git_local",
            type="commit",
            external_id="abc123",
            payload={"msg": "y"},
            occurred_at=now,
            collected_at=now,
        )
    )
    with pytest.raises(IntegrityError):
        s.commit()


def test_llm_call_records_token_usage():
    s = _session()
    now = datetime.now(UTC)
    s.add(
        LLMCall(
            provider="ollama",
            model="llama3.1:8b",
            purpose="standup",
            prompt_tokens=120,
            output_tokens=80,
            cost_usd=0.0,
            duration_ms=500,
            succeeded=True,
            called_at=now,
        )
    )
    s.commit()
    row = s.query(LLMCall).one()
    assert row.prompt_tokens == 120
    assert row.cost_usd == 0.0


def test_idea_default_state_is_suggested():
    s = _session()
    s.add(
        Project(
            name="p",
            path="/tmp/p",
            state="active",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
    )
    s.commit()
    pid = s.query(Project).one().id
    s.add(
        Idea(
            project_id=pid,
            category="feature",
            title="t",
            description="d",
            created_at=datetime.now(UTC),
        )
    )
    s.commit()
    assert s.query(Idea).one().state == "suggested"


def test_report_can_be_cross_project():
    s = _session()
    now = datetime.now(UTC)
    s.add(Report(project_id=None, type="standup", content="# day", generated_at=now))
    s.commit()
    assert s.query(Report).one().project_id is None
