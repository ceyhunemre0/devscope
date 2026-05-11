from datetime import datetime, timedelta, timezone

import pytest

from devscope.collectors.base import Event
from devscope.generators.standup import StandupGenerator
from devscope.llm.base import LLMResponse


class StubRouter:
    def __init__(self, text: str = "## Today\n- shipped X") -> None:
        self.text = text
        self.last_prompt: str | None = None

    async def complete(self, *, prompt: str, purpose: str, max_tokens: int = 1500,
                       temperature: float = 0.2) -> LLMResponse:
        self.last_prompt = prompt
        assert purpose == "standup"
        return LLMResponse(text=self.text, prompt_tokens=10,
                           output_tokens=20, cost_usd=0.0)


@pytest.mark.asyncio
async def test_standup_short_circuits_when_no_events():
    router = StubRouter()
    gen = StandupGenerator(router=router)
    now = datetime.now(timezone.utc)
    out = await gen.run(events_by_project={}, since=now - timedelta(days=1), until=now)
    assert "no activity" in out.content.lower()
    assert router.last_prompt is None


@pytest.mark.asyncio
async def test_standup_calls_router_and_includes_event_messages():
    router = StubRouter(text="# Standup\n- did stuff")
    gen = StandupGenerator(router=router)
    now = datetime.now(timezone.utc)
    events = [
        Event(source="git_local", type="commit", external_id="a" * 40,
              payload={"message_summary": "feat: A", "author_name": "x",
                       "files_changed": ["a.py"]}, occurred_at=now),
        Event(source="git_local", type="commit", external_id="b" * 40,
              payload={"message_summary": "fix: B", "author_name": "x",
                       "files_changed": ["b.py"]}, occurred_at=now),
    ]
    out = await gen.run(events_by_project={"my-saas": events},
                        since=now - timedelta(hours=24), until=now)
    assert out.content.startswith("# Standup")
    assert "feat: A" in router.last_prompt
    assert "fix: B" in router.last_prompt
    assert "my-saas" in router.last_prompt
