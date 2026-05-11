import httpx
import pytest

from devscope.llm.base import LLMRequest, ProviderError, RateLimitError
from devscope.llm.providers.openai import OpenAIProvider


@pytest.mark.asyncio
async def test_openai_complete_returns_text_and_cost():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer sk-test"
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "hi there"}}],
                "usage": {"prompt_tokens": 100, "completion_tokens": 50},
            },
        )

    transport = httpx.MockTransport(handler)
    provider = OpenAIProvider(api_key="sk-test", transport=transport)
    resp = await provider.complete(LLMRequest(prompt="hi", model="gpt-4o-mini", purpose="standup"))
    assert resp.text == "hi there"
    assert resp.prompt_tokens == 100
    assert resp.output_tokens == 50
    # 100 * 0.15 + 50 * 0.60 = 15 + 30 = 45 per 1M
    assert resp.cost_usd == pytest.approx(45 / 1_000_000)


@pytest.mark.asyncio
async def test_openai_missing_key_raises():
    transport = httpx.MockTransport(lambda _: httpx.Response(200, json={}))
    provider = OpenAIProvider(api_key="", transport=transport)
    with pytest.raises(ProviderError):
        await provider.complete(LLMRequest(prompt="hi", model="gpt-4o-mini", purpose="standup"))


@pytest.mark.asyncio
async def test_openai_rate_limit_maps_to_rate_limit_error():
    transport = httpx.MockTransport(lambda _: httpx.Response(429, text="slow down"))
    provider = OpenAIProvider(api_key="sk-test", transport=transport)
    with pytest.raises(RateLimitError):
        await provider.complete(LLMRequest(prompt="hi", model="gpt-4o-mini", purpose="standup"))


@pytest.mark.asyncio
async def test_openai_unknown_model_returns_zero_cost():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "ok"}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 10},
            },
        )

    transport = httpx.MockTransport(handler)
    provider = OpenAIProvider(api_key="sk-test", transport=transport)
    resp = await provider.complete(
        LLMRequest(prompt="hi", model="some-future-model", purpose="standup")
    )
    assert resp.cost_usd == 0.0
