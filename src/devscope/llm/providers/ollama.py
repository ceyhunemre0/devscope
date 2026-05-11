from __future__ import annotations

import httpx

from devscope.llm.base import LLMRequest, LLMResponse, ProviderError


class OllamaProvider:
    name = "ollama"

    def __init__(
        self,
        *,
        base_url: str = "http://localhost:11434",
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 120.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._transport = transport
        self._timeout = timeout

    async def complete(self, req: LLMRequest) -> LLMResponse:
        payload = {
            "model": req.model,
            "messages": [{"role": "user", "content": req.prompt}],
            "stream": False,
            "options": {
                "temperature": req.temperature,
                "num_predict": req.max_tokens,
            },
        }
        async with httpx.AsyncClient(
            base_url=self._base_url,
            transport=self._transport,
            timeout=self._timeout,
        ) as client:
            try:
                resp = await client.post("/api/chat", json=payload)
            except httpx.HTTPError as exc:
                raise ProviderError(f"ollama transport error: {exc}") from exc

        if resp.status_code != 200:
            raise ProviderError(f"ollama {resp.status_code}: {resp.text[:200]}")

        data = resp.json()
        return LLMResponse(
            text=data["message"]["content"],
            prompt_tokens=data.get("prompt_eval_count"),
            output_tokens=data.get("eval_count"),
            cost_usd=0.0,
        )
