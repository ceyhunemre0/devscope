from datetime import timedelta

from devscope.storage.repositories import (
    EventRepo,
    LLMCallRepo,
    ProjectRepo,
    ReportRepo,
)


def test_project_repo_create_and_get_by_name(db_session, now):
    repo = ProjectRepo(db_session)
    p = repo.create(name="x", path="/tmp/x")
    db_session.commit()
    fetched = repo.get_by_name("x")
    assert fetched is not None
    assert fetched.id == p.id


def test_project_repo_list_active(db_session, now):
    repo = ProjectRepo(db_session)
    repo.create(name="a", path="/tmp/a")
    p = repo.create(name="b", path="/tmp/b")
    p.state = "archived"
    db_session.commit()
    active = repo.list_active()
    assert [p.name for p in active] == ["a"]


def test_event_repo_dedupes_by_source_external_id(db_session, now):
    proj_repo = ProjectRepo(db_session)
    project = proj_repo.create(name="x", path="/tmp/x")
    db_session.commit()

    event_repo = EventRepo(db_session)
    e1 = event_repo.upsert(
        project_id=project.id,
        source="git_local",
        type="commit",
        external_id="abc",
        payload={"msg": "first"},
        occurred_at=now,
    )
    e2 = event_repo.upsert(
        project_id=project.id,
        source="git_local",
        type="commit",
        external_id="abc",
        payload={"msg": "ignored"},
        occurred_at=now,
    )
    db_session.commit()
    assert e1.id == e2.id
    assert (
        event_repo.list_since(project_id=project.id, since=now - timedelta(hours=1))[0].payload[
            "msg"
        ]
        == "first"
    )


def test_llm_call_repo_records_and_sums_costs(db_session, now):
    repo = LLMCallRepo(db_session)
    repo.record(
        provider="ollama",
        model="llama3.1:8b",
        purpose="standup",
        prompt_tokens=10,
        output_tokens=20,
        cost_usd=0.001,
        duration_ms=100,
        succeeded=True,
        error=None,
        called_at=now,
    )
    repo.record(
        provider="ollama",
        model="llama3.1:8b",
        purpose="standup",
        prompt_tokens=10,
        output_tokens=20,
        cost_usd=0.002,
        duration_ms=100,
        succeeded=True,
        error=None,
        called_at=now,
    )
    db_session.commit()
    total = repo.sum_cost_since(now - timedelta(days=1))
    assert total == 0.003


def test_report_repo_saves_and_lists(db_session, now):
    repo = ReportRepo(db_session)
    r = repo.save(
        project_id=None,
        type="standup",
        content="# hi",
        period_start=now - timedelta(days=1),
        period_end=now,
        llm_call_id=None,
        generated_at=now,
    )
    db_session.commit()
    rows = repo.list_by_type("standup")
    assert len(rows) == 1
    assert rows[0].id == r.id
