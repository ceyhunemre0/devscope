from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime

from devscope.llm.base import (
    AllProvidersFailedError,
    LLMProvider,
    LLMRequest,
    LLMResponse,
    ProviderError,
    RateLimitError,
)
from devscope.llm.budget import BudgetGuard
from devscope.storage.repositories import LLMCallRepo


class LLMRouter:
    def __init__(
        self,
        *,
        chain: list[LLMProvider],
        guard: BudgetGuard,
        repo: LLMCallRepo,
        model_for: dict[str, str],
        max_retries_per_provider: int = 3,
        retry_initial_seconds: float = 0.5,
    ) -> None:
        self._chain = chain
        self._guard = guard
        self._repo = repo
        self._model_for = model_for
        self._max_retries = max_retries_per_provider
        self._retry_initial = retry_initial_seconds

    async def complete(
        self,
        *,
        prompt: str,
        purpose: str,
        max_tokens: int = 1500,
        temperature: float = 0.2,
    ) -> LLMResponse:
        self._guard.check()
        last_error: Exception | None = None
        for provider in self._chain:
            model = self._model_for[provider.name]
            req = LLMRequest(
                prompt=prompt,
                model=model,
                purpose=purpose,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            for attempt in range(self._max_retries):
                start = time.perf_counter()
                try:
                    resp = await provider.complete(req)
                except RateLimitError as exc:
                    last_error = exc
                    if attempt == self._max_retries - 1:
                        self._record(
                            provider.name,
                            model,
                            purpose,
                            None,
                            None,
                            None,
                            _ms(start),
                            False,
                            str(exc),
                        )
                        break
                    await asyncio.sleep(self._retry_initial * (2**attempt))
                    continue
                except ProviderError as exc:
                    last_error = exc
                    self._record(
                        provider.name, model, purpose, None, None, None, _ms(start), False, str(exc)
                    )
                    break
                else:
                    self._record(
                        provider.name,
                        model,
                        purpose,
                        resp.prompt_tokens,
                        resp.output_tokens,
                        resp.cost_usd,
                        _ms(start),
                        True,
                        None,
                    )
                    return resp
        raise AllProvidersFailedError(f"all providers failed (last error: {last_error})")

    def _record(
        self,
        provider: str,
        model: str,
        purpose: str,
        prompt_tokens: int | None,
        output_tokens: int | None,
        cost_usd: float | None,
        duration_ms: int,
        succeeded: bool,
        error: str | None,
    ) -> None:
        self._repo.record(
            provider=provider,
            model=model,
            purpose=purpose,
            prompt_tokens=prompt_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
            duration_ms=duration_ms,
            succeeded=succeeded,
            error=error,
            called_at=datetime.now(UTC),
        )


def _ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)
