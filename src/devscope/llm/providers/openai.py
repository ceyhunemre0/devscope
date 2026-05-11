from __future__ import annotations

import httpx

from devscope.llm.base import (
    LLMRequest,
    LLMResponse,
    ProviderError,
    RateLimitError,
)
from devscope.secrets import get_secret

# Approximate USD pricing per 1M tokens for common chat models.
# Update as needed; falls back to 0.0 if model not found.
_PRICING_PER_1M: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1": (2.00, 8.00),
    "o4-mini": (1.10, 4.40),
}


def _cost_usd(model: str, prompt_tokens: int | None, output_tokens: int | None) -> float:
    if model not in _PRICING_PER_1M:
        return 0.0
    in_rate, out_rate = _PRICING_PER_1M[model]
    pt = prompt_tokens or 0
    ot = output_tokens or 0
    return (pt * in_rate + ot * out_rate) / 1_000_000


class OpenAIProvider:
    name = "openai"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str = "https://api.openai.com/v1",
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 120.0,
    ) -> None:
        self._api_key = api_key if api_key is not None else (get_secret("OPENAI_API_KEY") or "")
        self._base_url = base_url.rstrip("/")
        self._transport = transport
        self._timeout = timeout

    async def complete(self, req: LLMRequest) -> LLMResponse:
        if not self._api_key:
            raise ProviderError("OPENAI_API_KEY not set")

        payload = {
            "model": req.model,
            "messages": [{"role": "user", "content": req.prompt}],
            "temperature": req.temperature,
            "max_tokens": req.max_tokens,
        }
        headers = {"Authorization": f"Bearer {self._api_key}"}

        async with httpx.AsyncClient(
            base_url=self._base_url,
            transport=self._transport,
            timeout=self._timeout,
        ) as client:
            try:
                resp = await client.post("/chat/completions", json=payload, headers=headers)
            except httpx.HTTPError as exc:
                raise ProviderError(f"openai transport error: {exc}") from exc

        if resp.status_code == 429:
            raise RateLimitError(f"openai 429: {resp.text[:200]}")
        if resp.status_code != 200:
            raise ProviderError(f"openai {resp.status_code}: {resp.text[:200]}")

        data = resp.json()
        usage = data.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens")
        output_tokens = usage.get("completion_tokens")
        return LLMResponse(
            text=data["choices"][0]["message"]["content"],
            prompt_tokens=prompt_tokens,
            output_tokens=output_tokens,
            cost_usd=_cost_usd(req.model, prompt_tokens, output_tokens),
        )
