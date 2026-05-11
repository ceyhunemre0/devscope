import httpx
import pytest

from devscope.llm.base import LLMRequest, ProviderError
from devscope.llm.providers.ollama import OllamaProvider


@pytest.mark.asyncio
async def test_ollama_complete_returns_response_text():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["json"] = request.content
        return httpx.Response(
            200,
            json={
                "message": {"content": "hello world"},
                "prompt_eval_count": 12,
                "eval_count": 34,
            },
        )

    transport = httpx.MockTransport(handler)
    provider = OllamaProvider(base_url="http://localhost:11434", transport=transport)
    resp = await provider.complete(LLMRequest(prompt="hi", model="llama3.1", purpose="standup"))

    assert resp.text == "hello world"
    assert resp.prompt_tokens == 12
    assert resp.output_tokens == 34
    assert resp.cost_usd == 0.0
    assert b'"model":"llama3.1"' in captured["json"]


@pytest.mark.asyncio
async def test_ollama_http_error_raises_provider_error():
    transport = httpx.MockTransport(lambda _: httpx.Response(500, text="boom"))
    provider = OllamaProvider(base_url="http://localhost:11434", transport=transport)
    with pytest.raises(ProviderError):
        await provider.complete(LLMRequest(prompt="hi", model="llama3.1", purpose="standup"))
