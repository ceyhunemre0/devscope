import pytest

from devscope.llm.base import (
    AllProvidersFailedError,
    LLMRequest,
    LLMResponse,
    ProviderError,
    RateLimitError,
)
from devscope.llm.budget import BudgetGuard
from devscope.llm.router import LLMRouter
from devscope.storage.repositories import LLMCallRepo


class FakeProvider:
    def __init__(
        self,
        name: str,
        *,
        raises: Exception | None = None,
        text: str = "ok",
        prompt_tokens: int = 5,
        output_tokens: int = 7,
        cost: float = 0.001,
    ) -> None:
        self.name = name
        self.raises = raises
        self.text = text
        self.prompt_tokens = prompt_tokens
        self.output_tokens = output_tokens
        self.cost = cost
        self.calls = 0

    async def complete(self, req: LLMRequest) -> LLMResponse:
        self.calls += 1
        if self.raises:
            raise self.raises
        return LLMResponse(
            text=self.text,
            prompt_tokens=self.prompt_tokens,
            output_tokens=self.output_tokens,
            cost_usd=self.cost,
        )


@pytest.mark.asyncio
async def test_router_uses_first_provider_when_ok(db_session, now):
    repo = LLMCallRepo(db_session)
    guard = BudgetGuard(repo=repo, monthly_usd=10.0, hard_stop=True)
    p1 = FakeProvider("p1")
    p2 = FakeProvider("p2")
    router = LLMRouter(chain=[p1, p2], guard=guard, repo=repo, model_for={"p1": "m1", "p2": "m2"})
    resp = await router.complete(prompt="hi", purpose="standup")
    assert resp.text == "ok"
    assert p1.calls == 1
    assert p2.calls == 0


@pytest.mark.asyncio
async def test_router_falls_through_to_next_on_provider_error(db_session, now):
    repo = LLMCallRepo(db_session)
    guard = BudgetGuard(repo=repo, monthly_usd=10.0, hard_stop=True)
    p1 = FakeProvider("p1", raises=ProviderError("nope"))
    p2 = FakeProvider("p2", text="second")
    router = LLMRouter(chain=[p1, p2], guard=guard, repo=repo, model_for={"p1": "m1", "p2": "m2"})
    resp = await router.complete(prompt="hi", purpose="standup")
    assert resp.text == "second"
    assert p1.calls == 1
    assert p2.calls == 1


@pytest.mark.asyncio
async def test_router_retries_on_rate_limit_then_falls_through(db_session, now):
    repo = LLMCallRepo(db_session)
    guard = BudgetGuard(repo=repo, monthly_usd=10.0, hard_stop=True)
    p1 = FakeProvider("p1", raises=RateLimitError("429"))
    p2 = FakeProvider("p2", text="second")
    router = LLMRouter(
        chain=[p1, p2],
        guard=guard,
        repo=repo,
        model_for={"p1": "m1", "p2": "m2"},
        max_retries_per_provider=3,
        retry_initial_seconds=0.0,
    )
    resp = await router.complete(prompt="hi", purpose="standup")
    assert resp.text == "second"
    assert p1.calls == 3
    assert p2.calls == 1


@pytest.mark.asyncio
async def test_router_records_llm_call(db_session, now):
    repo = LLMCallRepo(db_session)
    guard = BudgetGuard(repo=repo, monthly_usd=10.0, hard_stop=True)
    p1 = FakeProvider("p1")
    router = LLMRouter(chain=[p1], guard=guard, repo=repo, model_for={"p1": "m1"})
    await router.complete(prompt="hi", purpose="standup")
    db_session.commit()
    total = repo.sum_cost_since(now.replace(year=2000))
    assert total == pytest.approx(0.001)


@pytest.mark.asyncio
async def test_router_raises_when_all_providers_fail(db_session, now):
    repo = LLMCallRepo(db_session)
    guard = BudgetGuard(repo=repo, monthly_usd=10.0, hard_stop=True)
    p1 = FakeProvider("p1", raises=ProviderError("a"))
    p2 = FakeProvider("p2", raises=ProviderError("b"))
    router = LLMRouter(chain=[p1, p2], guard=guard, repo=repo, model_for={"p1": "m1", "p2": "m2"})
    with pytest.raises(AllProvidersFailedError):
        await router.complete(prompt="hi", purpose="standup")
