from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class LLMRequest:
    prompt: str
    model: str
    purpose: str
    max_tokens: int = 1500
    temperature: float = 0.2


@dataclass(frozen=True)
class LLMResponse:
    text: str
    prompt_tokens: int | None
    output_tokens: int | None
    cost_usd: float


class LLMProvider(Protocol):
    name: str

    async def complete(self, req: LLMRequest) -> LLMResponse: ...


class LLMError(Exception):
    """Base exception for LLM operations."""


class RateLimitError(LLMError):
    """Provider returned 429 / rate-limited."""


class ProviderError(LLMError):
    """Provider returned a non-recoverable error."""


class BudgetExceededError(LLMError):
    """Configured budget is exhausted."""


class AllProvidersFailedError(LLMError):
    """All providers in the chain failed."""
